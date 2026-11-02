import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Clock, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SnapshotCard } from '@/components/SnapshotCard';
import { useLiveFaultReadings, type LiveFaultReadings } from '@/hooks/useLiveFaultReadings';
import { useMeasured } from '@/hooks/useMeasured';
import { parseBulkDataUri, saveBlob } from '@/lib/bulk-data';
import { useAppStore } from '@/lib/store';
import {
    captureOf,
    changeOf,
    formatReading,
    isStartupCapture,
    newestCapture,
    readingRows,
    snapshotTime,
    type ReadingRow,
} from '@/lib/fault-readings';
import {
    faultTimes,
    faultTitle,
    isOpen,
    spanWords,
    statusWords,
    storyRows,
    whenWords,
    type FaultTimes,
    type StoryRow,
} from '@/lib/fault-story';
import type { Fault, FaultResponse, FaultSeverity, FaultStatusValue, RosbagSnapshot } from '@/lib/types';
import { isRosbagSnapshot } from '@/lib/types';
import { cn, formatBytes, formatDuration, mapFaultEntityTypeToResourceType } from '@/lib/utils';

// How many readings show before "All N readings" unfolds the rest.
const FIRST_READINGS = 8;

const STATUS_TEXT: Record<FaultStatusValue, string> = {
    active: 'text-state-fault-text',
    pending: 'text-state-warn-text',
    healed: 'text-muted-foreground',
    cleared: 'text-muted-foreground',
};

const STATUS_DOT: Record<FaultStatusValue, string> = {
    active: 'bg-state-fault',
    pending: 'bg-state-warn',
    healed: 'bg-acid-strong',
    cleared: 'bg-state-ok',
};

const SEVERITY_TEXT: Record<FaultSeverity, string> = {
    critical: 'font-semibold text-state-fault-text',
    error: 'text-muted-foreground',
    warning: 'text-muted-foreground',
    info: 'text-faint',
};

// The moment's dot: this time's coming in red (amber while it is only pending), its end in
// how it ended (acid when it healed, green when someone cleared it).
function dotClass(dot: StoryRow['dot'], status: FaultStatusValue): string {
    switch (dot) {
        case 'came':
            return status === 'pending'
                ? 'size-3 bg-state-warn ring-4 ring-state-warn-bg'
                : 'size-3 bg-state-fault ring-4 ring-state-fault-bg';
        case 'ended':
            return status === 'healed'
                ? 'size-2.5 bg-acid ring-1 ring-graphite/15'
                : status === 'cleared'
                  ? 'size-2.5 bg-state-ok'
                  : 'size-2.5 bg-graphite/35';
        case 'now':
            return 'size-3 bg-graphite ring-4 ring-graphite/10';
        case 'next':
            return 'size-2.5 border-2 border-graphite/25 bg-white';
        case 'first':
            return 'size-2.5 bg-graphite/35';
    }
}

/** The time now, again every `every` ms, for words that count up ("Open 8 min") */
function useNow(every: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), every);
        return () => window.clearInterval(timer);
    }, [every]);
    return now;
}

/**
 * A recording of the seconds around the fault, as a download: the head's "Download data"
 * for the newest, an icon on its line for an earlier one. Each names its recording, so
 * several are told apart by ear as well, and a failed download says why in words beside it.
 */
