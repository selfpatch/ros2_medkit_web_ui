import { useEffect, useCallback, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Activity, RefreshCw, XCircle, CheckCircle, AlertCircle, Clock, Navigation } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type AppState, type TrackedExecution } from '@/lib/store';
import type { ExecutionStatus } from '@/lib/types';

/** Delay before hiding terminal state panel (ms) */
const TERMINAL_STATE_DISPLAY_DELAY_MS = 3000;

interface ActionStatusPanelProps {
    /** Execution ID to display and monitor */
    executionId: string;
}

/**
 * Get status badge variant and icon for Execution status
 */
function getStatusStyle(status: ExecutionStatus): {
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: typeof CheckCircle;
    color: string;
    bgColor: string;
} {
    switch (status) {
        case 'pending':
            return { variant: 'outline', icon: Clock, color: 'text-state-warn-text', bgColor: 'bg-state-warn-bg' };
        case 'running':
            return {
                variant: 'default',
                icon: Activity,
                color: 'text-state-healed-text',
                bgColor: 'bg-acid/25',
            };
        case 'succeeded':
        case 'completed':
            return {
                variant: 'default',
                icon: CheckCircle,
                color: 'text-state-fixed-text',
                bgColor: 'bg-state-fixed-bg',
            };
        case 'canceled':
            return {
                variant: 'secondary',
                icon: XCircle,
                color: 'text-muted-foreground',
                bgColor: 'bg-canvas-2',
            };
        case 'failed':
            return {
                variant: 'destructive',
                icon: AlertCircle,
                color: 'text-state-fault-text',
                bgColor: 'bg-state-fault-bg',
            };
        default:
            return {
                variant: 'outline',
                icon: Clock,
                color: 'text-muted-foreground',
                bgColor: 'bg-muted',
            };
    }
}

/**
 * Check if status is terminal (no more updates expected)
 */
function isTerminalStatus(status: ExecutionStatus): boolean {
    return ['succeeded', 'canceled', 'failed', 'completed'].includes(status);
}

/**
 * Check if status is active (action is in progress)
 */
function isActiveStatus(status: ExecutionStatus): boolean {
    return ['pending', 'running'].includes(status);
}

