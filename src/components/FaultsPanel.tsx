import { useEffect, useState, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaultList, FaultRow, SeverityChip } from '@/components/FaultRow';
import { useAppStore, type AppState } from '@/lib/store';
import type { Fault, FaultResponse, SovdResourceEntityType } from '@/lib/types';
import { faultKey, mapFaultEntityTypeToResourceType } from '@/lib/utils';

interface FaultsPanelProps {
    entityId: string;
    /** Type of entity */
    entityType?: SovdResourceEntityType;
}

/**
 * A clear in progress, by the entity it was asked on and the fault code. The panel stays
 * mounted when the selected entity changes, and another entity can list the same code.
 */
function clearingKey(entityType: SovdResourceEntityType, entityId: string, code: string): string {
    return `${entityType}/${entityId}/${code}`;
}

/**
 * Panel displaying faults for a component or app
 */
export function FaultsPanel({ entityId, entityType = 'components' }: FaultsPanelProps) {
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [clearingKeys, setClearingKeys] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [expandedFaults, setExpandedFaults] = useState<Set<string>>(new Set());
    const [faultDetails, setFaultDetails] = useState<Map<string, FaultResponse>>(new Map());
    const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

    const { listEntityFaults, getFaultWithEnvironmentData, clearFault } = useAppStore(
        useShallow((state: AppState) => ({
            listEntityFaults: state.listEntityFaults,
            getFaultWithEnvironmentData: state.getFaultWithEnvironmentData,
            clearFault: state.clearFault,
        }))
    );

    // The panel stays mounted when the selected entity changes, so the answer for the
    // entity shown before can arrive after the one shown now. Only the latest read may
    // write the list, and none once the entity changed or the panel is gone.
    const latestLoad = useRef(0);

    const loadFaults = useCallback(async () => {
        const load = ++latestLoad.current;
        setIsLoading(true);
        setError(null);

        try {
            const response = await listEntityFaults(entityType, entityId);
            if (load !== latestLoad.current) return;
            setFaults(response.items || []);
        } catch (err) {
            if (load !== latestLoad.current) return;
            setError(err instanceof Error ? err.message : 'Failed to load faults');
            setFaults([]);
        } finally {
            if (load === latestLoad.current) setIsLoading(false);
        }
    }, [listEntityFaults, entityId, entityType]);

    useEffect(() => {
        loadFaults();
        return () => {
            latestLoad.current += 1;
        };
    }, [loadFaults]);

    // A clear answers after the panel may have moved to another entity; the reload after
    // it is for the entity shown by then, not the one the cleared row belonged to.
    const loadShownFaults = useRef(loadFaults);
    useEffect(() => {
        loadShownFaults.current = loadFaults;
    }, [loadFaults]);

    const handleToggleFault = useCallback(
        // The whole Fault, not its code: a component's list spans every app it
        // hosts, so two apps under one component can report the same code and a
        // code-keyed lookup cannot tell them apart.
        async (fault: Fault) => {
            const key = faultKey(fault);
            // Functional update, BEFORE the await: the row opens on the click
            // (the previous entry stays rendered while the refetch runs), and a
            // second click during the request collapses instead of reading a
            // stale closed-over set and firing another GET.
            let opened = false;
            setExpandedFaults((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                    opened = true;
                }
                return next;
            });
            if (!opened) return;

            // Always refetch, even when a detail is already cached. A fault can
            // gain recordings while the page is open - it re-confirms, the black
            // box is written, the snapshot list grows - and a cache that is
            // filled once on first expand would keep serving the older list with
            // no way to refresh short of remounting.
            setLoadingDetails((prev) => new Set([...prev, key]));
            try {
                // Use the fault's own entity info (app-level) for correct bulk_data_uri.
                // Components have a synthetic FQN that doesn't match fault reporting sources,
                // so fetching via /components/{id}/faults/{code} produces an unusable bulk_data_uri.
                const detailEntityType: SovdResourceEntityType = fault.entity_type
                    ? mapFaultEntityTypeToResourceType(fault.entity_type)
                    : entityType;
                const detailEntityId = fault.entity_id || entityId;
                const details = await getFaultWithEnvironmentData(detailEntityType, detailEntityId, fault.code);
                // A 404 resolves to null rather than throwing; overwriting the
                // cache with it would blank evidence that was already on screen.
                if (details) {
                    setFaultDetails((prev) => new Map(prev).set(key, details as FaultResponse));
                }
            } catch (err) {
                console.error('Failed to fetch fault details:', err);
            } finally {
                setLoadingDetails((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        },
        [getFaultWithEnvironmentData, entityType, entityId]
    );

    const handleClear = useCallback(
        async (code: string) => {
            const key = clearingKey(entityType, entityId, code);
            setClearingKeys((prev) => new Set([...prev, key]));

            try {
                await clearFault(entityType, entityId, code);
                // Reload faults after clearing
                await loadShownFaults.current();
            } catch {
                // Error is handled by toast in the store
            } finally {
                setClearingKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        },
        [clearFault, entityId, entityType]
    );

    // Count faults by severity
    const errorCount = faults.filter((f) => f.severity === 'error' || f.severity === 'critical').length;
    const warningCount = faults.filter((f) => f.severity === 'warning').length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // The tab says these are faults: here only how bad, and a refresh
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-1.5">
                {errorCount > 0 && (
                    <SeverityChip severity="error">
                        {errorCount} error{errorCount !== 1 ? 's' : ''}
                    </SeverityChip>
                )}
                {warningCount > 0 && (
                    <SeverityChip severity="warning">
                        {warningCount} warning{warningCount !== 1 ? 's' : ''}
                    </SeverityChip>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-8 text-muted-foreground"
                    onClick={loadFaults}
                    title="Refresh faults"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
            {error ? (
                <p className="py-4 text-center text-sm text-destructive">{error}</p>
            ) : faults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <CheckCircle className="w-10 h-10 mb-3 text-state-ok" />
                    <p className="font-medium text-foreground">No faults detected</p>
                    <p className="text-xs">Component is operating normally</p>
                </div>
            ) : (
                <FaultList>
                    {faults.map((fault) => (
                        <FaultRow
                            key={fault.code}
                            fault={fault}
                            onClear={() => handleClear(fault.code)}
                            isClearing={clearingKeys.has(clearingKey(entityType, entityId, fault.code))}
                            isExpanded={expandedFaults.has(faultKey(fault))}
                            onToggle={() => handleToggleFault(fault)}
                            environmentData={faultDetails.get(faultKey(fault))?.environment_data}
                            isLoadingDetails={loadingDetails.has(faultKey(fault))}
                        />
                    ))}
                </FaultList>
            )}
        </section>
    );
}
