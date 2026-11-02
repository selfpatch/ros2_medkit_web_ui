import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    AlertOctagon,
    AlertTriangle,
    CheckCircle,
    ChevronDown,
    Filter,
    Loader2,
    RefreshCw,
    Search,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EntityToolbar } from '@/components/EntityToolbar';
import { FaultDetail } from '@/components/FaultDetail';
import { SeverityChip, StatusSwatch } from '@/components/FaultRow';
import { SEGMENT_GROUP, segmentClass } from '@/components/SegmentedSwitch';
import { useAppStore } from '@/lib/store';
import { useFaultPolling } from '@/hooks/useFaultPolling';
import { useMeasured } from '@/hooks/useMeasured';
import { isOpen, lastReportedAt, toMs, whenWords } from '@/lib/fault-story';
import type { Fault, FaultSeverity, FaultResponse, FaultStatusValue } from '@/lib/types';
import { cn, faultKey, mapFaultEntityTypeToResourceType } from '@/lib/utils';

type Tab = 'now' | 'history';

/** How bad each severity is, worst highest */
const DISPLAY_SEVERITY_RANK: Record<FaultSeverity, number> = {
    critical: 3,
    error: 2,
    warning: 1,
    info: 0,
};

/** Now: worst first, then most recent, then by identity so equal rows never swap places */
function compareFaultsForDisplay(a: Fault, b: Fault): number {
    const bySeverity = DISPLAY_SEVERITY_RANK[b.severity] - DISPLAY_SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byTime = b.timestamp.localeCompare(a.timestamp);
    if (byTime !== 0) return byTime;
    return faultKey(a).localeCompare(faultKey(b));
}

/** History: the newest report first, then by identity */
function compareByLastReport(a: Fault, b: Fault): number {
    return (lastReportedAt(b) ?? 0) - (lastReportedAt(a) ?? 0) || faultKey(a).localeCompare(faultKey(b));
}

// A fault's details are read again when it comes or ends, not on every report of it: a node
// that keeps reporting moves its newest report along every few seconds, and every PASSED
// report moves the last pass, also while the fault stays confirmed. An open fault's new
// recordings come with its 30 s read below; an ended one changed once its newest report
// moved (it was reported again and ended again between two reads of the list).
const versionOf = (fault: Fault) =>
    isOpen(fault) ? fault.status : `${fault.status}|${String(fault.parameters?.last_occurred ?? '')}`;

// An open fault's details are read again now and then: its recording is written some
// seconds after it came.
const OPEN_DETAILS_EVERY_MS = 30_000;

const SEVERITIES: { value: FaultSeverity; label: string }[] = [
    { value: 'critical', label: 'Critical' },
    { value: 'error', label: 'Error' },
    { value: 'warning', label: 'Warning' },
    { value: 'info', label: 'Info' },
];

// The statuses each tab lists: Now the open ones, History the ended ones.
const TAB_STATUSES: Record<Tab, { value: FaultStatusValue; label: string }[]> = {
    now: [
        { value: 'active', label: 'Active' },
        { value: 'pending', label: 'Pending' },
    ],
    history: [
        { value: 'healed', label: 'Healed' },
        { value: 'cleared', label: 'Cleared' },
    ],
};

/**
 * Whether the layout shows an element: one it hides (display: none) has no box. A fault is
 * picked for the pane only once the pane shows, so a phone-wide list reads nothing it does
 * not show.
 */
const isLaidOut = (node: HTMLElement) => node.getClientRects().length > 0;

/** The two halves of the page, as a segmented switch: what is open now, and what ended */
const TABS: { id: Tab; label: string }[] = [
    { id: 'now', label: 'Now' },
    { id: 'history', label: 'History' },
];