export function ActionStatusPanel({ executionId }: ActionStatusPanelProps) {
    const { activeExecutions, autoRefreshExecutions, cancelExecution, startExecutionPolling, refreshExecutionStatus } =
        useAppStore(
            useShallow((state: AppState) => ({
                activeExecutions: state.activeExecutions,
                autoRefreshExecutions: state.autoRefreshExecutions,
                cancelExecution: state.cancelExecution,
                startExecutionPolling: state.startExecutionPolling,
                refreshExecutionStatus: state.refreshExecutionStatus,
            }))
        );

    const execution = activeExecutions.get(executionId) as TrackedExecution | undefined;
    const statusStyle = execution ? getStatusStyle(execution.status) : null;
    const StatusIcon = statusStyle?.icon || Clock;
    const isTerminal = execution ? isTerminalStatus(execution.status) : false;
    const isActive = execution ? isActiveStatus(execution.status) : false;
    const canCancel = execution && ['pending', 'running'].includes(execution.status);

    // Track whether to hide terminal state panel (with delay)
    const [shouldHide, setShouldHide] = useState(false);

    // Manual refresh
    const handleRefresh = useCallback(() => {
        if (execution) {
            refreshExecutionStatus(execution.entityId, execution.operationName, executionId, execution.entityType);
        }
    }, [execution, executionId, refreshExecutionStatus]);

    // Cancel action
    const handleCancel = useCallback(async () => {
        if (execution) {
            await cancelExecution(execution.entityId, execution.operationName, executionId, execution.entityType);
        }
    }, [execution, executionId, cancelExecution]);

    // Start polling on mount if auto-refresh is enabled and execution is active
    // Polling is managed by the store, so this just ensures it's started
    useEffect(() => {
        if (autoRefreshExecutions && isActive) {
            startExecutionPolling();
        }
    }, [autoRefreshExecutions, isActive, startExecutionPolling]);

    // Delay hiding terminal state so users can see the final status
    useEffect(() => {
        if (isTerminal && !shouldHide) {
            const timer = setTimeout(() => {
                setShouldHide(true);
            }, TERMINAL_STATE_DISPLAY_DELAY_MS);
            return () => clearTimeout(timer);
        }
        // Reset shouldHide if execution becomes active again (e.g., new execution)
        if (!isTerminal && shouldHide) {
            setShouldHide(false);
        }
        return undefined;
    }, [isTerminal, shouldHide]);

    // Don't render if no execution or if terminal state delay has passed
    if (!execution || (isTerminal && shouldHide)) {
        return null;
    }

    return (
        <Card className={`${statusStyle?.bgColor} border-${statusStyle?.color?.replace('text-', '')}/30`}>
            <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isActive ? (
                            <div className="relative">
                                <StatusIcon
                                    className={`w-4 h-4 ${statusStyle?.color} ${execution.status === 'running' ? 'animate-pulse' : ''}`}
                                />
                                {execution.status === 'running' && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-acid-strong rounded-full animate-ping" />
                                )}
                            </div>
                        ) : (
                            <StatusIcon className={`w-4 h-4 ${statusStyle?.color}`} />
                        )}
                        <CardTitle className="text-sm">Execution Status</CardTitle>
                        <Badge variant={statusStyle?.variant} className={isActive ? 'animate-pulse' : ''}>
                            {execution.status}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Manual refresh */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isTerminal}
                            className="h-7 w-7 p-0"
                        >
                            <RefreshCw
                                className={`w-3.5 h-3.5 ${isActive && autoRefreshExecutions ? 'animate-spin' : ''}`}
                            />
                        </Button>

                        {/* Cancel button */}
                        {canCancel && (
                            <Button variant="destructive" size="sm" onClick={handleCancel} className="h-7">
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="py-2 px-4 space-y-3">
                {/* Progress bar for active actions */}
                {isActive && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Navigation className="w-3.5 h-3.5 text-state-healed-text animate-bounce" />
                            <span className="text-xs text-muted-foreground">
                                {execution.status === 'pending' && 'Waiting to start...'}
                                {execution.status === 'running' && 'Execution in progress...'}
                            </span>
                        </div>
                        {/* Animated progress bar */}
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-acid-strong rounded-full animate-progress-indeterminate" />
                        </div>
                    </div>
                )}

                {/* Execution ID */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Execution ID:</span>
                    <code className="bg-background/50 px-1.5 py-0.5 rounded font-mono text-xs">
                        {executionId.slice(0, 8)}...{executionId.slice(-8)}
                    </code>
                </div>

                {/* Result or feedback */}
                {execution.result !== undefined && execution.result !== null && (
                    <div>
                        <span className="text-xs text-muted-foreground block mb-1">
                            {isTerminal ? 'Result:' : 'Last Feedback:'}
                        </span>
                        <pre className="bg-background/50 p-2 rounded text-xs font-mono overflow-auto max-h-[150px]">
                            {JSON.stringify(execution.result, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Error message for failed executions */}
                {execution.error && (
                    <div>
                        <span className="text-xs text-destructive block mb-1">Error:</span>
                        <pre className="bg-destructive/10 p-2 rounded text-xs font-mono text-destructive overflow-auto max-h-[100px]">
                            {execution.error}
                        </pre>
                    </div>
                )}

                {/* Terminal state message */}
                {isTerminal && (
                    <div className={`text-xs ${statusStyle?.color} flex items-center gap-1.5 font-medium`}>
                        <StatusIcon className="w-4 h-4" />
                        <span>
                            {(execution.status === 'succeeded' || execution.status === 'completed') &&
                                'Execution completed successfully'}
                            {execution.status === 'canceled' && 'Execution was canceled'}
                            {execution.status === 'failed' && 'Execution failed'}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
