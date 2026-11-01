import { describe, expect, it } from 'vitest';
import { faultTimes, faultTitle, spanWords, statusWords, storyRows, toMs } from './fault-story';
import type { Fault } from './types';

const MINUTE = 60_000;
const CAME = Date.parse('2026-11-01T21:30:43Z');

function laneBlocked(overrides: Partial<Fault> = {}, parameters: Record<string, unknown> = {}): Fault {
    return {
        code: 'LANE_BLOCKED',
        message: 'Lane blocked by a forklift: 1.40 m free, needs 1.60 m',
        severity: 'error',
        status: 'active',
        timestamp: '2026-10-27T13:20:32Z',
        entity_id: 'lane-navigator',
        entity_type: 'app',
        parameters: { last_occurred: CAME / 1000, occurrence_count: 1, ...parameters },
        ...overrides,
    };
}

describe('fault story', () => {
    it('says a fault code in words', () => {
        expect(faultTitle('LANE_BLOCKED')).toBe('Lane blocked');
        expect(faultTitle('E2E_FLAPPING_SENSOR')).toBe('E2E flapping sensor');
    });

    it('reads unix seconds and ISO strings alike', () => {
        expect(toMs(1793568643.5)).toBe(1793568643500);
        expect(toMs('2026-11-01T21:30:43Z')).toBe(CAME);
        expect(toMs(0)).toBeNull();
        expect(toMs(undefined)).toBeNull();
    });

    it('says how long in two units at most', () => {
        expect(spanWords(40_000)).toBe('40 s');
        expect(spanWords(8 * MINUTE + 5_000)).toBe('8 min');
        expect(spanWords(80 * MINUTE)).toBe('1 h 20 min');
        expect(spanWords(52 * 60 * MINUTE)).toBe('2 d 4 h');
    });

    it('tells an open fault from what ends it, newest on top', () => {
        const fault = laneBlocked();
        const times = faultTimes(fault, CAME);
        const now = CAME + 8 * MINUTE;

        expect(statusWords(fault, times, now)).toBe('Open 8 min');
        const rows = storyRows(fault, times, now, now - 2_000);
        expect(rows.map((row) => row.key)).toEqual(['next', 'now', 'came', 'first']);
        expect(rows[0]?.title).toBe('It ends once lane-navigator stops reporting it.');
        expect(rows[1]?.note).toBe('lane-navigator was read 2 s ago.');
        expect(rows[2]?.title).toBe('lane-navigator started reporting it.');
    });

    it('takes a capture from before the last pass as an earlier time, not this one', () => {
        const passed = CAME + 10 * MINUTE;
        const reported = CAME + 12 * MINUTE;
        const fault = laneBlocked({}, { last_passed: passed / 1000, last_occurred: reported / 1000 });

        const times = faultTimes(fault, CAME);

        expect(times.came).toBe(reported);
        expect(times.captureIsEarlier).toBe(true);
    });

    it('says how long a healed fault lasted, and when it stopped', () => {
        const passed = CAME + 9 * MINUTE;
        const fault = laneBlocked({ status: 'healed' }, { last_passed: passed / 1000 });
        const times = faultTimes(fault, CAME);

        expect(statusWords(fault, times, passed + MINUTE)).toBe('Healed after 9 min');
        const rows = storyRows(fault, times, passed + MINUTE, null);
        expect(rows.map((row) => row.key)).toEqual(['ended', 'came', 'first']);
        expect(rows[0]?.title).toBe('lane-navigator stopped reporting it.');
    });
});