function TabSwitch({ tab, onChange, openCount }: { tab: Tab; onChange: (tab: Tab) => void; openCount: number }) {
    return (
        <div className={SEGMENT_GROUP}>
            {TABS.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    aria-pressed={tab === id}
                    onClick={() => onChange(id)}
                    className={segmentClass(tab === id, 'md')}
                >
                    {label}
                    {id === 'now' && openCount > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-state-fault-bg px-1 text-[11px] font-semibold text-state-fault-text tabular-nums">
                            {openCount}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

/** How many open faults there are of each severity, worst first; a severity none has is left out */
function SeverityCounts({ faults }: { faults: Fault[] }) {
    return (
        <span className="flex flex-wrap items-center gap-1">
            {SEVERITIES.map(({ value }) => {
                const count = faults.filter((f) => f.severity === value).length;
                if (count === 0) return null;
                const word = value === 'info' || count === 1 ? value : `${value}s`;
                return (
                    <SeverityChip key={value} severity={value}>
                        {count} {word}
                    </SeverityChip>
                );
            })}
        </span>
    );
}

/** A filter of the list: a menu of checkboxes, every one on until someone turns it off */
function FilterMenu<T extends string>({
    label,
    options,
    chosen,
    onToggle,
}: {
    label: string;
    options: { value: T; label: string }[];
    chosen: ReadonlySet<T>;
    onToggle: (value: T) => void;
}) {
    const on = options.filter((option) => chosen.has(option.value)).length;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'flex h-7 items-center gap-1 rounded-[7px] px-1.5 text-xs font-medium outline-none hover:bg-canvas focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
                        on < options.length ? 'text-foreground' : 'text-muted-foreground'
                    )}
                >
                    <Filter aria-hidden className="size-3.5" />
                    {label}
                    {on < options.length && (
                        <span className="tabular-nums">
                            {on}/{options.length}
                        </span>
                    )}
                    <ChevronDown aria-hidden className="size-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {options.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={chosen.has(option.value)}
                        onCheckedChange={() => onToggle(option.value)}
                        // Stays open: one filter is often several boxes.
                        onSelect={(event) => event.preventDefault()}
                    >
                        {option.label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** The set with `value` turned on if it was off, off if it was on */
function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
}

// A code may break after its underscores, never inside a word; its text stays the code.
function breakable(code: string) {
    return code.split('_').map((part, i) => (
        <Fragment key={i}>
            {i > 0 && (
                <>
                    _<wbr />
                </>
            )}
            {part}
        </Fragment>
    ));
}

/**
 * A fault in the list: how it stands as a small square, its entity in bold (under an
 * entity's heading the entity goes without saying) and its code, what it says on one line,
 * how bad it is and when it came. An open fault has its Clear beside it.
 */
function ListItem({
    fault,
    selected,
    withEntity,
    now,
    onPick,
    onClear,
    isClearing,
}: {
    fault: Fault;
    selected: boolean;
    withEntity: boolean;
    now: number;
    onPick: () => void;
    onClear: () => void;
    isClearing: boolean;
}) {
    const open = isOpen(fault);
    const came = toMs(fault.timestamp);
    const code = (
        <code className="min-w-0 font-mono text-xs leading-snug [overflow-wrap:anywhere] text-body">
            {breakable(fault.code)}
        </code>
    );
    return (
        <li className="relative">
            <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={onPick}
                className={cn(
                    'grid w-full gap-0.5 rounded-[9px] py-1.5 pl-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
                    open ? 'pr-9' : 'pr-2.5',
                    selected ? 'raised' : 'hover:bg-canvas'
                )}
            >
                <span className="flex min-w-0 items-center gap-1.5">
                    <StatusSwatch status={fault.status} />
                    {withEntity ? (
                        <b className="truncate text-[13px] leading-snug font-semibold text-foreground">
                            {fault.entity_id}
                        </b>
                    ) : (
                        code
                    )}
                </span>
                {withEntity && code}
                {fault.message && <span className="truncate text-xs text-muted-foreground">{fault.message}</span>}
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <SeverityChip severity={fault.severity} />
                    {came !== null && (
                        <time dateTime={fault.timestamp} className="truncate text-[11px] text-faint tabular-nums">
                            {whenWords(came, now)}
                        </time>
                    )}
                </span>
            </button>
            {/* Beside the pick, not in it: a button holds no other button. */}
            {open && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClear}
                    disabled={isClearing}
                    aria-label={`Clear fault ${fault.code}`}
                    title="Clear fault"
                    className="absolute top-1 right-1 size-7 text-muted-foreground hover:text-destructive"
                >
                    {isClearing ? (
                        <Loader2 aria-hidden className="size-3.5 animate-spin" />
                    ) : (
                        <Trash2 aria-hidden className="size-3.5" />
                    )}
                </Button>
            )}
        </li>
    );
}

/**
 * Loading skeleton for dashboard
 */
function DashboardSkeleton() {
    return (
        <div className="grid content-start gap-2 px-1.5 py-4 sm:px-3.5 @2xl:w-[184px]">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid gap-1.5 px-2.5 py-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-32" />
                </div>
            ))}
        </div>
    );
}

