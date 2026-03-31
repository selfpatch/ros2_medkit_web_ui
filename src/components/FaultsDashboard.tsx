import { useState, useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    AlertTriangle,
    AlertCircle,
    AlertOctagon,
    Info,
    CheckCircle,
    RefreshCw,
    Filter,
    Trash2,
    Loader2,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { SnapshotCard } from './SnapshotCard';
import { useAppStore } from '@/lib/store';
import type { Fault, FaultSeverity, FaultStatus, FaultResponse } from '@/lib/types';
import { mapFaultEntityTypeToResourceType } from '@/lib/utils';

/**
 * Default polling interval in milliseconds
 */
const DEFAULT_POLL_INTERVAL = 5000;

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
 * Get badge variant for fault status
 */
function getStatusBadgeVariant(status: FaultStatus): 'default' | 'secondary' | 'outline' {
    switch (status) {
        case 'active':
            return 'default';
        case 'pending':
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
            return <AlertOctagon className="w-4 h-4" />;
        case 'error':
            return <AlertCircle className="w-4 h-4" />;
        case 'warning':
            return <AlertTriangle className="w-4 h-4" />;
        case 'info':
            return <Info className="w-4 h-4" />;
        default:
            return <AlertCircle className="w-4 h-4" />;
    }
}

/**
 * Get color class for severity
 */
function getSeverityColorClass(severity: FaultSeverity): string {
    switch (severity) {
        case 'critical':
            return 'text-red-600 dark:text-red-400';
        case 'error':
            return 'text-orange-600 dark:text-orange-400';
        case 'warning':
            return 'text-yellow-600 dark:text-yellow-400';
        case 'info':
            return 'text-blue-600 dark:text-blue-400';
        default:
            return 'text-muted-foreground';
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
                        <div className={`shrink-0 mt-0.5 ${getSeverityColorClass(fault.severity)}`}>
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
                                title="Clear fault"
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
 * Group of faults by entity
 */
function FaultGroup({
    entityId,
    entityType,
    faults,
    onClear,
    clearingCodes,
    expandedFaults,
    onToggleFault,
    faultDetails,
    loadingDetails,
}: {
    entityId: string;
    entityType: string;
    faults: Fault[];
    onClear: (code: string) => void;
    clearingCodes: Set<string>;
    expandedFaults: Set<string>;
    onToggleFault: (fault: Fault) => void;
    faultDetails: Map<string, FaultResponse>;
    loadingDetails: Set<string>;
}) {
    const [isOpen, setIsOpen] = useState(true);

    const criticalCount = faults.filter((f) => f.severity === 'critical' || f.severity === 'error').length;
    const warningCount = faults.filter((f) => f.severity === 'warning').length;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-medium text-sm">{entityId}</span>
                    <Badge variant="outline" className="text-xs">
                        {entityType}
                    </Badge>
                    <div className="flex-1" />
                    {criticalCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                            {criticalCount}
                        </Badge>
                    )}
                    {warningCount > 0 && (
                        <Badge variant="default" className="text-xs">
                            {warningCount}
                        </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                        {faults.length} total
                    </Badge>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6 space-y-2 mt-2">
                {faults.map((fault) => (
                    <FaultRow
                        key={fault.code}
                        fault={fault}
                        onClear={onClear}
                        isClearing={clearingCodes.has(fault.code)}
                        isExpanded={expandedFaults.has(fault.code)}
                        onToggle={() => onToggleFault(fault)}
                        environmentData={faultDetails.get(fault.code)?.environment_data}
                        isLoadingDetails={loadingDetails.has(fault.code)}
                    />
                ))}
            </CollapsibleContent>
        </Collapsible>
    );
}

/**
 * Loading skeleton for dashboard
 */
function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-24" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-4 rounded-lg border space-y-3">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-5 w-16" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Faults Dashboard - displays all faults across the system
 *
 * Features:
 * - Real-time updates via shared store polling
 * - Filtering by severity and status
 * - Grouping by entity
 * - Clear fault actions
 *
 * Uses shared faults state from useAppStore to avoid duplicate API calls
 * when both FaultsDashboard and FaultsCountBadge are visible.
 */
export function FaultsDashboard() {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [clearingCodes, setClearingCodes] = useState<Set<string>>(new Set());
    const [expandedFaults, setExpandedFaults] = useState<Set<string>>(new Set());
    const [faultDetails, setFaultDetails] = useState<Map<string, FaultResponse>>(new Map());
    const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

    // Filters
    const [severityFilters, setSeverityFilters] = useState<Set<FaultSeverity>>(
        new Set(['critical', 'error', 'warning', 'info'])
    );
    const [statusFilters, setStatusFilters] = useState<Set<FaultStatus>>(new Set(['active', 'pending']));
    const [groupByEntity, setGroupByEntity] = useState(true);

    // Use shared faults state from store
    const {
        faults,
        isLoadingFaults,
        isConnected,
        fetchFaults,
        clearFault,
        getFaultWithEnvironmentData,
        hasFaultStream,
    } = useAppStore(
        useShallow((state) => ({
            faults: state.faults,
            isLoadingFaults: state.isLoadingFaults,
            isConnected: state.isConnected,
            fetchFaults: state.fetchFaults,
            clearFault: state.clearFault,
            getFaultWithEnvironmentData: state.getFaultWithEnvironmentData,
            hasFaultStream: state.faultStreamCleanup !== null,
        }))
    );

    // Load faults on mount
    useEffect(() => {
        if (isConnected) {
            fetchFaults();
        }
    }, [isConnected, fetchFaults]);

    // Auto-refresh polling using shared store.
    // Skip polling when SSE fault stream is active (it provides real-time updates).
    useEffect(() => {
        if (!autoRefresh || !isConnected || hasFaultStream) return;

        const interval = setInterval(() => {
            fetchFaults();
        }, DEFAULT_POLL_INTERVAL);

        return () => clearInterval(interval);
    }, [autoRefresh, isConnected, hasFaultStream, fetchFaults]);

    // Manual refresh handler
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await fetchFaults();
        setIsRefreshing(false);
    }, [fetchFaults]);

    // Clear fault handler
    const handleClear = useCallback(
        async (code: string) => {
            setClearingCodes((prev) => new Set([...prev, code]));

            try {
                // Find the fault to get entity info
                const fault = faults.find((f) => f.code === code);
                if (fault) {
                    // Map the fault's entity_type to the correct resource type for the API
                    const entityGroup = mapFaultEntityTypeToResourceType(fault.entity_type);
                    // Use store's clearFault which has proper error handling with toasts
                    await clearFault(entityGroup, fault.entity_id, code);
                }
                // Reload faults after clearing
                await fetchFaults();
            } finally {
                setClearingCodes((prev) => {
                    const next = new Set(prev);
                    next.delete(code);
                    return next;
                });
            }
        },
        [faults, fetchFaults, clearFault]
    );

    // Toggle fault expansion and lazy-load environment data
    const handleToggleFault = useCallback(
        async (fault: Fault) => {
            const faultCode = fault.code;
            const newExpanded = new Set(expandedFaults);

            if (newExpanded.has(faultCode)) {
                newExpanded.delete(faultCode);
            } else {
                newExpanded.add(faultCode);

                // Fetch details if not cached
                if (!faultDetails.has(faultCode)) {
                    setLoadingDetails((prev) => new Set([...prev, faultCode]));
                    try {
                        const entityGroup = mapFaultEntityTypeToResourceType(fault.entity_type);
                        const details = await getFaultWithEnvironmentData(entityGroup, fault.entity_id, faultCode);
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
        [getFaultWithEnvironmentData, expandedFaults, faultDetails]
    );

    // Filter faults
    const filteredFaults = useMemo(() => {
        return faults.filter((f) => severityFilters.has(f.severity) && statusFilters.has(f.status));
    }, [faults, severityFilters, statusFilters]);

    // Group faults by entity
    const groupedFaults = useMemo(() => {
        const groups = new Map<string, { entityType: string; faults: Fault[] }>();

        for (const fault of filteredFaults) {
            const key = fault.entity_id;
            if (!groups.has(key)) {
                groups.set(key, { entityType: fault.entity_type, faults: [] });
            }
            groups.get(key)!.faults.push(fault);
        }

        // Sort groups by number of critical/error faults
        return Array.from(groups.entries()).sort((a, b) => {
            const aCritical = a[1].faults.filter((f) => f.severity === 'critical' || f.severity === 'error').length;
            const bCritical = b[1].faults.filter((f) => f.severity === 'critical' || f.severity === 'error').length;
            return bCritical - aCritical;
        });
    }, [filteredFaults]);

    // Count by severity (active faults only — CONFIRMED + PREFAILED)
    const activeFaults = useMemo(() => faults.filter((f) => f.status === 'active' || f.status === 'pending'), [faults]);
    const counts = useMemo(() => {
        return {
            critical: activeFaults.filter((f) => f.severity === 'critical').length,
            error: activeFaults.filter((f) => f.severity === 'error').length,
            warning: activeFaults.filter((f) => f.severity === 'warning').length,
            info: activeFaults.filter((f) => f.severity === 'info').length,
            total: activeFaults.length,
        };
    }, [activeFaults]);

    // Toggle severity filter
    const toggleSeverity = (severity: FaultSeverity) => {
        setSeverityFilters((prev) => {
            const next = new Set(prev);
            if (next.has(severity)) {
                next.delete(severity);
            } else {
                next.add(severity);
            }
            return next;
        });
    };

    // Toggle status filter
    const toggleStatus = (status: FaultStatus) => {
        setStatusFilters((prev) => {
            const next = new Set(prev);
            if (next.has(status)) {
                next.delete(status);
            } else {
                next.add(status);
            }
            return next;
        });
    };

    if (!isConnected) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Connect to a server to view faults.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (isLoadingFaults && faults.length === 0) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Faults Dashboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DashboardSkeleton />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                                Faults Dashboard
                            </CardTitle>
                            <CardDescription>
                                {counts.total === 0
                                    ? 'No faults detected'
                                    : `${counts.total} fault${counts.total !== 1 ? 's' : ''} detected`}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Auto-refresh toggle */}
                            <div className="flex items-center gap-2 text-sm">
                                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} id="auto-refresh" />
                                <label htmlFor="auto-refresh" className="text-muted-foreground cursor-pointer">
                                    Auto-refresh
                                </label>
                            </div>
                            {/* Manual refresh */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                disabled={isRefreshing || isLoadingFaults}
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${isRefreshing || isLoadingFaults ? 'animate-spin' : ''}`}
                                />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Summary badges */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {counts.critical > 0 && (
                            <Badge variant="destructive">
                                <AlertOctagon className="w-3 h-3 mr-1" />
                                {counts.critical} Critical
                            </Badge>
                        )}
                        {counts.error > 0 && (
                            <Badge variant="destructive">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {counts.error} Error
                            </Badge>
                        )}
                        {counts.warning > 0 && (
                            <Badge variant="default">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {counts.warning} Warning
                            </Badge>
                        )}
                        {counts.info > 0 && (
                            <Badge variant="secondary">
                                <Info className="w-3 h-3 mr-1" />
                                {counts.info} Info
                            </Badge>
                        )}
                        {counts.total === 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                All Clear
                            </Badge>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2">
                        {/* Severity filter */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Filter className="w-4 h-4 mr-2" />
                                    Severity
                                    <ChevronDown className="w-4 h-4 ml-2" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuLabel>Filter by Severity</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={severityFilters.has('critical')}
                                    onCheckedChange={() => toggleSeverity('critical')}
                                >
                                    <AlertOctagon className="w-4 h-4 mr-2 text-red-500" />
                                    Critical
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={severityFilters.has('error')}
                                    onCheckedChange={() => toggleSeverity('error')}
                                >
                                    <AlertCircle className="w-4 h-4 mr-2 text-orange-500" />
                                    Error
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={severityFilters.has('warning')}
                                    onCheckedChange={() => toggleSeverity('warning')}
                                >
                                    <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                                    Warning
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={severityFilters.has('info')}
                                    onCheckedChange={() => toggleSeverity('info')}
                                >
                                    <Info className="w-4 h-4 mr-2 text-blue-500" />
                                    Info
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Status filter */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Filter className="w-4 h-4 mr-2" />
                                    Status
                                    <ChevronDown className="w-4 h-4 ml-2" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={statusFilters.has('active')}
                                    onCheckedChange={() => toggleStatus('active')}
                                >
                                    Active
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={statusFilters.has('pending')}
                                    onCheckedChange={() => toggleStatus('pending')}
                                >
                                    Pending
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={statusFilters.has('cleared')}
                                    onCheckedChange={() => toggleStatus('cleared')}
                                >
                                    Cleared
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={statusFilters.has('healed')}
                                    onCheckedChange={() => toggleStatus('healed')}
                                >
                                    Healed
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Group by toggle */}
                        <div className="flex items-center gap-2 ml-auto">
                            <Switch checked={groupByEntity} onCheckedChange={setGroupByEntity} id="group-by" />
                            <label htmlFor="group-by" className="text-sm text-muted-foreground cursor-pointer">
                                Group by entity
                            </label>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Faults List */}
            {filteredFaults.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
                            <CheckCircle className="w-12 h-12 mb-2 text-green-500" />
                            <p className="font-medium">No faults to display</p>
                            <p className="text-sm">
                                {faults.length > 0
                                    ? 'Adjust filters to see more faults'
                                    : 'System is operating normally'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : groupByEntity ? (
                <Card>
                    <CardContent className="pt-4 space-y-4">
                        {groupedFaults.map(([entityId, { entityType, faults: entityFaults }]) => (
                            <FaultGroup
                                key={entityId}
                                entityId={entityId}
                                entityType={entityType}
                                faults={entityFaults}
                                onClear={handleClear}
                                clearingCodes={clearingCodes}
                                expandedFaults={expandedFaults}
                                onToggleFault={handleToggleFault}
                                faultDetails={faultDetails}
                                loadingDetails={loadingDetails}
                            />
                        ))}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-4 space-y-2">
                        {filteredFaults.map((fault) => (
                            <FaultRow
                                key={fault.code}
                                fault={fault}
                                onClear={handleClear}
                                isClearing={clearingCodes.has(fault.code)}
                                isExpanded={expandedFaults.has(fault.code)}
                                onToggle={() => handleToggleFault(fault)}
                                environmentData={faultDetails.get(fault.code)?.environment_data}
                                isLoadingDetails={loadingDetails.has(fault.code)}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * Faults count badge for sidebar
 *
 * Uses shared faults state from useAppStore to avoid duplicate polling.
 * The main polling happens in FaultsDashboard or when faults are fetched elsewhere.
 */
export function FaultsCountBadge() {
    const { faults, isConnected, fetchFaults, hasFaultStream } = useAppStore(
        useShallow((state) => ({
            faults: state.faults,
            isConnected: state.isConnected,
            fetchFaults: state.fetchFaults,
            hasFaultStream: state.faultStreamCleanup !== null,
        }))
    );

    // Trigger initial fetch and set up fallback polling when connected.
    // Skip polling when SSE fault stream is active (provides real-time updates).
    useEffect(() => {
        if (!isConnected) return;

        // Initial fetch
        fetchFaults();

        // Only poll as fallback when SSE stream is not active
        let interval: ReturnType<typeof setInterval> | null = null;
        if (!hasFaultStream) {
            interval = setInterval(() => {
                if (!document.hidden) {
                    fetchFaults();
                }
            }, DEFAULT_POLL_INTERVAL);
        }

        // Refresh when tab becomes visible
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchFaults();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isConnected, hasFaultStream, fetchFaults]);

    // Count active critical/error faults
    const count = useMemo(() => {
        return faults.filter((f) => f.status === 'active' && (f.severity === 'critical' || f.severity === 'error'))
            .length;
    }, [faults]);

    if (count === 0) return null;

    return (
        <Badge variant="destructive" className="text-xs ml-auto">
            {count}
        </Badge>
    );
}
