import { describe, expect, it } from 'vitest';
import {
    captureTime,
    changeOf,
    formatReading,
    isStartupCapture,
    newestCapture,
    readingRows,
    readingsOf,
    shortNumber,
    snapshotTime,
    unwrapMessage,
    words,
} from './fault-readings';
import type { FreezeFrameSnapshot, Snapshot } from './types';

// What AMR-07's lane navigator publishes while a forklift blocks its lane: JSON in a String.
const NAVIGATION_STATUS = JSON.stringify({
    mode: 'held',
    speed: 0.0,
    held_for: 4.8,
    blocked: { free_width: 1.4, needs_width: 1.6, obstacle: 'forklift', clearance: 0.5 },
    clearance: 0.5,
});

function frame(topic: string, type: string, message: unknown, capturedAt: string): FreezeFrameSnapshot {
    return {
        type: 'freeze_frame',
        name: topic.split('/').pop() ?? topic,
        data: message,
        'x-medkit': { topic, message_type: type, full_data: message, captured_at: capturedAt },
    };
}

describe('readingsOf', () => {
    it('reads JSON text field by field, with the unit each name says', () => {
        const readings = readingsOf('/navigation/status', 'std_msgs/msg/String', { data: NAVIGATION_STATUS });
        const said = Object.fromEntries(readings.map((r) => [r.label, formatReading(r)]));
        expect(said).toMatchObject({
            Mode: 'held',
            Speed: '0 m/s',
            'Held for': '4.8 s',
            'Free width': '1.4 m',
            'Needs width': '1.6 m',
            Obstacle: 'forklift',
        });
        // A nested field says the object it sits in, to tell it from a field of the same name.
        expect(readings.find((r) => r.key === '/navigation/status#blocked.clearance')?.context).toBe('Blocked');
    });

    it('reads a laser scan as its closest obstacle, leaving out readings out of range', () => {
        const scan = { range_min: 0.12, range_max: 3.5, ranges: [0.05, 1.8, 0.96, Infinity, null] };
        const [reading] = readingsOf('/scan', 'sensor_msgs/msg/LaserScan', scan);
        expect(reading?.label).toBe('Closest obstacle');
        expect(formatReading(reading!)).toBe('0.96 m');
    });

    it('reads a pose estimate as the spread of where it may be', () => {
        const covariance = Array.from({ length: 36 }, () => 0);
        covariance[0] = 0.0121;
        covariance[7] = 0.0049;
        const [reading] = readingsOf('/amcl_pose', 'geometry_msgs/msg/PoseWithCovarianceStamped', {
            pose: { covariance },
        });
        expect(formatReading(reading!)).toBe('±0.11 m');
        expect(reading?.better).toBe('lower');
    });

    it('has no reading for shapes, which stay in the raw snapshots', () => {
        expect(readingsOf('/tf', 'tf2_msgs/msg/TFMessage', { transforms: [] })).toEqual([]);
        expect(readingsOf('/safety/field', 'geometry_msgs/msg/PolygonStamped', { polygon: {} })).toEqual([]);
    });

    it('gives a unit only where the whole word of a name says one', () => {
        const readings = readingsOf('/robot/status', 'robot_msgs/msg/Status', {
            retry_attempts: 3,
            battery_voltage: 24.1,
            battery: 82,
            obstacle_count: 2,
            queue_length: 5,
            range_errors: 1,
            angular_velocity: 0.4,
            linear_velocity: 0.5,
            motor_temperature: 61,
            free_width: 1.4,
            total_distance: 12.5,
            distance_error: 0.3,
        });
        const said = Object.fromEntries(readings.map((r) => [r.label, formatReading(r)]));
        expect(said).toEqual({
            'Retry attempts': '3',
            'Battery voltage': '24.1 V',
            Battery: '82%',
            'Obstacle count': '2',
            'Queue length': '5',
            'Range errors': '1',
            'Angular velocity': '0.4 rad/s',
            'Linear velocity': '0.5 m/s',
            'Motor temperature': '61°C',
            'Free width': '1.4 m',
            'Total distance': '12.5 m',
            'Distance error': '0.3 m',
        });
    });

    it('knows a message kind by its full type, so a custom one of the same name shows its own fields', () => {
        const custom = readingsOf('/motor/temp', 'motor_msgs/msg/Temperature', { celsius: 61 });
        expect(custom.map((r) => [r.label, formatReading(r)])).toEqual([['Celsius', '61']]);

        const known = readingsOf('/motor/temp', 'sensor_msgs/msg/Temperature', { temperature: 61, variance: 0 });
        expect(known.map((r) => [r.label, formatReading(r)])).toEqual([['Temperature', '61°C']]);

        // A custom shape-named message is a message of fields, not a shape.
        expect(readingsOf('/goal', 'robot_msgs/msg/Pose', { x: 1.5 }).map((r) => r.label)).toEqual(['X']);
    });

    it('shows the fields of a known kind it cannot read, and "none" for one that measured nothing', () => {
        const unreadable = readingsOf('/motor/temp', 'sensor_msgs/msg/Temperature', { kelvin: 334 });
        expect(unreadable.map((r) => r.label)).toEqual(['Kelvin']);

        const [nothing] = readingsOf('/scan', 'sensor_msgs/msg/LaserScan', {
            range_min: 0.12,
            range_max: 3.5,
            ranges: [Infinity, 0.01],
        });
        expect(nothing?.label).toBe('Closest obstacle');
        expect(formatReading(nothing!)).toBe('none');
    });
});

