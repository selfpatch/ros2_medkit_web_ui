import { CheckCircle, XCircle, Clock, Loader2, Hash, FileJson } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CreateExecutionResponse, ExecutionStatus } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import type { AppState } from '@/lib/store';
import { useShallow } from 'zustand/shallow';

interface OperationResponseProps {
    response: CreateExecutionResponse;
    /** Optional executionId to get live status from store */
    executionId?: string;
}

function getStatusConfig(status: ExecutionStatus): {
    icon: typeof CheckCircle;
    color: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
    switch (status) {
        case 'succeeded':
        case 'completed':
            return { icon: CheckCircle, color: 'text-state-ok', variant: 'default' };
        case 'running':
        case 'pending':
            return { icon: Loader2, color: 'text-state-healed-text', variant: 'secondary' };
        case 'failed':
            return { icon: XCircle, color: 'text-destructive', variant: 'destructive' };
        case 'canceled':
            return { icon: Clock, color: 'text-state-warn', variant: 'outline' };
        default:
            return { icon: Clock, color: 'text-muted-foreground', variant: 'secondary' };
    }
}

/**
 * Check if response is a service call (no execution ID, has direct result/parameters)
 */
function isServiceResponse(response: CreateExecutionResponse): boolean {
    return !response.id;
}

/**
 * Extract result from response - handles both action and service response formats
 */
function extractResult(response: CreateExecutionResponse): unknown {
    // Service responses: result is directly in the response (often as `parameters`)
    if (isServiceResponse(response)) {
        // Prefer explicit parameters field when present
        if (response.parameters !== undefined) {
            return response.parameters;
        }
        // Fallback: remove internal envelope fields before returning the result
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { status: _s, kind: _k, error: _e, ...publicResult } = response;
        return Object.keys(publicResult).length > 0 ? publicResult : undefined;
    }
    // Action responses: result is in the result field
    return response.result;
}

/**
 * Get border and background classes based on execution status
 */
function getStatusBorderClass(status: ExecutionStatus): string {
    if (status === 'succeeded' || status === 'completed') {
        return 'border-state-ok/30 bg-state-fixed-bg/40';
    }
    if (status === 'failed') {
        return 'border-destructive/30 bg-destructive/5';
    }
    return 'border-muted bg-muted/5';
}

export function OperationResponseDisplay({ response, executionId }: OperationResponseProps) {
    // Get live status from store if executionId is provided
    const activeExecution = useAppStore(
        useShallow((state: AppState) => (executionId ? state.activeExecutions.get(executionId) : undefined))
    );

    const isService = isServiceResponse(response);

    // Use live status if available (for actions), otherwise infer from response
    // Services complete immediately, so status is always 'completed'
    const currentStatus: ExecutionStatus = activeExecution?.status ?? (isService ? 'completed' : response.status);
    const currentResult = activeExecution?.result ?? extractResult(response);

    const statusConfig = getStatusConfig(currentStatus);
    const StatusIcon = statusConfig.icon;

    return (
        <div className={`rounded-lg border ${getStatusBorderClass(currentStatus)}`}>
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                <StatusIcon
                    className={`w-4 h-4 ${statusConfig.color} ${currentStatus === 'running' || currentStatus === 'pending' ? 'animate-spin' : ''}`}
                />
                <div className="flex items-center gap-2 flex-1">
                    <Badge variant={statusConfig.variant}>{currentStatus}</Badge>
                    {isService && <span className="text-xs text-muted-foreground">(service)</span>}
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2 text-sm">
                {/* Execution ID - only for actions */}
                {response.id && (
                    <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-xs">Execution ID:</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{response.id}</code>
                    </div>
                )}

                {/* Result (for services or completed actions) */}
                {currentResult !== undefined && currentResult !== null && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <FileJson className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground text-xs">Result:</span>
                        </div>
                        <pre className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                            {typeof currentResult === 'string' ? currentResult : JSON.stringify(currentResult, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
