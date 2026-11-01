import type { Fault } from '@/lib/types';

/**
 * A fault's life in plain words, from what the gateway says of it: when it was first
 * reported, when this time came (medkit's capture of it, else its newest report), when it
 * ended, and what ends it while it is open.
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

export function clock(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "21:30" today, "Yesterday 21:30", "Mon 21:30" this week, else "Oct 27" */
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

export interface FaultTimes {
    /** When this time came */
    came: number | null;
    /** When it ended: medkit's last pass, for a fault that is not open */
    ended: number | null;
    /** When the gateway first heard of it */
    first: number | null;
    /** The newest report of it */
    lastReport: number | null;
    /** Whether the newest capture is of an earlier time than the one now open */
    captureIsEarlier: boolean;
}

/**
 * The moments of a fault. medkit captures its freeze frames when a fault is confirmed, so
 * the newest capture after its last pass is when this time came; a node that keeps
 * reporting moves the newest report along, which only says it is still reported.
 */
export function faultTimes(fault: Fault, capture: number | null): FaultTimes {
    const lastReport = toMs(fault.parameters?.last_occurred);
    const lastPassed = toMs(fault.parameters?.last_passed);
    const first = toMs(fault.timestamp);
    if (isOpen(fault)) {
        const thisTime = capture !== null && (lastPassed === null || capture > lastPassed);
        return {
            came: thisTime ? capture : lastReport,
            ended: null,
            first,
            lastReport,
            captureIsEarlier: capture !== null && !thisTime,
        };
    }
    const ended = lastPassed;
    const came = capture !== null && (ended === null || capture <= ended) ? capture : lastReport;
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
 * The fault's life, newest on top: what ends it, whether it is still reported, when this
 * time came, and when it was first reported.
 */
export function storyRows(fault: Fault, times: FaultTimes, now: number, readAt: number | null): StoryRow[] {
    const name = fault.entity_id;
    const open = isOpen(fault);
    const rows: StoryRow[] = [];
    const count = fault.parameters?.occurrence_count;
    if (times.first !== null && (times.came === null || times.came - times.first > MINUTE)) {
        rows.push({
            key: 'first',
            when: whenWords(times.first, now),
            dot: 'first',
            title: 'First reported.',
            note: typeof count === 'number' && count > 1 ? `Reported ${count} times since.` : undefined,
            rail: 'quiet',
        });
    }
    if (times.came !== null) {
        rows.push({
            key: 'came',
            when: whenWords(times.came, now),
            dot: 'came',
            title: `${name} started reporting it.`,
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
          : undefined;
    rows.push(
        fault.status === 'pending'
            ? { key: 'now', when: 'now', dot: 'now', title: 'Reported, not confirmed yet.', note, rail: 'next' }
            : { key: 'now', when: 'now', dot: 'now', title: 'Still reported.', note, rail: 'next' },
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
