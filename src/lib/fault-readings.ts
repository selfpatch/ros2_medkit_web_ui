import { isRosbagSnapshot, type FreezeFrameSnapshot, type Snapshot } from '@/lib/types';

/**
 * What a fault's freeze frames read, in words a person can compare: "Closest obstacle
 * 0.96 m", "Free width 1.4 m", and the same topics read again now.
 *
 * A known message kind is one reading (a laser scan is its closest obstacle); a message
 * of text that holds JSON, or a small message of plain fields, is a reading per field.
 * Shapes (poses, transforms, polygons) have no reading here: they stay in the raw
 * snapshots.
 */

export type ReadingValue = number | string | boolean | null;

/** Which way of a reading is better, for a kind that has one */
export type Better = 'lower' | 'higher';

export interface Reading {
    /** The same field of the same topic in every read: `topic` plus its path */
    key: string;
    label: string;
    /** Words of the object the field sits in, to tell two fields of one name apart */
    context?: string;
    topic: string;
    value: ReadingValue;
    unit?: string;
    /** A spread, said as "±0.14 m" */
    spread?: boolean;
    better?: Better;
    /**
     * Where it comes in the table, lower first: 0 a number the fault's own description
     * quotes, 1 a known measure or a state, 2 a measured number, 3 the rest
     */
    rank: 0 | 1 | 2 | 3;
    /** Read from an entity that was disconnected: its last known value, of unknown age */
    lastKnown?: boolean;
}

export interface ReadingRow {
    key: string;
    label: string;
    then: Reading;
    now: Reading | null;
}

type Message = Record<string, unknown>;

const isRecord = (value: unknown): value is Message =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function valueAt(value: unknown, ...path: string[]): unknown {
    let at = value;
    for (const key of path) {
        if (!isRecord(at)) return undefined;
        at = at[key];
    }
    return at;
}

function numberAt(value: unknown, ...path: string[]): number | undefined {
    const at = valueAt(value, ...path);
    return typeof at === 'number' && Number.isFinite(at) ? at : undefined;
}

/** "free_width" → "Free width", "nearestObstacle" → "Nearest obstacle", "/navigation/status" → "Navigation status" */
export function words(name: string): string {
    const spaced = name
        .replace(/^\/+/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_/.-]+/g, ' ')
        .trim()
        .toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A std_msgs message's lone `data` unwrapped, and text holding JSON read as JSON */
export function unwrapMessage(message: unknown): unknown {
    let value = message;
    if (isRecord(value) && Object.keys(value).length === 1 && 'data' in value) value = value.data;
    if (typeof value === 'string') {
        const text = value.trim();
        if (text.startsWith('{') || text.startsWith('[')) {
            try {
                return JSON.parse(text);
            } catch {
                return value;
            }
        }
    }
    return value;
}

// Names that count things: a number of them has no unit, whatever else the name says
// ("obstacle_count", "range_errors", "retry_attempts", "queue_length"). Not "error" or
// "total": a distance's error or total is a distance ("distance_error", "total_distance").
const COUNTS = /(^|_)(count|counts|errors|attempts?|retries|queue|num|number|index|id)(_|$)/;

// The unit a field's name says, where a whole word of it says one.
function unitOf(key: string): string | undefined {
    const name = key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
    if (COUNTS.test(name)) return undefined;
    if (/(^|_)angular(_|$)/.test(name)) return /(^|_)(speed|velocity)(_|$)/.test(name) ? 'rad/s' : undefined;
    if (/(^|_)(speed|velocity)(_|$)/.test(name)) return 'm/s';
    if (/(^|_)temp(_|$|erature)/.test(name)) return '°C';
    // Before the battery: a battery's voltage is in volts.
    if (/(^|_)(voltage|volts?)(_|$)/.test(name)) return 'V';
    if (/(^|_)(percent|percentage|soc)(_|$)/.test(name) || /(^|_)(battery|charge)(_level)?$/.test(name)) return '%';
    if (/(^|_)(width|clearance|distance|obstacle|range|length|radius|gap|margin)(_|$)/.test(name)) return 'm';
    if (/^(x|y|z)(_|$)/.test(name)) return 'm';
    if (/(^|_)(for|duration|elapsed|timeout|age|secs?|seconds)$/.test(name)) return 's';
    return undefined;
}

const STATE_KEYS = /^(mode|state|status|phase|level)$/i;
const SKIPPED_KEYS = new Set(['header', 'stamp']);