describe('snapshotTime', () => {
    it('is the time a snapshot was taken, and null for none, nonsense or the epoch', () => {
        const at = (captured_at?: string): Snapshot => ({
            type: 'freeze_frame',
            name: 'scan',
            data: {},
            'x-medkit': { topic: '/scan', message_type: '', captured_at },
        });
        expect(snapshotTime(at('2026-11-01T21:30:42.678Z'))).toBe(Date.parse('2026-11-01T21:30:42.678Z'));
        expect(snapshotTime(at(undefined))).toBeNull();
        expect(snapshotTime(at('not a time'))).toBeNull();
        expect(snapshotTime(at('1970-01-01T00:00:00Z'))).toBeNull();
        expect(snapshotTime({ type: 'freeze_frame', name: 'scan', data: {} })).toBeNull();
    });
});

describe('readingRows', () => {
    it('puts the readings the fault quotes first, beside what they read now', () => {
        const frames = [
            frame('/scan', 'sensor_msgs/msg/LaserScan', { ranges: [0.96] }, '2026-11-01T21:30:42.678Z'),
            frame('/navigation/status', 'std_msgs/msg/String', { data: NAVIGATION_STATUS }, '2026-11-01T21:30:43.374Z'),
        ];
        const live = new Map([['/scan', { ranges: [0.5] }]]);
        const rows = readingRows(frames, live, 'Lane blocked by a forklift: 1.40 m free, needs 1.60 m');

        expect(rows.slice(0, 2).map((row) => row.label)).toEqual(['Free width', 'Needs width']);
        const scan = rows.find((row) => row.label === 'Closest obstacle');
        expect(scan && formatReading(scan.now!)).toBe('0.5 m');
        // One reading two places carry with one value shows once.
        expect(rows.filter((row) => row.label.endsWith('learance'))).toHaveLength(1);
    });

    it('says whose each of two same-named readings is, not just the later one', () => {
        const frames = [
            frame('/left/status', 'std_msgs/msg/String', { data: '{"speed": 0.4}' }, '2026-11-01T21:30:42.678Z'),
            frame('/right/status', 'std_msgs/msg/String', { data: '{"speed": 0.9}' }, '2026-11-01T21:30:42.700Z'),
        ];
        const labels = readingRows(frames, new Map(), '').map((row) => row.label);
        expect(labels).toEqual(['Speed (Left status)', 'Speed (Right status)']);
    });

    it('marks the readings of a disconnected entity as last known', () => {
        const plc: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'plc',
            data: '{"pressure": 4.2}',
            'x-medkit': {
                topic: '',
                message_type: '',
                full_data: { pressure: 4.2 },
                captured_at: '2026-11-01T21:30:42.678Z',
                connected: false,
            },
        };
        const [row] = readingRows([plc], new Map(), '');
        expect(row?.then.lastKnown).toBe(true);
        expect(row?.then.topic).toBe('plc');
    });
});

