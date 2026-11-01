import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefCallback } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SnapshotCard } from '@/components/SnapshotCard';
import { useLiveFaultReadings } from '@/hooks/useLiveFaultReadings';
import { useAppStore } from '@/lib/store';
import {
    captureTime,
    changeOf,
    formatReading,
    newestCapture,
    readingRows,
    type ReadingRow,
} from '@/lib/fault-readings';
import {
    faultTimes,
    faultTitle,
    isOpen,
    statusWords,
    storyRows,
    whenWords,
    type FaultTimes,
    type StoryRow,
} from '@/lib/fault-story';
import type {
    Fault,
    FaultResponse,
    FaultSeverity,
    FaultStatus,
    RosbagSnapshot,
    SovdResourceEntityType,
} from '@/lib/types';
import { isRosbagSnapshot } from '@/lib/types';
import { cn, formatBytes, formatDuration, mapFaultEntityTypeToResourceType } from '@/lib/utils';

// How many readings show before "All N readings" unfolds the rest.
const FIRST_READINGS = 8;

const STATUS_TEXT: Record<FaultStatus, string> = {
    active: 'text-state-fault-text',
    pending: 'text-state-warn-text',
    healed: 'text-muted-foreground',
    cleared: 'text-muted-foreground',
};

const STATUS_DOT: Record<FaultStatus, string> = {
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

// The moment's dot: this time's coming in its state's colour, its end in how it ended.
function dotClass(dot: StoryRow['dot'], status: FaultStatus): string {
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

/** "/apps/motor/bulk-data/rosbags/rb-1" → the parts the download takes */
function bulkDataTarget(uri: string) {
    const match = uri.match(/^\/(apps|components|areas|functions)\/([^/]+)\/bulk-data\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
        entityType: match[1] as SovdResourceEntityType,
        entityId: match[2]!,
        category: match[3]!,
        id: match[4]!,
    };
}

const recordedAt = (recording: RosbagSnapshot) => Date.parse(recording['x-medkit']?.captured_at ?? '') || 0;

/**
 * A recording of the seconds around the fault, as a download: the head's "Download data"
 * for the newest, an icon on its line for an earlier one. Each names its recording, so
 * several are told apart by ear as well.
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
        const target = bulkDataTarget(recording.bulk_data_uri);
        setBusy(true);
        setFailed(null);
        try {
            const result = target
                ? await downloadBulkData(target.entityType, target.entityId, target.category, target.id)
                : null;
            if (!result) throw new Error('The gateway did not hand over this recording');
            const url = URL.createObjectURL(result.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            setFailed(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setBusy(false);
        }
    };

    const at = recordedAt(recording);
    const about = [
        at ? `Recorded ${whenWords(at, now)}` : 'The seconds around this fault',
        recording.duration_sec > 0 ? formatDuration(recording.duration_sec) : null,
        recording.size_bytes > 0 ? formatBytes(recording.size_bytes) : null,
    ]
        .filter(Boolean)
        .join(', ');
    const Icon = busy ? Loader2 : Download;
    const icon = <Icon aria-hidden className={cn('size-4', busy && 'animate-spin')} />;

    if (look === 'head') {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={download}
                disabled={busy}
                aria-label={`Download data - ${recording.name}`}
                title={failed ?? about}
                className={cn('gap-2', failed && 'border-destructive text-destructive')}
            >
                {icon}
                Download data
            </Button>
        );
    }
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={download}
            disabled={busy}
            aria-label={`Download recording - ${recording.name}`}
            title={failed ?? undefined}
            className={cn('size-8 shrink-0 text-muted-foreground', failed && 'text-destructive')}
        >
            {icon}
        </Button>
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
function FaultStory({ rows, status }: { rows: StoryRow[]; status: FaultStatus }) {
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

/** An element's width, kept as it changes. A callback ref: the element comes with its data. */
function useWidth<T extends HTMLElement>(): [RefCallback<T>, number] {
    const [width, setWidth] = useState(0);
    const watching = useRef<ResizeObserver | null>(null);
    const ref = useCallback((node: T | null) => {
        watching.current?.disconnect();
        watching.current = null;
        if (!node) return;
        const sized = new ResizeObserver(() => setWidth(node.clientWidth));
        sized.observe(node);
        watching.current = sized;
    }, []);
    return [ref, width];
}

/** One reading's cells: its name, what it read when the fault came, and now */
function ReadingCells({ row, live, first }: { row: ReadingRow; live: boolean; first: boolean }) {
    const change = changeOf(row.then, row.now);
    const moved = change === 'better' || change === 'worse';
    const up =
        typeof row.now?.value === 'number' && typeof row.then.value === 'number' && row.now.value > row.then.value;
    const Arrow = up ? ArrowUp : ArrowDown;
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
            </td>
            {live && (
                <td
                    className={cn(
                        'px-3 py-2.5 text-right font-semibold break-words tabular-nums',
                        change === 'better'
                            ? 'text-state-fixed-text'
                            : change === 'worse'
                              ? 'text-state-fault-text'
                              : 'text-foreground'
                    )}
                >
                    {moved && <Arrow aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />}
                    {row.now ? formatReading(row.now) : '–'}
                    {moved && <span className="sr-only">, {change}</span>}
                </td>
            )}
        </>
    );
}

/**
 * What the robot read when the fault came, beside what it reads now: one row a reading. A
 * wide pane sets readings side by side, a group each, so a name stays near its numbers.
 */
function ReadingsTable({ rows, live, earlier }: { rows: ReadingRow[]; live: boolean; earlier: boolean }) {
    const [all, setAll] = useState(false);
    const [box, width] = useWidth<HTMLDivElement>();
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
                                        {earlier ? 'Last time' : per >= 448 ? 'When it came' : 'Then'}
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
                                        <ReadingCells key={line[g]!.key} row={line[g]!} live={live} first={g === 0} />
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
                    className="justify-self-start rounded text-[13px] font-medium text-body outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
                    const at = recordedAt(recording);
                    return (
                        <li key={recording.name} className="flex items-center gap-3 py-1 pr-1.5 pl-3.5 text-[13px]">
                            <span className="min-w-0 flex-1 truncate text-body">
                                {at ? whenWords(at, now) : recording.name}
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
                className="flex items-center gap-1 justify-self-start rounded text-[13px] font-medium text-body outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
    /** What the gateway keeps of the fault; null when it had nothing to say, undefined while reading */
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
        () => snapshots.filter(isRosbagSnapshot).sort((a, b) => recordedAt(b) - recordedAt(a)),
        [snapshots]
    );
    const capture = captureTime(frames);
    const times: FaultTimes = faultTimes(fault, capture ?? (recordings[0] ? recordedAt(recordings[0]) : null));

    // Only the topics medkit named and that have a reading in words are read again.
    const topics = useMemo(() => {
        const named = new Set(frames.map((frame) => frame['x-medkit']?.topic).filter(Boolean));
        return readingRows(frames, new Map(), '')
            .map((row) => row.then.topic)
            .filter((topic, i, all) => named.has(topic) && all.indexOf(topic) === i);
    }, [frames]);
    const entityType = mapFaultEntityTypeToResourceType(fault.entity_type);
    const live = useLiveFaultReadings(entityType, fault.entity_id, topics, open);
    const rows = useMemo(() => readingRows(frames, live.values, fault.message), [frames, live.values, fault.message]);
    const story = storyRows(fault, times, now, live.readAt);

    const back = (
        <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 justify-self-start self-start rounded text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring @2xl:hidden"
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
    const canClear = fault.status === 'active' || fault.status === 'pending';
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
                    {(newest || canClear) && (
                        <div className="flex shrink-0 items-center gap-1.5">
                            {newest && <RecordingDownload recording={newest} now={now} look="head" />}
                            {canClear && (
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
                        <ReadingsTable rows={rows} live={open && topics.length > 0} earlier={times.captureIsEarlier} />
                    )}
                    {recordings.length > 1 && <EarlierRecordings recordings={recordings.slice(1)} now={now} />}
                    <RawSnapshots snapshots={snapshots} />
                    {snapshots.length === 0 && (
                        <p className="text-[13px] text-faint">
                            {details === null
                                ? 'The gateway did not answer with what it kept of this fault.'
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