/** A message of plain fields, a field a reading: numbers, yes/no and short words */
function fieldsOf(topic: string, value: unknown): Reading[] {
    const out: Reading[] = [];
    const walk = (at: unknown, path: string[], context?: string) => {
        if (!isRecord(at) || path.length > 2) return;
        for (const [key, field] of Object.entries(at)) {
            if (SKIPPED_KEYS.has(key)) continue;
            const here = [...path, key];
            const reading = { key: `${topic}#${here.join('.')}`, label: words(key), context, topic };
            if (typeof field === 'number' && Number.isFinite(field)) {
                const unit = unitOf(key);
                out.push({ ...reading, value: field, unit, rank: unit ? 2 : 3 });
            } else if (typeof field === 'boolean' || field === null) {
                out.push({ ...reading, value: field, rank: 3 });
            } else if (typeof field === 'string' && field.length > 0 && field.length <= 40) {
                out.push({ ...reading, value: field, rank: STATE_KEYS.test(key) ? 1 : 3 });
            } else if (isRecord(field)) {
                walk(field, here, words(key));
            }
        }
    };
    walk(value, []);
    return out;
}

function laserNearest(message: Message): number | null | undefined {
    if (!Array.isArray(message.ranges)) return undefined;
    const low = numberAt(message, 'range_min') ?? 0;
    const high = numberAt(message, 'range_max') ?? Number.POSITIVE_INFINITY;
    const hits = message.ranges.filter(
        (r): r is number => typeof r === 'number' && Number.isFinite(r) && r >= low && r <= high
    );
    return hits.length ? Math.min(...hits) : null;
}

function speedOf(twist: unknown): number | undefined {
    const x = numberAt(twist, 'linear', 'x');
    return x === undefined ? undefined : Math.hypot(x, numberAt(twist, 'linear', 'y') ?? 0);
}

function pathLength(message: Message): number | undefined {
    if (!Array.isArray(message.poses)) return undefined;
    const points = message.poses.map((pose) => [
        numberAt(pose, 'pose', 'position', 'x'),
        numberAt(pose, 'pose', 'position', 'y'),
    ]);
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
        const [ax, ay] = points[i - 1]!;
        const [bx, by] = points[i]!;
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) return undefined;
        length += Math.hypot(bx - ax, by - ay);
    }
    return length;
}

/** How many items a message's list holds */
const countOf =
    (field: string) =>
    (message: Message): number | undefined =>
        Array.isArray(message[field]) ? message[field].length : undefined;

/** What a known kind of message reads, as one reading */
interface Measure {
    label: string;
    /** The level: null when the message measured nothing, undefined when it is not in a shape this reads */
    read: (message: Message) => ReadingValue | undefined;
    unit?: string;
    better?: Better;
}

// Keyed by full type: a package's own `Temperature` or `Path` is its own message, read by its fields.
const MEASURES: Record<string, Measure> = {
    'sensor_msgs/msg/LaserScan': { label: 'Closest obstacle', read: laserNearest, unit: 'm' },
    'nav_msgs/msg/Odometry': { label: 'Speed', read: (m) => speedOf(valueAt(m, 'twist', 'twist')), unit: 'm/s' },
    'geometry_msgs/msg/Twist': { label: 'Speed it was told', read: speedOf, unit: 'm/s' },
    'geometry_msgs/msg/TwistStamped': { label: 'Speed it was told', read: (m) => speedOf(m.twist), unit: 'm/s' },
    'geometry_msgs/msg/PoseWithCovarianceStamped': {
        label: 'Position uncertainty',
        read: (m) => {
            const covariance = valueAt(m, 'pose', 'covariance');
            if (!Array.isArray(covariance)) return undefined;
            return Math.sqrt(Math.max(Number(covariance[0]) || 0, Number(covariance[7]) || 0));
        },
        unit: 'm',
        better: 'lower',
    },
    'sensor_msgs/msg/BatteryState': {
        label: 'Battery',
        read: (m) => {
            const share = numberAt(m, 'percentage');
            return share === undefined ? undefined : share <= 1 ? share * 100 : share;
        },
        unit: '%',
        better: 'higher',
    },
    'sensor_msgs/msg/Temperature': {
        label: 'Temperature',
        read: (m) => numberAt(m, 'temperature'),
        unit: '°C',
        better: 'lower',
    },
    'sensor_msgs/msg/Range': { label: 'Distance', read: (m) => numberAt(m, 'range'), unit: 'm' },
    'action_msgs/msg/GoalStatusArray': {
        label: 'Failed navigation goals',
        read: (m) =>
            Array.isArray(m.status_list) ? m.status_list.filter((g) => numberAt(g, 'status') === 6).length : undefined,
        better: 'lower',
    },
    'diagnostic_msgs/msg/DiagnosticArray': {
        label: 'Warnings and errors',
        read: (m) =>
            Array.isArray(m.status)
                ? m.status.filter((s) => {
                      const level = valueAt(s, 'level');
                      const n = typeof level === 'string' ? level.charCodeAt(0) : Number(level);
                      return n >= 1 && n <= 3;
                  }).length
                : undefined,
        better: 'lower',
    },
    'nav_msgs/msg/Path': { label: 'Planned path', read: pathLength, unit: 'm' },
    'vision_msgs/msg/Detection2DArray': { label: 'Objects seen', read: countOf('detections') },
    'vision_msgs/msg/Detection3DArray': { label: 'Objects seen', read: countOf('detections') },
};