/**
 * Faults Dashboard - every fault the gateway knows, as the selfpatch platform's fault page
 *
 * Three panes on a wide screen: the faults (Now: open; History: ended; filtered by
 * severity and status, grouped by entity unless asked not to), the picked fault's life
 * moment by moment, and the fault itself (how it stands, what is wrong in words, what the
 * robot read when it came and now, its recordings). Narrower, the list and the fault take
 * turns.
 *
 * Uses shared faults state from useAppStore to avoid duplicate API calls
 * when both FaultsDashboard and FaultsCountBadge are visible.
 */
export function FaultsDashboard() {
    // A page per gateway: fault keys repeat across gateways, so what the page picked, kept
    // and read of one gateway's faults must not carry over to the next one's.
    const serverUrl = useAppStore((state) => state.serverUrl);
    return <FaultsPage key={serverUrl ?? ''} />;
}

/**
 * What was asked of the gateway about the fault on the page once the list dropped it: a
 * read of the whole list, its answer still out or in. Once the answer is in, a fault still
 * missing from the list is gone; a clear someone asked for counts as such an answer.
 */
type AskedAbout = { key: string; answered: boolean } | null;

function FaultsPage() {
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Keyed by faultKey, not by code: one code can be reported by two entities.
    const [clearingCodes, setClearingCodes] = useState<Set<string>>(new Set());
    // What the gateway keeps of each fault; null when it could not be read.
    const [faultDetails, setFaultDetails] = useState<Map<string, FaultResponse | null>>(new Map());
    const requested = useRef(new Map<string, string>());

    const [tab, setTab] = useState<Tab>('now');
    const [query, setQuery] = useState('');
    const [groupByEntity, setGroupByEntity] = useState(true);
    const [severityFilters, setSeverityFilters] = useState<ReadonlySet<FaultSeverity>>(
        () => new Set(SEVERITIES.map(({ value }) => value))
    );
    // Both tabs' statuses: each tab offers and applies its own.
    const [statusFilters, setStatusFilters] = useState<ReadonlySet<FaultStatusValue>>(
        () => new Set([...TAB_STATUSES.now, ...TAB_STATUSES.history].map(({ value }) => value))
    );
    // The fault on the page, and whether someone picked it (which a narrow screen follows).
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [picked, setPicked] = useState(false);
    // The fault picked on Now stays in its list when it ends while someone watches it.
    const [watchedKey, setWatchedKey] = useState<string | null>(null);
    // The fault on the page as last listed, and what was asked about it (see AskedAbout).
    const lastShown = useRef<Fault | null>(null);
    const askedAbout = useRef<AskedAbout>(null);
    const [, setAnswered] = useState(0);
    const [pane, paneLaidOut] = useMeasured<HTMLDivElement, boolean>(isLaidOut, false);

    // Use shared faults state from store
    const {
        faults,
        isLoadingFaults,
        faultsError,
        autoRefresh,
        setAutoRefresh,
        isConnected,
        fetchFaults,
        clearFault,
        getFaultWithEnvironmentData,
    } = useAppStore(
        useShallow((state) => ({
            faults: state.faults,
            isLoadingFaults: state.isLoadingFaults,
            faultsError: state.faultsError,
            autoRefresh: state.faultsAutoRefresh,
            setAutoRefresh: state.setFaultsAutoRefresh,
            isConnected: state.isConnected,
            fetchFaults: state.fetchFaults,
            clearFault: state.clearFault,
            getFaultWithEnvironmentData: state.getFaultWithEnvironmentData,
        }))
    );

    // Refreshes are shared with every other mounted fault view, so the gateway sees
    // one request per refresh no matter how many of them are on screen.
    useFaultPolling();

    // Clear fault handler
    const handleClear = useCallback(
        // The whole Fault, not its code: two entities can report the same code,
        // and resolving through `faults.find` cleared the FIRST entity's fault
        // whichever row was clicked.
        async (fault: Fault) => {
            const key = faultKey(fault);
            setClearingCodes((prev) => new Set([...prev, key]));
            // The fault on the page gone after a clear is what was asked for: no read to find out why.
            if (lastShown.current && faultKey(lastShown.current) === key) {
                askedAbout.current = { key, answered: true };
            }

            try {
                // Map the fault's entity_type to the correct resource type for the API
                const entityGroup = mapFaultEntityTypeToResourceType(fault.entity_type);
                // clearFault re-reads the list itself, whether or not the delete succeeded.
                await clearFault(entityGroup, fault.entity_id, fault.code);
            } finally {
                setClearingCodes((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        },
        [clearFault]
    );

    // Read what the gateway keeps of a fault. `force` reads again (a press on the fault
    // asks anew: it gains recordings while the page is open); otherwise a fault is read
    // once a time it comes or ends.
    const loadDetails = useCallback(
        async (fault: Fault, force: boolean) => {
            const key = faultKey(fault);
            const version = versionOf(fault);
            if (!force && requested.current.get(key) === version) return;
            requested.current.set(key, version);
            try {
                const entityGroup = mapFaultEntityTypeToResourceType(fault.entity_type);
                const details = (await getFaultWithEnvironmentData(
                    entityGroup,
                    fault.entity_id,
                    fault.code
                )) as FaultResponse | null;
                // A 404 resolves to null rather than throwing; overwriting the
                // cache with it would blank evidence that was already on screen.
                setFaultDetails((prev) => (!details && prev.get(key) ? prev : new Map(prev).set(key, details ?? null)));
            } catch (err) {
                console.error('Failed to fetch fault details:', err);
                setFaultDetails((prev) => (prev.has(key) ? prev : new Map(prev).set(key, null)));
            }
        },
        [getFaultWithEnvironmentData]
    );

    const openFaults = useMemo(() => faults.filter(isOpen), [faults]);
    const openCount = openFaults.length;
    // The gateway's stream says "cleared" for a fault that healed as well, and the list
    // drops it. The fault on the page stays as it was until a read of the whole list says
    // how it ended, or that it is gone.
    const last = lastShown.current;
    const asked = askedAbout.current;
    const dropped =
        last &&
        !(asked?.key === faultKey(last) && asked.answered) &&
        !faults.some((f) => faultKey(f) === faultKey(last))
            ? last
            : null;
    // Each tab's faults, filtered, in a fixed order. Rows arrive in whatever order the
    // gateway or the stream produced them, and a row that moves while the pointer is on its
    // way to it is a row that opens the wrong fault.
    const items = useMemo(() => {
        const listed = (dropped ? [...faults, dropped] : faults).filter((f) => severityFilters.has(f.severity));
        if (tab === 'now') {
            // An ended fault stays only while someone watches it, whatever the statuses say.
            return listed
                .filter((f) => (isOpen(f) ? statusFilters.has(f.status) : faultKey(f) === watchedKey))
                .sort(compareFaultsForDisplay);
        }
        const q = query.trim().toLowerCase();
        return listed
            .filter((f) => !isOpen(f) && statusFilters.has(f.status))
            .filter((f) => !q || [f.entity_id, f.code, f.message].some((text) => text.toLowerCase().includes(q)))
            .sort(compareByLastReport);
    }, [faults, dropped, tab, watchedKey, query, severityFilters, statusFilters]);

    // Group faults by entity. A group comes where its entity's first fault comes in the
    // list: its worst one on Now, its newest one on History.
    const groupedFaults = useMemo(() => {
        const groups = new Map<string, { entityId: string; entityType: string; faults: Fault[] }>();
        for (const fault of items) {
            // Keyed by type and id: an app and the component it runs on can share a name,
            // and merging them puts one entity's faults under another entity's heading.
            const key = `${fault.entity_type}/${fault.entity_id}`;
            if (!groups.has(key)) {
                groups.set(key, { entityId: fault.entity_id, entityType: fault.entity_type, faults: [] });
            }
            groups.get(key)!.faults.push(fault);
        }
        return Array.from(groups.entries());
    }, [items]);

    // The picked fault while it is listed; on a pane that shows, the first one until then.
    const picks = items.find((f) => faultKey(f) === selectedKey) ?? null;
    const shown = picks ?? (paneLaidOut ? (items[0] ?? null) : null);
    const shownKey = shown ? faultKey(shown) : null;
    const showingDetail = picked && shown !== null;
    // A pane the layout hides draws nothing and reads nothing.
    const drawn = shown !== null && (paneLaidOut || showingDetail) ? shown : null;
    const shownOpen = shown ? isOpen(shown) : false;

    // Hold the fault on screen: a newer one coming on top of the list does not take its place.
    useEffect(() => {
        if (shownKey !== null && shownKey !== selectedKey) setSelectedKey(shownKey);
    }, [shownKey, selectedKey]);
    useEffect(() => {
        setWatchedKey(tab === 'now' ? shownKey : null);
    }, [tab, shownKey]);

    useEffect(() => {
        if (!dropped) {
            if (last && faults.some((f) => faultKey(f) === faultKey(last))) askedAbout.current = null;
            return;
        }
        const key = faultKey(dropped);
        if (askedAbout.current?.key === key) return;
        askedAbout.current = { key, answered: false };
        void fetchFaults({ force: true }).finally(() => {
            askedAbout.current = { key, answered: true };
            setAnswered((n) => n + 1);
        });
    }, [dropped, last, faults, fetchFaults]);
    useEffect(() => {
        lastShown.current = shown;
    }, [shown]);

    useEffect(() => {
        if (drawn) void loadDetails(drawn, false);
    }, [drawn, loadDetails]);

    const drawnRef = useRef(drawn);
    drawnRef.current = drawn;
    useEffect(() => {
        if (!drawn || !shownOpen) return;
        const timer = window.setInterval(() => {
            if (drawnRef.current) void loadDetails(drawnRef.current, true);
        }, OPEN_DETAILS_EVERY_MS);
        return () => window.clearInterval(timer);
        // Started per fault on screen, not per new copy of it in the list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shownKey, drawn !== null, shownOpen, loadDetails]);

    // Refresh reads the list again, and the fault on the page whose details could not be
    // read: an ended fault is not read again on its own.
    const handleRefresh = async () => {
        setIsRefreshing(true);
        if (drawn && faultDetails.get(faultKey(drawn)) === null) void loadDetails(drawn, true);
        // Forced: pressing refresh must start a read, not wait out one already running.
        await fetchFaults({ force: true });
        setIsRefreshing(false);
    };

    const pick = (fault: Fault) => {
        setSelectedKey(faultKey(fault));
        setPicked(true);
        void loadDetails(fault, true);
    };

    const switchTab = (next: Tab) => {
        setTab(next);
        setSelectedKey(null);
        setPicked(false);
    };

    if (!isConnected) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Connect to a server to view faults.</p>
            </div>
        );
    }

    const isBusy = isRefreshing || isLoadingFaults;
    const now = Date.now();

    // The page's line on top: its name, Now and History, how many are open, and keeping it fresh
    const toolbar = (
        <EntityToolbar
            title="Faults Dashboard"
            lead={
                <>
                    <TabSwitch tab={tab} onChange={switchTab} openCount={faultsError ? 0 : openCount} />
                    {faultsError ? (
                        <span className="text-sm text-faint">Fault status unknown</span>
                    ) : openCount === 0 ? (
                        <span className="text-sm text-faint">No faults detected</span>
                    ) : (
                        <SeverityCounts faults={openFaults} />
                    )}
                </>
            }
            actions={
                <>
                    <div className="flex items-center gap-2 text-sm">
                        <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} id="auto-refresh" />
                        <label htmlFor="auto-refresh" className="cursor-pointer text-muted-foreground">
                            Auto-refresh
                        </label>
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={handleRefresh}
                        disabled={isBusy}
                        title="Refresh faults"
                    >
                        <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                    </Button>
                </>
            }
        />
    );

    if (isLoadingFaults && faults.length === 0) {
        return (
            <div className="@container flex h-full min-h-0 flex-col">
                {toolbar}
                <DashboardSkeleton />
            </div>
        );
    }

    let body;
    if (faultsError && faults.length === 0) {
        body = (
            <div className="flex flex-col items-start px-4 py-6 sm:px-6">
                <AlertOctagon className="mb-3 size-8 text-state-fault" />
                <p className="font-medium text-foreground">Fault list unavailable</p>
                <p className="max-w-md text-sm text-muted-foreground">
                    The gateway did not answer with a fault list, so this page cannot say whether anything is wrong.
                    This is not the same as a system without faults.
                </p>
                <p className="mt-2 font-mono text-xs text-destructive">{faultsError}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh} disabled={isBusy}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Try again
                </Button>
            </div>
        );
    } else if (tab === 'now' && items.length === 0 && openCount === 0) {
        // Nothing open in the last list. Only a list that is current says the system is fine.
        body = faultsError ? (
            <div className="flex flex-col items-start px-4 py-6 text-muted-foreground sm:px-6">
                <AlertTriangle className="mb-3 size-8 text-state-warn" />
                <p className="font-medium text-foreground">Fault status unknown</p>
                <p className="max-w-md text-sm">
                    The last list held no open fault, but the gateway is not answering for faults now.
                </p>
            </div>
        ) : (
            <div className="flex flex-col items-start px-4 py-6 text-muted-foreground sm:px-6">
                <CheckCircle className="mb-3 size-8 text-state-ok" />
                <p className="font-medium text-foreground">No faults to display</p>
                <p className="text-sm">System is operating normally</p>
            </div>
        );
    } else {
        const list = (faultsOfList: Fault[], withEntity: boolean) => (
            <ul className="grid gap-0.5">
                {faultsOfList.map((fault) => (
                    <ListItem
                        key={faultKey(fault)}
                        fault={fault}
                        withEntity={withEntity}
                        now={now}
                        selected={drawn !== null && faultKey(drawn) === faultKey(fault)}
                        onPick={() => pick(fault)}
                        onClear={() => handleClear(fault)}
                        isClearing={clearingCodes.has(faultKey(fault))}
                    />
                ))}
            </ul>
        );
        const sharedIds = new Set(
            groupedFaults.map(([, group]) => group.entityId).filter((id, i, all) => all.indexOf(id) !== i)
        );
        // Whether the tab has faults the filters hide, rather than none at all.
        const filteredOut =
            tab === 'now' ? openCount > 0 : faults.some((f) => !isOpen(f)) || (dropped !== null && !isOpen(dropped));
        body = (
            <div className="min-h-0 flex-1 overflow-y-auto @2xl:grid @2xl:grid-cols-[184px_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)] @2xl:overflow-hidden">
                <nav
                    aria-label={tab === 'now' ? 'Faults now' : 'Fault history'}
                    className={cn(
                        'grid content-start gap-3 px-1.5 py-3 sm:px-3.5 @2xl:min-h-0 @2xl:overflow-y-auto @2xl:border-r @2xl:border-hairline',
                        showingDetail && '@max-2xl:hidden'
                    )}
                >
                    {tab === 'history' && (
                        <label className="relative block">
                            <span className="sr-only">Search faults</span>
                            <Search
                                aria-hidden
                                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint"
                            />
                            <input
                                type="search"
                                placeholder="Entity, code or words"
                                autoComplete="off"
                                spellCheck={false}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-8 w-full truncate rounded-[9px] border border-graphite/10 bg-white pr-2 pl-8 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-faint hover:border-graphite/20 focus:border-graphite/35 focus:shadow-[0_0_0_4px_rgb(18_20_19/0.05)]"
                            />
                        </label>
                    )}
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-1">
                        <FilterMenu
                            label="Severity"
                            options={SEVERITIES}
                            chosen={severityFilters}
                            onToggle={(value) => setSeverityFilters((was) => toggled(was, value))}
                        />
                        <FilterMenu
                            label="Status"
                            options={TAB_STATUSES[tab]}
                            chosen={statusFilters}
                            onToggle={(value) => setStatusFilters((was) => toggled(was, value))}
                        />
                        <span className="flex items-center gap-2 px-1.5">
                            <Switch
                                size="sm"
                                checked={groupByEntity}
                                onCheckedChange={setGroupByEntity}
                                id="group-by"
                            />
                            <label htmlFor="group-by" className="cursor-pointer text-xs text-muted-foreground">
                                Group by entity
                            </label>
                        </span>
                    </div>
                    {items.length === 0 ? (
                        <p className="px-2.5 py-4 text-[13px] text-faint">
                            {query.trim() && tab === 'history'
                                ? `No fault matches “${query.trim()}”.`
                                : filteredOut
                                  ? 'Adjust filters to see more faults'
                                  : faults.length > 0
                                    ? 'Every fault is open now.'
                                    : 'No faults yet.'}
                        </p>
                    ) : groupByEntity ? (
                        groupedFaults.map(([groupKey, { entityId, entityType, faults: entityFaults }]) => (
                            <div
                                key={groupKey}
                                role="group"
                                aria-labelledby={`faults-of-${groupKey}`}
                                className="grid gap-0.5"
                            >
                                <div className="flex items-baseline gap-1.5 px-2.5 pt-1">
                                    <h3
                                        id={`faults-of-${groupKey}`}
                                        className="truncate font-sans text-sm font-medium tracking-normal text-foreground"
                                    >
                                        {entityId}
                                    </h3>
                                    {sharedIds.has(entityId) && (
                                        <span className="text-[11px] text-faint">{entityType}</span>
                                    )}
                                </div>
                                {list(entityFaults, false)}
                            </div>
                        ))
                    ) : (
                        list(items, true)
                    )}
                </nav>
                <div ref={pane} className={cn('min-w-0 @2xl:min-h-0', !showingDetail && '@max-2xl:hidden')}>
                    {drawn && (
                        <FaultDetail
                            key={faultKey(drawn)}
                            fault={drawn}
                            details={faultDetails.get(faultKey(drawn))}
                            onBack={() => setPicked(false)}
                            onClear={() => handleClear(drawn)}
                            isClearing={clearingCodes.has(faultKey(drawn))}
                        />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="@container flex h-full min-h-0 flex-col">
            {toolbar}
            {faultsError && faults.length > 0 && (
                <p className="border-b border-hairline px-4 py-2 font-mono text-xs text-destructive sm:px-6">
                    Last refresh failed, these faults may be out of date: {faultsError}
                </p>
            )}
            {body}
        </div>
    );
}

// The count beside a place in the sidebar, as the selfpatch platform's.
const COUNT_PILL =
    'ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full px-[5px] text-[11px] font-semibold tabular-nums';

/**
 * Faults count badge for sidebar.
 *
 * Reads the shared fault list and joins the shared refresh, so the badge keeps
 * counting whether or not the dashboard is open and without a second request.
 */
export function FaultsCountBadge() {
    const { faults, faultsError } = useAppStore(
        useShallow((state) => ({ faults: state.faults, faultsError: state.faultsError }))
    );

    useFaultPolling();

    // Count active critical/error faults
    const count = useMemo(() => {
        return faults.filter((f) => f.status === 'active' && (f.severity === 'critical' || f.severity === 'error'))
            .length;
    }, [faults]);

    // A count nobody could check is worse than no count: it reads as "all good" from
    // across the room while the gateway is not answering for faults at all.
    if (faultsError) {
        // The last known count still says more than a question mark; the marker says it
        // was not checked. Only with nothing known at all is there no number to show.
        return (
            <span
                className={cn(COUNT_PILL, 'text-state-fault-text shadow-[inset_0_0_0_1px_rgb(214_69_69/0.45)]')}
                title={`This count could not be checked: ${faultsError}`}
            >
                {count > 0 ? count : '?'}
            </span>
        );
    }

    if (count === 0) return null;

    return <span className={cn(COUNT_PILL, 'bg-state-fault-bg text-state-fault-text')}>{count}</span>;
}
