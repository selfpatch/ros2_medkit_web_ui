import { useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    AlertTriangle,
    Loader2,
    RefreshCw,
    Trash2,
    AlertCircle,
    AlertOctagon,
    Info,
    CheckCircle,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SnapshotCard } from './SnapshotCard';
import { useAppStore, type AppState } from '@/lib/store';
import type { Fault, FaultSeverity, FaultStatus, FaultResponse, SovdResourceEntityType } from '@/lib/types';
import { mapFaultEntityTypeToResourceType } from '@/lib/utils';

interface FaultsPanelProps {
    entityId: string;
    /** Type of entity */
    entityType?: SovdResourceEntityType;
}

/**
 * Get badge variant for fault severity
 */
function getSeverityBadgeVariant(severity: FaultSeverity): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (severity) {
        case 'critical':
        case 'error':
            return 'destructive';
        case 'warning':
            return 'default';
        case 'info':
            return 'secondary';
        default:
            return 'outline';
    }
}

/**
 * Get icon for fault severity
 */
function getSeverityIcon(severity: FaultSeverity) {
    switch (severity) {
        case 'critical':
        case 'error':
            return <AlertOctagon className="w-4 h-4" />;
        case 'warning':
            return <AlertTriangle className="w-4 h-4" />;
        case 'info':
            return <Info className="w-4 h-4" />;
        default:
            return <AlertCircle className="w-4 h-4" />;
    }
}

/**
 * Get badge variant for fault status
 */
function getStatusBadgeVariant(status: FaultStatus): 'default' | 'secondary' | 'outline' {
    switch (status) {
        case 'active':
            return 'default';
        case 'pending':
            return 'secondary';
        case 'cleared':
            return 'outline';
        default:
            return 'outline';
    }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch {
        return timestamp;
    }
}

/**
 * Single fault row component with collapsible environment data
 */