// Shapes and streams that have no reading in words: they stay in the raw snapshots.
const SHAPES = new Set([
    ...[
        'Pose',
        'PoseStamped',
        'PoseArray',
        'Point',
        'PointStamped',
        'Quaternion',
        'Vector3',
        'Vector3Stamped',
        'Transform',
        'TransformStamped',
        'Polygon',
        'PolygonStamped',
        'Accel',
        'Wrench',
    ].map((name) => `geometry_msgs/msg/${name}`),
    ...['Imu', 'Image', 'CompressedImage', 'PointCloud', 'PointCloud2', 'CameraInfo', 'JointState'].map(
        (name) => `sensor_msgs/msg/${name}`
    ),
    'tf2_msgs/msg/TFMessage',
    'nav_msgs/msg/OccupancyGrid',
    'visualization_msgs/msg/Marker',
    'visualization_msgs/msg/MarkerArray',
    'rcl_interfaces/msg/ParameterEvent',
    'rcl_interfaces/msg/Log',
    'rosgraph_msgs/msg/Clock',
]);

/** The readings of one message of a topic, in its message type's words */
export function readingsOf(topic: string, type: string | null | undefined, message: unknown): Reading[] {
    const kind = type ?? '';
    if (SHAPES.has(kind)) return [];
    const measure = MEASURES[kind];
    if (measure && isRecord(message)) {
        const value = measure.read(message);
        // A message of a known kind this cannot read is read by its fields instead.
        if (value !== undefined) {
            return [
                {
                    key: `${topic}#`,
                    label: measure.label,
                    topic,
                    value,
                    unit: measure.unit,
                    better: measure.better,
                    spread: kind === 'geometry_msgs/msg/PoseWithCovarianceStamped',
                    rank: 1,
                },
            ];
        }
    }
    const value = unwrapMessage(message);
    const leaf = topic.split('/').pop() || topic;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return [
            {
                key: `${topic}#`,
                label: words(leaf),
                topic,
                value,
                unit: typeof value === 'number' ? unitOf(leaf) : undefined,
                rank: 2,
            },
        ];
    }
    if (typeof value === 'string') {
        return value.length > 0 && value.length <= 40
            ? [{ key: `${topic}#`, label: words(leaf), topic, value, rank: 3 }]
            : [];
    }
    return fieldsOf(topic, value);
}

// Numbers without float noise or trailing zeros: 1.4, 0.45, 91.4, 1794.
export function shortNumber(value: number): string {
    const size = Math.abs(value);
    const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return String(Number(value.toFixed(digits)));
}

/** A reading's value with its unit: "1.4 m", "±0.14 m", "82%", "yes", "none" */
export function formatReading(reading: Reading): string {
    const { value, unit } = reading;
    if (value === null) return 'none';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'string') return value;
    const number = `${reading.spread ? '±' : ''}${shortNumber(value)}`;
    if (!unit) return number;
    return unit === '%' || unit === '°C' ? `${number}${unit}` : `${number} ${unit}`;
}

/** Whether the reading now is better, worse or the same as then, where its kind has a better way */
export function changeOf(then: Reading, now: Reading | null): 'better' | 'worse' | 'same' | null {
    if (!now || !then.better || typeof then.value !== 'number' || typeof now.value !== 'number') return null;
    if (Math.abs(now.value - then.value) <= Math.max(Math.abs(then.value), 1e-9) * 0.05) return 'same';
    return (then.better === 'lower') === now.value < then.value ? 'better' : 'worse';
}

/**
 * When a snapshot was taken, in ms, or null without a time. The gateway writes the epoch
 * for a capture that carried no time, which says nothing either.
 */
export function snapshotTime(snapshot: Snapshot): number | null {
    const at = Date.parse(snapshot['x-medkit']?.captured_at ?? '');
    return Number.isFinite(at) && at > 0 ? at : null;
}

const isStartupFrame = (frame: FreezeFrameSnapshot) => frame['x-medkit']?.capture_origin === 'startup';

/** The topic a frame caught, and its type. An entity frame catches no topic: its name stands in. */
function frameTopic(frame: FreezeFrameSnapshot): { topic: string; type: string | null } {
    return { topic: frame['x-medkit']?.topic || frame.name, type: frame['x-medkit']?.message_type || null };
}

/** A frame's whole message: medkit's full copy where it kept one, else its data */
function frameMessage(frame: FreezeFrameSnapshot): unknown {
    const full = frame['x-medkit']?.full_data;
    return full !== undefined && full !== null ? full : frame.data;
}

