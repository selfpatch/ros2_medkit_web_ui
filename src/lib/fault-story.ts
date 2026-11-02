import type { Fault } from '@/lib/types';

/**
 * A fault's life in plain words, from what the gateway says of it: when it was first
 * reported, when this time came (medkit's capture of it, else when it was first reported
 * or last passed), when it ended, and what ends it while it is open.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Unix seconds, or an ISO 8601 string, as milliseconds; null for anything else */
export function toMs(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value * 1000;
    if (typeof value === 'string' && value !== '') {
        const at = Date.parse(value);
        return Number.isNaN(at) ? null : at;
    }
    return null;
}

/** "LANE_BLOCKED" → "Lane blocked"; a word with a digit keeps its case ("E2E") */
export function faultTitle(code: string): string {
    const spoken = code
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((word) => (/\d/.test(word) ? word : word.toLowerCase()))
        .join(' ');
    return spoken.charAt(0).toUpperCase() + spoken.slice(1);
}

export const isOpen = (fault: Fault) => fault.status === 'active' || fault.status === 'pending';

/** "40 s", "8 min", "1 h 20 min", "2 d 4 h": two units at most */
export function spanWords(ms: number): string {
    const span = Math.max(0, ms);
    if (span < MINUTE) return `${Math.floor(span / SECOND)} s`;
    if (span < HOUR) return `${Math.floor(span / MINUTE)} min`;
    if (span < DAY) {
        const minutes = Math.floor((span % HOUR) / MINUTE);
        return `${Math.floor(span / HOUR)} h${minutes ? ` ${minutes} min` : ''}`;
    }
    const hours = Math.floor((span % DAY) / HOUR);
    return `${Math.floor(span / DAY)} d${hours ? ` ${hours} h` : ''}`;
}

function clock(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "21:30" today, "Yesterday 21:30", "Mon 21:30" within the last six days, else "Oct 27" */
export function whenWords(ms: number, now: number): string {
    const day = new Date(ms);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const start = new Date(ms);
    start.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today.getTime() - start.getTime()) / DAY);
    if (daysAgo <= 0) return clock(ms);
    if (daysAgo === 1) return `Yesterday ${clock(ms)}`;
    if (daysAgo < 7) return `${day.toLocaleDateString([], { weekday: 'short' })} ${clock(ms)}`;
    return day.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** A fault's newest report, in ms, else when it was first reported; null with neither */
export function lastReportedAt(fault: Fault): number | null {
    return toMs(fault.parameters?.last_occurred) ?? toMs(fault.timestamp);
}

export interface FaultTimes {
    /** When this time came: medkit's capture of it, else when it was first reported or last passed */
    came: number | null;
    /** When it ended: a healed fault's last report; null while open, and for a cleared fault, whose clear is not dated */
    ended: number | null;
    /** When the gateway first heard of it; a fault reported again after a clear starts over */
    first: number | null;
    /** Its newest FAILED report */
    lastReport: number | null;
    /** Whether the newest capture is of an earlier time than the one now open */
    captureIsEarlier: boolean;
}

/**
 * The moments of a fault, from medkit's capture (`capture`, ms) and the fault manager's
 * times. medkit captures its freeze frames each time a fault is confirmed, so an open
 * fault came at its newest capture; without one (a pending fault is never captured) it
 * came when it was first reported. A capture from well before that first report is of an
 * earlier time, kept across a clear; one a little before it is this time's, its messages
 * dated by when they arrived (medkit's background capture). Neither report time says
 * when it came: a node that keeps reporting moves the newest report along, and every
 * PASSED report moves the last pass, also while the fault stays confirmed.
 *
 * So a healed fault ended with its last FAILED report. Nothing dates a clear.
 */
export function faultTimes(fault: Fault, capture: number | null): FaultTimes {
    const lastReport = toMs(fault.parameters?.last_occurred);
    const first = toMs(fault.timestamp);
    if (isOpen(fault)) {
        const earlier = capture !== null && first !== null && capture < first - MINUTE;
        return {
            came: capture !== null && !earlier ? capture : first,
            ended: null,
            first,
            lastReport,
            captureIsEarlier: earlier,
        };
    }
    const ended = fault.status === 'healed' ? lastReport : null;
    const came = capture !== null && (ended === null || capture <= ended) ? capture : first;
    return { came, ended, first, lastReport, captureIsEarlier: false };
}

