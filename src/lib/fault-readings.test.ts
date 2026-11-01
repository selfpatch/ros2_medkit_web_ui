import { describe, expect, it } from 'vitest';
import {
    changeOf,
    formatReading,
    newestCapture,
    readingRows,
    readingsOf,
    shortNumber,
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