describe('newestCapture', () => {
    it("keeps the newest capture's frames, one a topic", () => {
        const snapshots: Snapshot[] = [
            frame('/odom', 'nav_msgs/msg/Odometry', {}, '2026-11-01T21:45:24.350Z'),
            frame('/odom', 'nav_msgs/msg/Odometry', {}, '2026-11-01T21:46:42.365Z'),
            frame('/scan', 'sensor_msgs/msg/LaserScan', {}, '2026-11-01T21:46:42.550Z'),
            frame('/scan', 'sensor_msgs/msg/LaserScan', {}, '2026-11-01T21:45:24.649Z'),
        ];
        const frames = newestCapture(snapshots);
        expect(frames.map((f) => [f['x-medkit']?.topic, f['x-medkit']?.captured_at])).toEqual([
            ['/scan', '2026-11-01T21:46:42.550Z'],
            ['/odom', '2026-11-01T21:46:42.365Z'],
        ]);
    });

    it("keeps each entity's frame: entity frames carry no topic, only their name", () => {
        const entity = (name: string): FreezeFrameSnapshot => ({
            type: 'freeze_frame',
            name,
            data: '{}',
            'x-medkit': { topic: '', message_type: '', full_data: {}, captured_at: '2026-11-01T21:46:42.365Z' },
        });
        expect(newestCapture([entity('plc_a'), entity('plc_b')]).map((f) => f.name)).toEqual(['plc_a', 'plc_b']);
    });
});

describe('captureTime', () => {
    const at = (captured_at: string, startup = false): FreezeFrameSnapshot => ({
        type: 'freeze_frame',
        name: 'plc',
        data: '{}',
        'x-medkit': {
            topic: '',
            message_type: '',
            full_data: {},
            captured_at,
            ...(startup ? { capture_origin: 'startup' } : {}),
        },
    });

    it('leaves out frames read at gateway start: they say when the gateway started, not when the fault came', () => {
        const frames = [at('2026-11-01T09:00:00Z', true), at('2026-11-01T21:46:42Z')];
        expect(captureTime(frames)).toBe(Date.parse('2026-11-01T21:46:42Z'));
        expect(captureTime([at('2026-11-01T09:00:00Z', true)])).toBeNull();
    });

    it('tells a capture of nothing but gateway-start frames', () => {
        expect(isStartupCapture([at('2026-11-01T09:00:00Z', true)])).toBe(true);
        expect(isStartupCapture([at('2026-11-01T09:00:00Z', true), at('2026-11-01T21:46:42Z')])).toBe(false);
        expect(isStartupCapture([])).toBe(false);
    });
});

describe('words and numbers', () => {
    it('says names and numbers plainly', () => {
        expect(words('nearestObstacle')).toBe('Nearest obstacle');
        expect(words('/navigation/status')).toBe('Navigation status');
        expect(shortNumber(1.4)).toBe('1.4');
        expect(shortNumber(91.4000001)).toBe('91.4');
        expect(shortNumber(-0.0001)).toBe('0');
        expect(unwrapMessage({ data: '{"a": 1}' })).toEqual({ a: 1 });
        expect(unwrapMessage({ data: 'plain text' })).toBe('plain text');
    });

    it('tells better from worse only where a reading has a better way', () => {
        const spread = { key: 'k', label: 'Position uncertainty', topic: '/amcl_pose', rank: 1 } as const;
        expect(changeOf({ ...spread, value: 0.4, better: 'lower' }, { ...spread, value: 0.1 })).toBe('better');
        expect(changeOf({ ...spread, value: 0.1, better: 'lower' }, { ...spread, value: 0.4 })).toBe('worse');
        expect(changeOf({ ...spread, value: 0.4 }, { ...spread, value: 0.1 })).toBeNull();
    });
});