/**
 * The freeze frames of the fault's newest capture: medkit takes one of each topic when the
 * fault is confirmed, a few hundred milliseconds apart, and keeps the captures of earlier
 * times beside them. Frames taken within 10 s of the newest one count as its capture; of
 * those, one a topic (an entity frame: one an entity), the newest.
 */
export function newestCapture(snapshots: Snapshot[]): FreezeFrameSnapshot[] {
    const frames = snapshots.filter((s): s is FreezeFrameSnapshot => s.type === 'freeze_frame');
    if (frames.length === 0) return [];
    const timeOf = (frame: FreezeFrameSnapshot) => snapshotTime(frame) ?? 0;
    const newest = Math.max(...frames.map(timeOf));
    const byTopic = new Map<string, FreezeFrameSnapshot>();
    for (const frame of [...frames].sort((a, b) => timeOf(b) - timeOf(a))) {
        if (newest - timeOf(frame) > 10_000) continue;
        const { topic } = frameTopic(frame);
        if (!byTopic.has(topic)) byTopic.set(topic, frame);
    }
    return [...byTopic.values()];
}

/**
 * When the newest capture was taken: its earliest frame with a time, or null without one.
 * Frames read at gateway start are left out: their time is the gateway's start, not the
 * fault's coming.
 */
export function captureTime(frames: FreezeFrameSnapshot[]): number | null {
    const times = frames
        .filter((frame) => !isStartupFrame(frame))
        .map(snapshotTime)
        .filter((at): at is number => at !== null);
    return times.length ? Math.min(...times) : null;
}

/**
 * When the fault's newest time came, as medkit captured it: its newest freeze frames, else
 * its newest recording; null without either. The page and the list date a fault by it.
 */
export function captureOf(snapshots: Snapshot[]): number | null {
    const recorded = snapshots
        .filter(isRosbagSnapshot)
        .map(snapshotTime)
        .filter((at): at is number => at !== null);
    return captureTime(newestCapture(snapshots)) ?? (recorded.length ? Math.max(...recorded) : null);
}

/** Whether every frame of a capture was read at gateway start, none when the fault came */
export function isStartupCapture(frames: FreezeFrameSnapshot[]): boolean {
    return frames.length > 0 && frames.every(isStartupFrame);
}

function numbersIn(text: string): number[] {
    return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n !== 0);
}

/**
 * The table of readings: one row a reading of the newest capture, beside the same reading
 * now. Readings whose number the fault's own words quote come first, then known measures
 * and states, then measured numbers, then the rest. A reading two topics both carry with
 * one value shows once; readings of one name and different values each say whose they are.
 */
export function readingRows(
    frames: FreezeFrameSnapshot[],
    live: ReadonlyMap<string, unknown>,
    description: string
): ReadingRow[] {
    const quoted = numbersIn(description);
    const rows: (ReadingRow & { rank: Reading['rank'] })[] = [];
    for (const frame of frames) {
        const { topic, type } = frameTopic(frame);
        const lastKnown = frame['x-medkit']?.connected === false;
        const now = live.has(topic) ? readingsOf(topic, type, live.get(topic)) : [];
        for (const reading of readingsOf(topic, type, frameMessage(frame))) {
            const then = lastKnown ? { ...reading, lastKnown } : reading;
            const value = then.value;
            const quotes = typeof value === 'number' && quoted.some((n) => Math.abs(n - value) < 0.005);
            rows.push({
                key: then.key,
                label: then.label,
                then,
                now: now.find((one) => one.key === then.key) ?? null,
                rank: quotes ? 0 : then.rank,
            });
        }
    }
    // One message can carry a value twice (a clearance at its top and inside what blocks it):
    // it shows once. The same name on two topics is two readings, each read again live.
    const shown: typeof rows = [];
    for (const row of rows) {
        const same = shown.filter((one) => one.label === row.label && one.then.topic === row.then.topic);
        if (!same.some((one) => formatReading(one.then) === formatReading(row.then))) shown.push(row);
    }
    const clashes = (labels: string[]) => new Set(labels.filter((label, i, all) => all.indexOf(label) !== i));
    const clashing = clashes(shown.map((row) => row.label));
    const named = shown
        .sort((a, b) => a.rank - b.rank)
        .map((row) => ({
            row,
            label: !clashing.has(row.label)
                ? row.label
                : row.then.context
                  ? `${row.then.context} ${row.label.toLowerCase()}`
                  : `${row.label} (${words(row.then.topic)})`,
        }));
    // Two topics of one shape give the same context too: their topic tells them apart.
    const stillClashing = clashes(named.map((one) => one.label));
    return named.map(({ row, label }) => ({
        key: row.key,
        label: stillClashing.has(label) && row.then.context ? `${label} (${words(row.then.topic)})` : label,
        then: row.then,
        now: row.now,
    }));
}