/** How the fault stands, in a few words: the one place the page says how long */
export function statusWords(fault: Fault, times: FaultTimes, now: number): string {
    switch (fault.status) {
        case 'active':
            return times.came === null ? 'Open' : `Open ${spanWords(now - times.came)}`;
        case 'pending':
            return times.came === null ? 'Pending' : `Pending ${spanWords(now - times.came)}`;
        case 'healed':
            return times.came !== null && times.ended !== null
                ? `Healed after ${spanWords(times.ended - times.came)}`
                : 'Healed';
        case 'cleared':
            return 'Cleared';
    }
}

export interface StoryRow {
    key: string;
    /** The moment, in words: a time, "now" or "next" */
    when: string;
    dot: 'first' | 'came' | 'ended' | 'now' | 'next';
    title: string;
    note?: string;
    /** The time from this moment to the next one: red while open, dashed ahead of now */
    rail: 'open' | 'quiet' | 'next' | 'none';
}

/**
 * The fault's life, newest on top: what ends it, whether it is still reported (said from
 * its newest report, else from when its topics last answered, `readAt`, or that they do
 * not answer, `failing`), when this time came, and when it was first reported.
 */
export function storyRows(
    fault: Fault,
    times: FaultTimes,
    now: number,
    readAt: number | null,
    failing: boolean
): StoryRow[] {
    const name = fault.entity_id;
    const open = isOpen(fault);
    const rows: StoryRow[] = [];
    // The count goes up each time a cleared fault is reported again, and its first report
    // starts over then: the first row is its latest return.
    const count = fault.parameters?.occurrence_count;
    const comebacks = typeof count === 'number' && count > 1 ? count - 1 : 0;
    const cameBack = comebacks
        ? `Came back ${comebacks} time${comebacks === 1 ? '' : 's'} after being cleared.`
        : undefined;
    const showsFirst = times.first !== null && (times.came === null || times.came - times.first > MINUTE);
    if (showsFirst) {
        rows.push({
            key: 'first',
            when: whenWords(times.first!, now),
            dot: 'first',
            title: comebacks ? 'Reported again after a clear.' : 'First reported.',
            note: cameBack,
            rail: 'quiet',
        });
    }
    if (times.came !== null) {
        rows.push({
            key: 'came',
            when: whenWords(times.came, now),
            dot: 'came',
            title: `${name} started reporting it.`,
            // Without a first row of its own, its return is told here.
            note: showsFirst ? undefined : cameBack,
            rail: open ? 'open' : 'quiet',
        });
    }
    if (!open) {
        rows.push({
            key: 'ended',
            when: times.ended !== null ? whenWords(times.ended, now) : '',
            dot: 'ended',
            title: fault.status === 'cleared' ? 'It was cleared.' : `${name} stopped reporting it.`,
            rail: 'none',
        });
        return rows.reverse();
    }
    const reporting = times.lastReport !== null && times.came !== null && times.lastReport - times.came > 5 * SECOND;
    const note = reporting
        ? `${name} last reported it ${spanWords(now - times.lastReport!)} ago.`
        : readAt !== null
          ? `${name} was read ${spanWords(now - readAt)} ago.`
          : failing
            ? `${name}'s topics do not answer.`
            : undefined;
    rows.push(
        {
            key: 'now',
            when: 'now',
            dot: 'now',
            title: fault.status === 'pending' ? 'Reported, not confirmed yet.' : 'Still reported.',
            note,
            rail: 'next',
        },
        {
            key: 'next',
            when: 'next',
            dot: 'next',
            title:
                fault.status === 'pending'
                    ? `It is confirmed if ${name} keeps reporting it.`
                    : `It ends once ${name} stops reporting it.`,
            rail: 'none',
        }
    );
    return rows.reverse();
}
