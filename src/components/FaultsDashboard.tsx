import { Fragment, useState, useCallback, useEffect, useMemo, useRef, type RefCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { AlertOctagon, AlertTriangle, CheckCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EntityToolbar } from '@/components/EntityToolbar';
import { FaultDetail } from '@/components/FaultDetail';
import { StatusSwatch } from '@/components/FaultRow';
import { useAppStore } from '@/lib/store';
import { useFaultPolling } from '@/hooks/useFaultPolling';
import { isOpen, toMs } from '@/lib/fault-story';
import type { Fault, FaultSeverity, FaultResponse } from '@/lib/types';
import { cn, faultKey, mapFaultEntityTypeToResourceType } from '@/lib/utils';

type Tab = 'now' | 'history';

/** Worst first, then most recent, then by identity so equal rows never swap places. */
const DISPLAY_SEVERITY_RANK: Record<FaultSeverity, number> = {
    critical: 3,
    error: 2,
    warning: 1,
    info: 0,
};

function compareFaultsForDisplay(a: Fault, b: Fault): number {
    const bySeverity = DISPLAY_SEVERITY_RANK[b.severity] - DISPLAY_SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byTime = b.timestamp.localeCompare(a.timestamp);
    if (byTime !== 0) return byTime;
    return faultKey(a).localeCompare(faultKey(b));
}

/** History: the newest end first */
function compareByEnd(a: Fault, b: Fault): number {
    const ended = (fault: Fault) => toMs(fault.parameters?.last_passed) ?? toMs(fault.parameters?.last_occurred) ?? 0;
    return ended(b) - ended(a) || faultKey(a).localeCompare(faultKey(b));
}

// A fault's details are read again when it comes or ends, not on every report of it: a node
// that keeps reporting moves its newest report along every few seconds.
const versionOf = (fault: Fault) => `${fault.status}|${String(fault.parameters?.last_passed ?? '')}`;

// An open fault's details are read again now and then: its recording is written some
// seconds after it came.
const OPEN_DETAILS_EVERY_MS = 30_000;

/**
 * Whether an element is laid out: a pane the layout hides (display: none) is not. A fault
 * is picked for a pane only once the pane shows, so a phone-wide list reads nothing it
 * does not show. A callback ref: the pane comes and goes with the list.
 */
function useLaidOut<T extends HTMLElement>(): [RefCallback<T>, boolean] {
    const [laidOut, setLaidOut] = useState(false);
    const watching = useRef<ResizeObserver | null>(null);
    const ref = useCallback((node: T | null) => {
        watching.current?.disconnect();
        watching.current = null;
        if (!node) {
            setLaidOut(false);
            return;
        }
        const sized = new ResizeObserver(() => setLaidOut(node.getClientRects().length > 0));
        sized.observe(node);
        watching.current = sized;
    }, []);
    return [ref, laidOut];
}

/** The two halves of the page, as a segmented switch: what is open now, and what ended */
function TabSwitch({ tab, onChange, openCount }: { tab: Tab; onChange: (tab: Tab) => void; openCount: number }) {
    const tabs: { id: Tab; label: string }[] = [
        { id: 'now', label: 'Now' },
        { id: 'history', label: 'History' },
    ];
    return (
        <div className="inline-flex gap-px rounded-[9px] bg-canvas-2 p-0.5">
            {tabs.map(({ id, label }) => (
                <button
                    key={id}
                    type="button"
                    aria-pressed={tab === id}
                    onClick={() => onChange(id)}
                    className={cn(
                        'flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                        tab === id ? 'raised text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
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
 * A fault in the list: its entity in bold with how it stands as a small square, and its
 * code under it. Under an entity's heading the entity goes without saying.
 */
function ListItem({
    fault,
    selected,
    withEntity,
    onPick,
}: {
    fault: Fault;
    selected: boolean;
    withEntity: boolean;
    onPick: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={onPick}
                className={cn(
                    'grid w-full gap-0.5 rounded-[9px] px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                    selected ? 'raised' : 'hover:bg-canvas'
                )}
            >
                {withEntity && (
                    <span className="flex min-w-0 items-center justify-between gap-2">
                        <b className="truncate text-[13px] leading-snug font-semibold text-foreground">
                            {fault.entity_id}
                        </b>
                        <StatusSwatch status={fault.status} />
                    </span>
                )}
                <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 font-mono text-xs leading-snug [overflow-wrap:anywhere] text-body">
                        {breakable(fault.code)}
                    </span>
                    {!withEntity && <StatusSwatch status={fault.status} />}
                </span>
            </button>
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
 * Three panes on a wide screen: the faults (Now: open; History: ended), the picked fault's
 * life moment by moment, and the fault itself (how it stands, what is wrong in words, what
 * the robot read when it came and now, its recordings). Narrower, the list and the fault
 * take turns.
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

function FaultsPage() {
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Keyed by faultKey, not by code: one code can be reported by two entities.
    const [clearingCodes, setClearingCodes] = useState<Set<string>>(new Set());
    // What the gateway keeps of each fault; null once it answered with nothing.
    const [faultDetails, setFaultDetails] = useState<Map<string, FaultResponse | null>>(new Map());
    const requested = useRef(new Map<string, string>());

    const [tab, setTab] = useState<Tab>('now');
    const [query, setQuery] = useState('');
    const [groupByEntity, setGroupByEntity] = useState(false);
    // The fault on the page, and whether someone picked it (which a narrow screen follows).
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [picked, setPicked] = useState(false);
    // The fault picked on Now stays in its list when it ends while someone watches it.
    const [watchedKey, setWatchedKey] = useState<string | null>(null);
    // The fault on the page as last listed, and the one whose fate a read was asked for
    // (`<key>#read` once it answered).
    const lastShown = useRef<Fault | null>(null);
    const askedAbout = useRef<string | null>(null);
    const [, setAnswered] = useState(0);
    const [pane, paneLaidOut] = useLaidOut<HTMLDivElement>();

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

    // Manual refresh handler
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        // Forced: pressing refresh must start a read, not wait out one already running.
        await fetchFaults({ force: true });
        setIsRefreshing(false);
    }, [fetchFaults]);

    // Clear fault handler
    const handleClear = useCallback(
        // The whole Fault, not its code: two entities can report the same code,
        // and resolving through `faults.find` cleared the FIRST entity's fault
        // whichever row was clicked.
        async (fault: Fault) => {
            const key = faultKey(fault);
            setClearingCodes((prev) => new Set([...prev, key]));
            // Gone after a clear is what was asked for: no read to find out why.
            askedAbout.current = `${key}#read`;

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

    // Each tab's faults in a fixed order. Rows arrive in whatever order the gateway or the
    // stream produced them, and a row that moves while the pointer is on its way to it is
    // a row that opens the wrong fault.
    const openCount = useMemo(() => faults.filter(isOpen).length, [faults]);
    // The gateway's stream says "cleared" for a fault that healed as well, and the list
    // drops it. The fault on the page stays as it was until a read of the whole list says
    // how it ended, or that it is gone.
    const last = lastShown.current;
    const dropped =
        last && askedAbout.current !== `${faultKey(last)}#read` && !faults.some((f) => faultKey(f) === faultKey(last))
            ? last
            : null;
    const items = useMemo(() => {
        const listed = dropped ? [...faults, dropped] : faults;
        if (tab === 'now') {
            return listed.filter((f) => isOpen(f) || faultKey(f) === watchedKey).sort(compareFaultsForDisplay);
        }
        const q = query.trim().toLowerCase();
        return listed
            .filter((f) => !isOpen(f))
            .filter((f) => !q || [f.entity_id, f.code, f.message].some((text) => text.toLowerCase().includes(q)))
            .sort(compareByEnd);
    }, [faults, dropped, tab, watchedKey, query]);

    // Group faults by entity, in the order their worst fault comes in the list.
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
        if (askedAbout.current === key) return;
        askedAbout.current = key;
        void fetchFaults({ force: true }).finally(() => {
            askedAbout.current = `${key}#read`;
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

    // The page's line on top: its name, Now and History, and keeping it fresh
    const toolbar = (
        <EntityToolbar
            title="Faults Dashboard"
            lead={
                <>
                    <TabSwitch tab={tab} onChange={switchTab} openCount={faultsError ? 0 : openCount} />
                    {faultsError ? (
                        <span className="text-sm text-faint">Fault status unknown</span>
                    ) : (
                        openCount === 0 && <span className="text-sm text-faint">No faults detected</span>
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
    } else if (tab === 'now' && items.length === 0) {
        body = (
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
                        selected={drawn !== null && faultKey(drawn) === faultKey(fault)}
                        onPick={() => pick(fault)}
                    />
                ))}
            </ul>
        );
        const sharedIds = new Set(
            groupedFaults.map(([, group]) => group.entityId).filter((id, i, all) => all.indexOf(id) !== i)
        );
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
                    <div className="flex items-center gap-2 px-2.5">
                        <Switch size="sm" checked={groupByEntity} onCheckedChange={setGroupByEntity} id="group-by" />
                        <label htmlFor="group-by" className="cursor-pointer text-xs text-muted-foreground">
                            Group by entity
                        </label>
                    </div>
                    {items.length === 0 ? (
                        <p className="px-2.5 py-4 text-[13px] text-faint">
                            {query.trim()
                                ? `No fault matches “${query.trim()}”.`
                                : faults.length > 0
                                  ? 'Every fault is open now.'
                                  : 'No faults yet.'}
                        </p>
                    ) : groupByEntity ? (
                        groupedFaults.map(([groupKey, { entityId, entityType, faults: entityFaults }]) => (
                            <div key={groupKey} className="grid gap-0.5">
                                <div className="flex items-baseline gap-1.5 px-2.5 pt-1">
                                    <h3 className="truncate font-sans text-sm font-medium tracking-normal text-foreground">
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