function RecordingDownload({
    recording,
    now,
    look,
}: {
    recording: RosbagSnapshot;
    now: number;
    look: 'head' | 'line';
}) {
    const downloadBulkData = useAppStore((state) => state.downloadBulkData);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    const download = async () => {
        const target = parseBulkDataUri(recording.bulk_data_uri);
        setFailed(null);
        if (!target) {
            setFailed("This recording's address could not be read");
            return;
        }
        setBusy(true);
        try {
            const result = await downloadBulkData(target.entityType, target.entityId, target.category, target.id);
            if (!result) throw new Error('The gateway did not hand over this recording');
            saveBlob(result.blob, result.filename);
        } catch (err) {
            setFailed(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setBusy(false);
        }
    };

    const at = snapshotTime(recording);
    const about = [
        at !== null ? `Recorded ${whenWords(at, now)}` : 'The seconds around this fault',
        recording.duration_sec > 0 ? formatDuration(recording.duration_sec) : null,
        recording.size_bytes > 0 ? formatBytes(recording.size_bytes) : null,
    ]
        .filter(Boolean)
        .join(', ');
    const Icon = busy ? Loader2 : Download;
    const icon = <Icon aria-hidden className={cn('size-4', busy && 'animate-spin')} />;
    // There from the start (out of the layout while empty), so a screen reader hears the
    // failure when its words come.
    const said = (
        <span role="status" className={failed ? 'text-xs text-destructive' : 'sr-only'}>
            {failed && `Download failed: ${failed}`}
        </span>
    );

    if (look === 'head') {
        return (
            <>
                {said}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={download}
                    disabled={busy}
                    aria-label={`Download data - ${recording.name}`}
                    title={about}
                    className={cn('gap-2', failed && 'border-destructive text-destructive')}
                >
                    {icon}
                    Download data
                </Button>
            </>
        );
    }
    return (
        <>
            {said}
            <Button
                variant="ghost"
                size="icon"
                onClick={download}
                disabled={busy}
                aria-label={`Download recording - ${recording.name}`}
                className={cn('size-8 shrink-0 text-muted-foreground', failed && 'text-destructive')}
            >
                {icon}
            </Button>
        </>
    );
}

// A section's name: small and quiet, the same for every section of the pane.
function SectionName({ id, children }: { id: string; children: ReactNode }) {
    return (
        <h3 id={id} className="font-sans text-xs font-medium tracking-normal text-muted-foreground">
            {children}
        </h3>
    );
}

/** The fault's life, moment by moment, newest on top */
function FaultStory({ rows, status }: { rows: StoryRow[]; status: FaultStatusValue }) {
    return (
        <ol aria-label="The fault, moment by moment" className="grid">
            {rows.map((row, i) => {
                // The line under a moment reaches the one before it: how that time was.
                const rail = rows[i + 1]?.rail ?? 'none';
                return (
                    <li key={row.key} className="grid grid-cols-[64px_16px_minmax(0,1fr)] gap-x-2.5">
                        <span className="pt-0.5 text-right text-xs text-faint tabular-nums">{row.when}</span>
                        <span className="relative flex justify-center">
                            <i
                                aria-hidden
                                className={cn('relative z-10 mt-1 rounded-full', dotClass(row.dot, status))}
                            />
                            {rail !== 'none' && (
                                <i
                                    aria-hidden
                                    className={cn(
                                        'absolute top-4 bottom-0',
                                        rail === 'open' && 'w-0.5 bg-state-fault/70',
                                        rail === 'quiet' && 'w-0.5 bg-graphite/15',
                                        rail === 'next' && 'border-l-2 border-dashed border-graphite/25'
                                    )}
                                />
                            )}
                        </span>
                        <div className="grid min-w-0 gap-1 pb-5">
                            <p className="text-[13.5px] leading-snug font-semibold text-foreground">{row.title}</p>
                            {row.note && (
                                <p className="text-[12.5px] leading-snug break-words text-muted-foreground">
                                    {row.note}
                                </p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

const widthOf = (node: HTMLElement) => node.clientWidth;

/** What the live reads say of one reading's topic, for its Now cell */
interface NowOf {
    /** Whether the topic is read again at all (an entity frame's values are not a topic) */
    read: boolean;
    /** Whether it ever answered */
    answered: boolean;
    /** Whether it has been asked yet: the first round of reads takes a while, a topic at a time */
    asked: boolean;
    /** Whether its latest read failed, so the value shown is an older answer */
    stale: boolean;
    /** When it last answered */
    answeredAt?: number;
}

function nowOf(topic: string, live: LiveFaultReadings, topics: ReadonlySet<string>): NowOf {
    return {
        read: topics.has(topic),
        answered: live.values.has(topic),
        asked: live.asked,
        stale: live.stale.has(topic),
        answeredAt: live.answeredAt.get(topic),
    };
}

/** One reading's cells: its name, what it read when the fault came, and now (`now` absent: no Now column) */
function ReadingCells({ row, now, clock, first }: { row: ReadingRow; now?: NowOf; clock: number; first: boolean }) {
    const change = changeOf(row.then, row.now);
    return (
        <>
            <th
                scope="row"
                className={cn(
                    'px-3.5 py-2.5 text-left font-normal break-words text-body',
                    !first && 'border-l border-hairline'
                )}
            >
                {row.label}
            </th>
            <td className="px-3 py-2.5 text-right break-words text-muted-foreground tabular-nums">
                {formatReading(row.then)}
                {row.then.lastKnown && (
                    <span
                        title="The entity was disconnected when this was taken: it is its last known value, of unknown age"
                        className="ml-1.5 text-[11px] whitespace-nowrap text-faint"
                    >
                        last known
                    </span>
                )}
            </td>
            {now && <NowCell row={row} now={now} clock={clock} change={change} />}
        </>
    );
}

/**
 * A reading now: its value, how it moved, or a dash. A topic that stopped answering keeps
 * its last answer, muted and marked with how old it is.
 */
function NowCell({
    row,
    now,
    clock,
    change,
}: {
    row: ReadingRow;
    now: NowOf;
    clock: number;
    change: ReturnType<typeof changeOf>;
}) {
    const cell = 'px-3 py-2.5 text-right break-words tabular-nums';
    if (!row.now) {
        return (
            <td
                title={now.read && now.asked && !now.answered ? 'Not answering' : undefined}
                className={cn(cell, 'text-faint')}
            >
                -
            </td>
        );
    }
    if (now.stale) {
        const age = now.answeredAt !== undefined ? `, last answer ${spanWords(clock - now.answeredAt)} ago` : '';
        return (
            <td title={`Not answering now${age}`} className={cn(cell, 'text-faint')}>
                <Clock aria-hidden className="mr-1 inline size-3 -translate-y-px" />
                {formatReading(row.now)}
                <span className="sr-only">, not answering now{age}</span>
            </td>
        );
    }
    const moved = change === 'better' || change === 'worse';
    const up =
        typeof row.now.value === 'number' && typeof row.then.value === 'number' && row.now.value > row.then.value;
    const Arrow = up ? ArrowUp : ArrowDown;
    return (
        <td
            className={cn(
                cell,
                'font-semibold',
                change === 'better'
                    ? 'text-state-fixed-text'
                    : change === 'worse'
                      ? 'text-state-fault-text'
                      : 'text-foreground'
            )}
        >
            {moved && <Arrow aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />}
            {formatReading(row.now)}
            {moved && <span className="sr-only">, {change}</span>}
        </td>
    );
}

/**
 * What the robot read when the fault came, beside what it reads now (`live`, with the
 * topics it reads again; absent while the fault is not open): one row a reading. A wide
 * pane sets readings side by side, a group each, so a name stays near its numbers.
 */
function ReadingsTable({
    rows,
    live,
    earlier,
    atStart,
    clock,
}: {
    rows: ReadingRow[];
    live?: { readings: LiveFaultReadings; topics: ReadonlySet<string> };
    /** The capture is of an earlier time than the one now open */
    earlier: boolean;
    /** Every frame was read at gateway start */
    atStart: boolean;
    clock: number;
}) {
    const [all, setAll] = useState(false);
    const [box, width] = useMeasured<HTMLDivElement, number>(widthOf, 0);
    const shown = all ? rows : rows.slice(0, FIRST_READINGS);
    // A group needs room for a name and its one or two numbers.
    const groups = Math.max(1, Math.min(3, Math.floor(width / (live ? 310 : 250)), shown.length));
    const per = width / groups;
    const number = per >= 448 ? 'w-[128px]' : per >= 384 ? 'w-[104px]' : 'w-[88px]';
    const lines: ReadingRow[][] = [];
    for (let i = 0; i < shown.length; i += groups) lines.push(shown.slice(i, i + groups));
    const each = Array.from({ length: groups }, (_, g) => g);
    return (
        <section aria-labelledby="fault-readings" className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <SectionName id="fault-readings">Readings</SectionName>
            <div ref={box} className="overflow-hidden rounded-xl bg-white ring-1 ring-graphite/10">
                <table className="w-full table-fixed border-collapse text-[13px]">
                    <colgroup>
                        {each.map((g) => (
                            <Fragment key={g}>
                                <col />
                                <col className={number} />
                                {live && <col className={number} />}
                            </Fragment>
                        ))}
                    </colgroup>
                    <thead className="bg-canvas/60 text-xs text-muted-foreground">
                        <tr>
                            {each.map((g) => (
                                <Fragment key={g}>
                                    <th
                                        scope="col"
                                        className={cn(
                                            'px-3.5 py-2 text-left font-normal',
                                            g > 0 && 'border-l border-hairline'
                                        )}
                                    >
                                        <span className="sr-only">Reading</span>
                                    </th>
                                    <th scope="col" className="px-3 py-2 text-right font-normal whitespace-nowrap">
                                        {atStart
                                            ? 'At gateway start'
                                            : earlier
                                              ? 'Last time'
                                              : per >= 448
                                                ? 'When it came'
                                                : 'Then'}
                                    </th>
                                    {live && (
                                        <th scope="col" className="px-3 py-2 text-right font-normal">
                                            Now
                                        </th>
                                    )}
                                </Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => (
                            <tr key={line[0]!.key} className="border-t border-hairline">
                                {each.map((g) =>
                                    line[g] ? (
                                        <ReadingCells
                                            key={line[g]!.key}
                                            row={line[g]!}
                                            now={live && nowOf(line[g]!.then.topic, live.readings, live.topics)}
                                            clock={clock}
                                            first={g === 0}
                                        />
                                    ) : (
                                        <td
                                            key={g}
                                            colSpan={live ? 3 : 2}
                                            className={cn(g > 0 && 'border-l border-hairline')}
                                        />
                                    )
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > FIRST_READINGS && (
                <button
                    type="button"
                    aria-expanded={all}
                    onClick={() => setAll((was) => !was)}
                    className="justify-self-start rounded text-[13px] font-medium text-body outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                >
                    {all ? 'Fewer readings' : `All ${rows.length} readings`}
                </button>
            )}
        </section>
    );
}

/** Earlier recordings of the fault, a line each: when, how long, how big, and its download */
function EarlierRecordings({ recordings, now }: { recordings: RosbagSnapshot[]; now: number }) {
    return (
        <section aria-labelledby="fault-recordings" className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <SectionName id="fault-recordings">Earlier recordings</SectionName>
            <ul className="divide-y divide-hairline overflow-hidden rounded-xl bg-white ring-1 ring-graphite/10">
                {recordings.map((recording) => {
                    const at = snapshotTime(recording);
                    return (
                        <li
                            key={recording.bulk_data_uri}
                            className="flex flex-wrap items-center gap-x-3 py-1 pr-1.5 pl-3.5 text-[13px]"
                        >
                            <span className="min-w-0 flex-1 truncate text-body">
                                {at !== null ? whenWords(at, now) : recording.name}
                            </span>
                            <span className="shrink-0 text-faint tabular-nums">
                                {[
                                    recording.duration_sec > 0 ? formatDuration(recording.duration_sec) : null,
                                    recording.size_bytes > 0 ? formatBytes(recording.size_bytes) : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                            <RecordingDownload recording={recording} now={now} look="line" />
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** The snapshots as medkit keeps them, folded away until asked for */
function RawSnapshots({ snapshots }: { snapshots: FaultResponse['environment_data']['snapshots'] }) {
    const [open, setOpen] = useState(false);
    const frames = snapshots
        .map((snapshot, index) => ({ snapshot, index }))
        .filter(({ snapshot }) => !isRosbagSnapshot(snapshot));
    if (frames.length === 0) return null;
    return (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((was) => !was)}
                className="flex items-center gap-1 justify-self-start rounded text-[13px] font-medium text-body outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
            >
                <ChevronRight aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
                {open ? 'Hide the raw snapshots' : `Raw snapshots (${frames.length})`}
            </button>
            {/* Drawn only when open, so a folded fault holds no hidden controls. */}
            {open && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-2">
                    {frames.map(({ snapshot, index }) => (
                        <SnapshotCard key={`${snapshot.name}-${index}`} snapshot={snapshot} index={index} />
                    ))}
                </div>
            )}
        </section>
    );
}

interface FaultDetailProps {
    fault: Fault;
    /** What the gateway keeps of the fault; null when it could not be read, undefined while reading */
    details: FaultResponse | null | undefined;
    onBack: () => void;
    onClear: () => void;
    isClearing: boolean;
}

/**
 * One fault's page, beside the list: its head (where, how it stands, what is wrong in
 * words, the robot's own words, its download and Clear), its life moment by moment, and
 * what the robot read when it came against what it reads now.
 *
 * On a wide pane the story is a column of its own on the left; narrower, it sits between
 * the head and the readings.
 */
export function FaultDetail({ fault, details, onBack, onClear, isClearing }: FaultDetailProps) {
    const open = isOpen(fault);
    const now = useNow(open ? 1000 : 60_000);
    const snapshots = useMemo(() => details?.environment_data?.snapshots ?? [], [details]);
    const frames = useMemo(() => newestCapture(snapshots), [snapshots]);
    const recordings = useMemo(
        () => snapshots.filter(isRosbagSnapshot).sort((a, b) => (snapshotTime(b) ?? 0) - (snapshotTime(a) ?? 0)),
        [snapshots]
    );
    const capture = useMemo(() => captureOf(snapshots), [snapshots]);
    const times: FaultTimes = faultTimes(fault, capture);

    // Only the topics medkit named and that have a reading in words are read again.
    const topics = useMemo(() => {
        const named = new Set(frames.map((frame) => frame['x-medkit']?.topic).filter(Boolean));
        return readingRows(frames, new Map(), '')
            .map((row) => row.then.topic)
            .filter((topic, i, all) => named.has(topic) && all.indexOf(topic) === i);
    }, [frames]);
    const readTopics = useMemo(() => new Set(topics), [topics]);
    const entityType = mapFaultEntityTypeToResourceType(fault.entity_type);
    const live = useLiveFaultReadings(entityType, fault.entity_id, topics, open);
    const rows = useMemo(() => readingRows(frames, live.values, fault.message), [frames, live.values, fault.message]);
    const story = storyRows(fault, times, now, live.readAt, live.failing);

    const back = (
        <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 justify-self-start self-start rounded text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring @2xl:hidden"
        >
            <ChevronLeft aria-hidden className="size-4" />
            All faults
        </button>
    );

    const pane =
        'flex flex-col gap-5 px-4 py-4 sm:px-6 @2xl:h-full @2xl:overflow-y-auto @2xl:py-5 @3xl:grid @3xl:grid-cols-[minmax(240px,min(32%,320px))_minmax(0,1fr)] @3xl:grid-rows-[minmax(0,1fr)] @3xl:gap-0 @3xl:overflow-hidden @3xl:p-0';

    // The page draws once what it shows is known, never changing shape as the read answers.
    if (details === undefined) {
        return (
            <section aria-busy className={pane}>
                {back}
                <p className="text-[13px] text-faint @3xl:col-span-2 @3xl:px-6 @3xl:py-5">Reading the fault…</p>
            </section>
        );
    }

    const newest = recordings[0];
    const severity = fault.severity.charAt(0).toUpperCase() + fault.severity.slice(1);

    return (
        <section aria-labelledby="fault-title" className={pane}>
            {back}
            {/* The head and the rest: one scrolling column on a wide pane, around the story on a narrow one. */}
            <div className="contents @3xl:col-start-2 @3xl:row-start-1 @3xl:flex @3xl:min-h-0 @3xl:flex-col @3xl:gap-5 @3xl:overflow-y-auto @3xl:px-6 @3xl:py-5">
                <header className="order-1 flex flex-wrap items-start gap-x-4 gap-y-3">
                    <div className="grid min-w-0 flex-1 basis-56 gap-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{fault.entity_id}</span>
                            <span aria-hidden className="text-faint">
                                ·
                            </span>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1.5 whitespace-nowrap',
                                    STATUS_TEXT[fault.status]
                                )}
                            >
                                <i aria-hidden className={cn('size-1.5 rounded-full', STATUS_DOT[fault.status])} />
                                {statusWords(fault, times, now)}
                            </span>
                            <span aria-hidden className="text-faint">
                                ·
                            </span>
                            <span className={SEVERITY_TEXT[fault.severity]}>{severity}</span>
                        </p>
                        <h2
                            id="fault-title"
                            className="text-2xl leading-[1.1] tracking-[-0.025em] break-words text-foreground"
                        >
                            {faultTitle(fault.code)}
                        </h2>
                        {fault.message && (
                            <p className="text-[13px] leading-snug break-words text-faint">{fault.message}</p>
                        )}
                    </div>
                    {(newest || open) && (
                        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
                            {newest && (
                                <RecordingDownload
                                    key={newest.bulk_data_uri}
                                    recording={newest}
                                    now={now}
                                    look="head"
                                />
                            )}
                            {open && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onClear}
                                    disabled={isClearing}
                                    title="Clear fault"
                                    className="gap-2"
                                >
                                    {isClearing && <Loader2 aria-hidden className="size-4 animate-spin" />}
                                    Clear
                                </Button>
                            )}
                        </div>
                    )}
                </header>
                <div className="order-3 grid grid-cols-[minmax(0,1fr)] content-start gap-5">
                    {rows.length > 0 && (
                        <ReadingsTable
                            rows={rows}
                            live={open && topics.length > 0 ? { readings: live, topics: readTopics } : undefined}
                            earlier={times.captureIsEarlier}
                            atStart={isStartupCapture(frames)}
                            clock={now}
                        />
                    )}
                    {recordings.length > 1 && <EarlierRecordings recordings={recordings.slice(1)} now={now} />}
                    <RawSnapshots snapshots={snapshots} />
                    {snapshots.length === 0 && (
                        <p className="text-[13px] text-faint">
                            {details === null
                                ? "This fault's details could not be read."
                                : 'medkit kept no snapshot of this fault.'}
                        </p>
                    )}
                </div>
            </div>
            <aside
                aria-label="Timeline"
                className="order-2 border-t border-hairline pt-5 @3xl:col-start-1 @3xl:row-start-1 @3xl:min-h-0 @3xl:overflow-y-auto @3xl:border-t-0 @3xl:border-r @3xl:py-5 @3xl:pr-4 @3xl:pl-2"
            >
                <FaultStory rows={story} status={fault.status} />
            </aside>
        </section>
    );
}
