import type { FreezeFrameSnapshot, Snapshot } from '@/lib/types';

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
    /** Which way is better, where one is */
    better?: 'lower' | 'higher';
    /** Lower comes first: 1 a known measure or a state, 2 a measured number, 3 the rest */
    rank: number;
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

function numberAt(value: unknown, ...path: string[]): number | null {
    let at = value;
    for (const key of path) {
        if (!isRecord(at)) return null;
        at = at[key];
    }
    return typeof at === 'number' && Number.isFinite(at) ? at : null;
}

/** "sensor_msgs/msg/LaserScan" → "LaserScan" */
export function shortType(type: string | null | undefined): string {
    return type?.split('/').pop() ?? '';
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

// The unit a field's name says, where it says one.
function unitOf(key: string): string | undefined {
    const name = key.toLowerCase();
    if (/(^|_)(speed|velocity)(_|$)/.test(name)) return 'm/s';
    if (/temp/.test(name)) return '°C';
    if (/(battery|percent|charge)/.test(name)) return '%';
    if (/voltage/.test(name)) return 'V';
    if (/(width|clearance|distance|obstacle|range|length|radius|gap|margin)/.test(name)) return 'm';
    if (/^(x|y|z)(_|$)/.test(name)) return 'm';
    if (/(_for|duration|elapsed|timeout|(^|_)age|(^|_)secs?)$/.test(name)) return 's';
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

function laserNearest(message: Message): number | null {
    const ranges = Array.isArray(message.ranges) ? message.ranges : [];
    const low = numberAt(message, 'range_min') ?? 0;
    const high = numberAt(message, 'range_max') ?? Number.POSITIVE_INFINITY;
    const hits = ranges.filter(
        (r): r is number => typeof r === 'number' && Number.isFinite(r) && r >= low && r <= high
    );
    return hits.length ? Math.min(...hits) : null;
}

function speedOf(twist: unknown): number | null {
    const x = numberAt(twist, 'linear', 'x');
    const y = numberAt(twist, 'linear', 'y') ?? 0;
    return x === null ? null : Math.hypot(x, y);
}

function pathLength(message: Message): number | null {
    const poses = Array.isArray(message.poses) ? message.poses : [];
    let length = 0;
    for (let i = 1; i < poses.length; i += 1) {
        const a = [numberAt(poses[i - 1], 'pose', 'position', 'x'), numberAt(poses[i - 1], 'pose', 'position', 'y')];
        const b = [numberAt(poses[i], 'pose', 'position', 'x'), numberAt(poses[i], 'pose', 'position', 'y')];
        if (a.some((v) => v === null) || b.some((v) => v === null)) return null;
        length += Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
    }
    return length;
}

// What a known kind of message reads, as one reading: its name, how to get the level from
// the message, its unit and which way is better.
type Measure = [label: string, read: (message: Message) => ReadingValue, unit?: string, better?: 'lower' | 'higher'];

const MEASURES: Record<string, Measure> = {
    LaserScan: ['Closest obstacle', laserNearest, 'm'],
    Odometry: ['Speed', (m) => speedOf((m.twist as Message | undefined)?.twist), 'm/s'],
    Twist: ['Speed it was told', (m) => speedOf(m), 'm/s'],
    TwistStamped: ['Speed it was told', (m) => speedOf(m.twist), 'm/s'],
    PoseWithCovarianceStamped: [
        'Position uncertainty',
        (m) => {
            const covariance = (m.pose as Message | undefined)?.covariance;
            if (!Array.isArray(covariance)) return null;
            return Math.sqrt(Math.max(Number(covariance[0]) || 0, Number(covariance[7]) || 0));
        },
        'm',
        'lower',
    ],
    BatteryState: [
        'Battery',
        (m) => {
            const share = numberAt(m, 'percentage');
            return share === null ? null : share <= 1 ? share * 100 : share;
        },
        '%',
        'higher',
    ],
    Temperature: ['Temperature', (m) => numberAt(m, 'temperature'), '°C', 'lower'],
    Range: ['Distance', (m) => numberAt(m, 'range'), 'm'],
    GoalStatusArray: [
        'Failed navigation goals',
        (m) => (Array.isArray(m.status_list) ? m.status_list : []).filter((g) => numberAt(g, 'status') === 6).length,
        undefined,
        'lower',
    ],
    DiagnosticArray: [
        'Warnings and errors',
        (m) =>
            (Array.isArray(m.status) ? m.status : []).filter((s) => {
                const level = isRecord(s) ? s.level : undefined;
                const n = typeof level === 'string' ? level.charCodeAt(0) : Number(level);
                return n >= 1 && n <= 3;
            }).length,
        undefined,
        'lower',
    ],
    Path: ['Planned path', pathLength, 'm'],
    Detection2DArray: ['Objects seen', (m) => (Array.isArray(m.detections) ? m.detections.length : null)],
    Detection3DArray: ['Objects seen', (m) => (Array.isArray(m.detections) ? m.detections.length : null)],
};

// Shapes and streams that have no reading in words: they stay in the raw snapshots.
const SHAPES =
    /^(Pose|PoseStamped|PoseArray|Point|PointStamped|Quaternion|Vector3|Vector3Stamped|Transform|TransformStamped|TFMessage|Polygon|PolygonStamped|Accel|Wrench|Imu|Image|CompressedImage|PointCloud2?|OccupancyGrid|Marker|MarkerArray|CameraInfo|JointState|ParameterEvent|Log|Clock)$/;

/** The readings of one message of a topic, in its message type's words */
export function readingsOf(topic: string, type: string | null | undefined, message: unknown): Reading[] {
    const kind = shortType(type);
    if (SHAPES.test(kind)) return [];
    const measure = MEASURES[kind];
    if (measure) {
        if (!isRecord(message)) return [];
        const [label, read, unit, better] = measure;
        return [
            {
                key: `${topic}#`,
                label,
                topic,
                value: read(message),
                unit,
                better,
                spread: kind === 'PoseWithCovarianceStamped',
                rank: 1,
            },
        ];
    }
    const value = unwrapMessage(message);
    if (typeof value === 'number' || typeof value === 'boolean') {
        return [
            {
                key: `${topic}#`,
                label: words(topic.split('/').pop() ?? topic),
                topic,
                value,
                unit: typeof value === 'number' ? unitOf(topic.split('/').pop() ?? '') : undefined,
                rank: 2,
            },
        ];
    }
    if (typeof value === 'string') {
        return value.length > 0 && value.length <= 40
            ? [{ key: `${topic}#`, label: words(topic.split('/').pop() ?? topic), topic, value, rank: 3 }]
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

const capturedAt = (snapshot: Snapshot): number => {
    const at = Date.parse(snapshot['x-medkit']?.captured_at ?? '');
    return Number.isNaN(at) ? 0 : at;
};

/**
 * The freeze frames of the fault's newest capture: medkit takes one of each topic when the
 * fault is confirmed, a few hundred milliseconds apart, and keeps the captures of earlier
 * times beside them. One frame a topic, the newest.
 */
export function newestCapture(snapshots: Snapshot[]): FreezeFrameSnapshot[] {
    const frames = snapshots.filter((s): s is FreezeFrameSnapshot => s.type === 'freeze_frame');
    if (frames.length === 0) return [];
    const newest = Math.max(...frames.map(capturedAt));
    const byTopic = new Map<string, FreezeFrameSnapshot>();
    for (const frame of [...frames].sort((a, b) => capturedAt(b) - capturedAt(a))) {
        if (newest - capturedAt(frame) > 10_000) continue;
        const topic = frame['x-medkit']?.topic ?? frame.name;
        if (!byTopic.has(topic)) byTopic.set(topic, frame);
    }
    return [...byTopic.values()];
}

/** When the newest capture was taken, or null without one */
export function captureTime(frames: FreezeFrameSnapshot[]): number | null {
    const times = frames.map(capturedAt).filter((at) => at > 0);
    return times.length ? Math.min(...times) : null;
}

/** A frame's whole message: medkit's full copy where it kept one, else its data */
export function frameMessage(frame: FreezeFrameSnapshot): unknown {
    const full = frame['x-medkit']?.full_data;
    return full !== undefined && full !== null ? full : frame.data;
}

/** The topic a frame caught, and its type */
export function frameTopic(frame: FreezeFrameSnapshot): { topic: string; type: string | null } {
    return { topic: frame['x-medkit']?.topic ?? frame.name, type: frame['x-medkit']?.message_type ?? null };
}

function numbersIn(text: string): number[] {
    return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n !== 0);
}

/**
 * The table of readings: one row a reading of the newest capture, beside the same reading
 * now. Readings whose number the fault's own words quote come first, then known measures
 * and states, then measured numbers, then the rest. A reading two topics both carry with
 * one value shows once; two of one name and different values say whose they are.
 */
export function readingRows(
    frames: FreezeFrameSnapshot[],
    live: ReadonlyMap<string, unknown>,
    description: string
): ReadingRow[] {
    const quoted = numbersIn(description);
    const rows: (ReadingRow & { rank: number })[] = [];
    for (const frame of frames) {
        const { topic, type } = frameTopic(frame);
        const now = live.has(topic) ? readingsOf(topic, type, live.get(topic)) : [];
        for (const then of readingsOf(topic, type, frameMessage(frame))) {
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
    const shown: (ReadingRow & { rank: number })[] = [];
    for (const row of rows) {
        const same = shown.filter((one) => one.label === row.label);
        if (same.some((one) => formatReading(one.then) === formatReading(row.then))) continue;
        if (same.length > 0) {
            const tell = (one: ReadingRow) =>
                one.then.context
                    ? `${one.then.context} ${one.label.toLowerCase()}`
                    : `${one.label} (${words(one.then.topic)})`;
            row.label = tell(row);
        }
        shown.push(row);
    }
    return shown
        .sort((a, b) => a.rank - b.rank)
        .map((row) => ({ key: row.key, label: row.label, then: row.then, now: row.now }));
}
