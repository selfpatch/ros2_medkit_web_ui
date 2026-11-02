import { describe, expect, it } from 'vitest';
import { faultTimes, faultTitle, lastReportedAt, spanWords, statusWords, storyRows, toMs } from './fault-story';
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
        const rows = storyRows(fault, times, now, now - 2_000, false);
        expect(rows.map((row) => row.key)).toEqual(['next', 'now', 'came', 'first']);
        expect(rows[0]?.title).toBe('It ends once lane-navigator stops reporting it.');
        expect(rows[1]?.note).toBe('lane-navigator was read 2 s ago.');
        expect(rows[2]?.title).toBe('lane-navigator started reporting it.');
    });

    it('keeps an open fault come at its capture through a pass that did not heal it', () => {
        // A confirmed fault stays confirmed until enough passes heal it, and every pass
        // moves last_passed: a pass is not when this time came.
        const passed = CAME + 10 * MINUTE;
        const reported = CAME + 12 * MINUTE;
        const fault = laneBlocked({}, { last_passed: passed / 1000, last_occurred: reported / 1000 });

        const times = faultTimes(fault, CAME);

        expect(times.came).toBe(CAME);
        expect(times.captureIsEarlier).toBe(false);
        expect(statusWords(fault, times, reported)).toBe('Open 12 min');
    });

    it('takes a capture from before the fault was first reported as an earlier time', () => {
        // Kept across a clear: the fault came back, and its first report starts again then.
        const first = CAME + 5 * MINUTE;
        const fault = laneBlocked({ timestamp: new Date(first).toISOString() });

        const times = faultTimes(fault, CAME);

        expect(times.came).toBe(first);
        expect(times.captureIsEarlier).toBe(true);
    });

    it('takes a capture of messages that arrived just before the first report as this time', () => {
        // medkit's background capture dates a frame by when its message arrived.
        const first = CAME + 8_000;
        const fault = laneBlocked({ timestamp: new Date(first).toISOString() });

        const times = faultTimes(fault, CAME);

        expect(times.came).toBe(CAME);
        expect(times.captureIsEarlier).toBe(false);
    });

    it('counts a fault that never passed from when it was first reported, not from its newest report', () => {
        const first = Date.parse('2026-10-27T13:20:32Z');
        const fault = laneBlocked({ status: 'pending' }, { last_occurred: (CAME + 7 * MINUTE) / 1000 });

        const times = faultTimes(fault, null);

        expect(times.came).toBe(first);
        expect(statusWords(fault, times, first + 2 * MINUTE)).toBe('Pending 2 min');
        const rows = storyRows(fault, times, first + 2 * MINUTE, null, false);
        expect(rows.map((row) => row.key)).toEqual(['next', 'now', 'came']);
        expect(rows[1]?.title).toBe('Reported, not confirmed yet.');
        expect(rows[0]?.title).toBe('It is confirmed if lane-navigator keeps reporting it.');
    });

    it('says how long a healed fault lasted, to its last report, whatever passes came after', () => {
        const stopped = CAME + 9 * MINUTE;
        // A node keeps sending PASSED long after the heal; each one moves last_passed along.
        const fault = laneBlocked(
            { status: 'healed' },
            { last_occurred: stopped / 1000, last_passed: (stopped + 40 * MINUTE) / 1000 }
        );
        const times = faultTimes(fault, CAME);

        expect(times.ended).toBe(stopped);
        expect(statusWords(fault, times, stopped + 60 * MINUTE)).toBe('Healed after 9 min');
        const rows = storyRows(fault, times, stopped + 60 * MINUTE, null, false);
        expect(rows.map((row) => row.key)).toEqual(['ended', 'came', 'first']);
        expect(rows[0]?.title).toBe('lane-navigator stopped reporting it.');
    });

    it('says only "Healed" when it cannot tell how long', () => {
        const fault = laneBlocked({ status: 'healed', timestamp: '' }, { last_occurred: undefined });
        expect(statusWords(fault, faultTimes(fault, null), CAME)).toBe('Healed');
    });

    it('does not date the clear of a cleared fault: nothing says when it was cleared', () => {
        const fault = laneBlocked({ status: 'cleared' }, { last_passed: (CAME + 5 * MINUTE) / 1000 });
        const times = faultTimes(fault, CAME);

        expect(times.ended).toBeNull();
        expect(times.came).toBe(CAME);
        expect(statusWords(fault, times, CAME + 10 * MINUTE)).toBe('Cleared');
        const rows = storyRows(fault, times, CAME + 10 * MINUTE, null, false);
        expect(rows[0]).toMatchObject({ key: 'ended', when: '', title: 'It was cleared.' });
    });

    it('takes a closed fault as come when first reported when its capture is from after it ended', () => {
        const stopped = CAME + 9 * MINUTE;
        const fault = laneBlocked({ status: 'healed' }, { last_occurred: stopped / 1000 });
        expect(faultTimes(fault, stopped + MINUTE).came).toBe(Date.parse('2026-10-27T13:20:32Z'));
    });

    it('says how often a fault came back after being cleared, which is what its count counts', () => {
        const fault = laneBlocked({}, { occurrence_count: 3 });
        const rows = storyRows(fault, faultTimes(fault, CAME), CAME + MINUTE, null, false);
        const first = rows.find((row) => row.key === 'first');
        expect(first?.title).toBe('Reported again after a clear.');
        expect(first?.note).toBe('Came back 2 times after being cleared.');

        const once = laneBlocked({}, { occurrence_count: 2 });
        const onceRows = storyRows(once, faultTimes(once, CAME), CAME + MINUTE, null, false);
        expect(onceRows.find((row) => row.key === 'first')?.note).toBe('Came back 1 time after being cleared.');
        expect(storyRows(laneBlocked(), faultTimes(laneBlocked(), CAME), CAME, null, false)[3]?.title).toBe(
            'First reported.'
        );
    });

    it('says the topics do not answer, rather than that they were read, until one answers', () => {
        const fault = laneBlocked();
        const times = faultTimes(fault, CAME);
        const now = CAME + MINUTE;

        expect(storyRows(fault, times, now, null, true)[1]?.note).toBe("lane-navigator's topics do not answer.");
        expect(storyRows(fault, times, now, now - 30_000, true)[1]?.note).toBe('lane-navigator was read 30 s ago.');
        expect(storyRows(fault, times, now, null, false)[1]?.note).toBeUndefined();
    });

    it("orders by a fault's newest report, falling back to when it was first reported", () => {
        expect(lastReportedAt(laneBlocked())).toBe(CAME);
        expect(lastReportedAt(laneBlocked({}, { last_occurred: undefined }))).toBe(Date.parse('2026-10-27T13:20:32Z'));
    });
});