function FaultRow({
    fault,
    onClear,
    isClearing,
    isExpanded,
    onToggle,
    environmentData,
    isLoadingDetails,
}: {
    fault: Fault;
    onClear: (code: string) => void;
    isClearing: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    environmentData?: FaultResponse['environment_data'];
    isLoadingDetails: boolean;
}) {
    const canClear = fault.status === 'active' || fault.status === 'pending';

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <div className="rounded-lg border bg-card">
                <CollapsibleTrigger asChild>
                    <div
                        className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${fault.status === 'healed' ? 'opacity-60' : ''}`}
                    >
                        {/* Expand/Collapse Icon */}
                        <div className="shrink-0 mt-0.5">
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>

                        {/* Severity Icon */}
                        <div
                            className={`shrink-0 mt-0.5 ${
                                fault.severity === 'critical' || fault.severity === 'error'
                                    ? 'text-destructive'
                                    : fault.severity === 'warning'
                                      ? 'text-yellow-500'
                                      : 'text-muted-foreground'
                            }`}
                        >
                            {getSeverityIcon(fault.severity)}
                        </div>

                        {/* Fault details */}
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium">{fault.code}</span>
                                <Badge variant={getSeverityBadgeVariant(fault.severity)} className="text-xs">
                                    {fault.severity}
                                </Badge>
                                <Badge
                                    variant={getStatusBadgeVariant(fault.status)}
                                    className={`text-xs ${fault.status === 'healed' ? 'text-green-600 border-green-300 dark:text-green-400 dark:border-green-700' : ''}`}
                                >
                                    {fault.status}
                                </Badge>
                            </div>
                            <p className="text-sm text-foreground">{fault.message}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{formatTimestamp(fault.timestamp)}</span>
                                <span className="font-mono">
                                    {fault.entity_type}: {fault.entity_id}
                                </span>
                            </div>
                        </div>

                        {/* Clear button */}
                        {canClear && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClear(fault.code);
                                }}
                                disabled={isClearing}
                                className="shrink-0"
                            >
                                {isClearing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-3 pb-3 pt-0 border-t">
                        {isLoadingDetails ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading environment data...</span>
                            </div>
                        ) : environmentData ? (
                            <div className="pt-3 space-y-4">
                                {/* Extended Data Records */}
                                {environmentData.extended_data_records && (
                                    <div>
                                        <h5 className="text-sm font-medium text-muted-foreground mb-2">
                                            Extended Data Records
                                        </h5>
                                        <dl className="grid grid-cols-2 gap-2 text-sm">
                                            {environmentData.extended_data_records.first_occurrence && (
                                                <>
                                                    <dt className="text-muted-foreground">First Occurrence</dt>
                                                    <dd className="font-mono text-xs">
                                                        {new Date(
                                                            environmentData.extended_data_records.first_occurrence
                                                        ).toLocaleString()}
                                                    </dd>
                                                </>
                                            )}
                                            {environmentData.extended_data_records.last_occurrence && (
                                                <>
                                                    <dt className="text-muted-foreground">Last Occurrence</dt>
                                                    <dd className="font-mono text-xs">
                                                        {new Date(
                                                            environmentData.extended_data_records.last_occurrence
                                                        ).toLocaleString()}
                                                    </dd>
                                                </>
                                            )}
                                        </dl>
                                    </div>
                                )}

                                {/* Snapshots */}
                                {environmentData.snapshots && environmentData.snapshots.length > 0 && (
                                    <div>
                                        <h5 className="text-sm font-medium text-muted-foreground mb-2">
                                            Snapshots ({environmentData.snapshots.length})
                                        </h5>
                                        <div className="space-y-2">
                                            {environmentData.snapshots.map((snapshot, idx) => (
                                                <SnapshotCard
                                                    key={`${snapshot.name}-${idx}`}
                                                    snapshot={snapshot}
                                                    index={idx}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* No environment data message */}
                                {!environmentData.extended_data_records &&
                                    (!environmentData.snapshots || environmentData.snapshots.length === 0) && (
                                        <p className="text-sm text-muted-foreground italic py-2">
                                            No environment data available
                                        </p>
                                    )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground italic py-3">No environment data available</p>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

/**
 * Panel displaying faults for a component or app
 */
export function FaultsPanel({ entityId, entityType = 'components' }: FaultsPanelProps) {
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [clearingCodes, setClearingCodes] = useState<Set<string>>(new Set());
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

    const loadFaults = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await listEntityFaults(entityType, entityId);
            setFaults(response.items || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load faults');
            setFaults([]);
        } finally {
            setIsLoading(false);
        }
    }, [listEntityFaults, entityId, entityType]);

    useEffect(() => {
        loadFaults();
    }, [loadFaults]);

    const handleToggleFault = useCallback(
        async (faultCode: string) => {
            const newExpanded = new Set(expandedFaults);

            if (newExpanded.has(faultCode)) {
                newExpanded.delete(faultCode);
            } else {
                newExpanded.add(faultCode);

                // Fetch details if not cached
                if (!faultDetails.has(faultCode)) {
                    setLoadingDetails((prev) => new Set([...prev, faultCode]));
                    try {
                        // Use the fault's own entity info (app-level) for correct bulk_data_uri.
                        // Components have a synthetic FQN that doesn't match fault reporting sources,
                        // so fetching via /components/{id}/faults/{code} produces an unusable bulk_data_uri.
                        const fault = faults.find((f) => f.code === faultCode);
                        const detailEntityType: SovdResourceEntityType = fault?.entity_type
                            ? mapFaultEntityTypeToResourceType(fault.entity_type)
                            : entityType;
                        const detailEntityId = fault?.entity_id || entityId;
                        const details = await getFaultWithEnvironmentData(detailEntityType, detailEntityId, faultCode);
                        setFaultDetails((prev) => new Map(prev).set(faultCode, details as FaultResponse));
                    } catch (err) {
                        console.error('Failed to fetch fault details:', err);
                    } finally {
                        setLoadingDetails((prev) => {
                            const next = new Set(prev);
                            next.delete(faultCode);
                            return next;
                        });
                    }
                }
            }

            setExpandedFaults(newExpanded);
        },
        [getFaultWithEnvironmentData, entityType, entityId, expandedFaults, faultDetails, faults]
    );

    const handleClear = useCallback(
        async (code: string) => {
            setClearingCodes((prev) => new Set([...prev, code]));

            try {
                await clearFault(entityType, entityId, code);
                // Reload faults after clearing
                await loadFaults();
            } catch {
                // Error is handled by toast in the store
            } finally {
                setClearingCodes((prev) => {
                    const next = new Set(prev);
                    next.delete(code);
                    return next;
                });
            }
        },
        [clearFault, entityId, entityType, loadFaults]
    );

    // Count faults by severity
    const errorCount = faults.filter((f) => f.severity === 'error' || f.severity === 'critical').length;
    const warningCount = faults.filter((f) => f.severity === 'warning').length;

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Faults</CardTitle>
                        {faults.length > 0 && (
                            <div className="flex items-center gap-1">
                                {errorCount > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                        {errorCount} error{errorCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                                {warningCount > 0 && (
                                    <Badge variant="default" className="text-xs">
                                        {warningCount} warning{warningCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={loadFaults}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {error ? (
                    <div className="text-center text-destructive py-4">{error}</div>
                ) : faults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                        <CheckCircle className="w-12 h-12 mb-2 text-green-500" />
                        <p>No faults detected</p>
                        <p className="text-xs">Component is operating normally</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {faults.map((fault) => (
                            <FaultRow
                                key={fault.code}
                                fault={fault}
                                onClear={handleClear}
                                isClearing={clearingCodes.has(fault.code)}
                                isExpanded={expandedFaults.has(fault.code)}
                                onToggle={() => handleToggleFault(fault.code)}
                                environmentData={faultDetails.get(fault.code)?.environment_data}
                                isLoadingDetails={loadingDetails.has(fault.code)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
