import { useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    Play,
    Loader2,
    RefreshCw,
    Zap,
    Clock,
    ChevronDown,
    ChevronUp,
    FileJson,
    FormInput,
    AlertCircle,
    History,
    Trash2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppStore, type AppState } from '@/lib/store';
import type {
    Operation,
    OperationKind,
    CreateExecutionResponse,
    TopicSchema,
    ServiceSchema,
    ActionSchema,
} from '@/lib/types';
import { ActionStatusPanel } from './ActionStatusPanel';
import { SchemaForm } from './SchemaFormField';
import { getSchemaDefaults } from '@/lib/schema-utils';
import { OperationResponseDisplay } from './OperationResponse';
import type { SovdResourceEntityType } from '@/lib/types';

/** History entry for an operation invocation */
interface OperationHistoryEntry {
    id: string;
    timestamp: Date;
    response: CreateExecutionResponse;
    executionId?: string;
}

interface OperationsPanelProps {
    entityId: string;
    /** Optional: highlight and auto-expand a specific operation */
    highlightOperation?: string;
    /** Entity type for API calls */
    entityType?: SovdResourceEntityType;
}

/**
 * Get badge color for operation kind
 */
function getKindBadgeVariant(kind: OperationKind): 'default' | 'secondary' {
    return kind === 'service' ? 'default' : 'secondary';
}

/**
 * Get icon for operation kind
 */
function getKindIcon(kind: OperationKind) {
    return kind === 'service' ? Zap : Clock;
}

/**
 * Check if schema is a ServiceSchema (has request/response)
 */
function isServiceSchema(schema: ServiceSchema | ActionSchema): schema is ServiceSchema {
    return 'request' in schema && 'response' in schema;
}

/**
 * Check if schema is an ActionSchema (has goal/result/feedback)
 */
function isActionSchema(schema: ServiceSchema | ActionSchema): schema is ActionSchema {
    return 'goal' in schema;
}

/**
 * Get the request/goal schema based on operation kind
 */
function getInputSchema(operation: Operation): TopicSchema | null {
    if (!operation.type_info?.schema) return null;

    const schema = operation.type_info.schema;
    if (operation.kind === 'service' && isServiceSchema(schema)) {
        return schema.request;
    }
    if (operation.kind === 'action' && isActionSchema(schema)) {
        return schema.goal;
    }
    return null;
}

/**
 * Check if a schema is empty (no fields)
 */
function isEmptySchema(schema: TopicSchema | null): boolean {
    if (!schema) return true;
    return Object.keys(schema).length === 0;
}

/**
 * Single operation row with invoke capability
 */
function OperationRow({
    operation,
    onInvoke,
    defaultExpanded = false,
}: {
    operation: Operation;
    entityId: string;
    onInvoke: (opName: string, payload: unknown) => Promise<CreateExecutionResponse | null>;
    defaultExpanded?: boolean;
    entityType?: SovdResourceEntityType;
}) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [useFormView, setUseFormView] = useState(true);
    const [requestBody, setRequestBody] = useState('{}');
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [isInvoking, setIsInvoking] = useState(false);
    const [history, setHistory] = useState<OperationHistoryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const KindIcon = getKindIcon(operation.kind);
    const inputSchema = getInputSchema(operation);
    const hasInputFields = !isEmptySchema(inputSchema);
    const hasSchema = !!inputSchema;

    // Get latest entry for action status monitoring
    const latestEntry = history[0];
    const latestExecutionId = latestEntry?.executionId;

    // Initialize form data with schema defaults
    useEffect(() => {
        if (inputSchema && Object.keys(inputSchema).length > 0) {
            const defaults = getSchemaDefaults(inputSchema);
            setFormData(defaults);
            setRequestBody(JSON.stringify(defaults, null, 2));
        }
    }, [inputSchema]);

    // Sync form data to JSON when form changes
    const handleFormChange = useCallback((newData: Record<string, unknown>) => {
        setFormData(newData);
        setRequestBody(JSON.stringify(newData, null, 2));
    }, []);

    // Sync JSON to form data when JSON changes
    const handleJsonChange = useCallback((json: string) => {
        setRequestBody(json);
        try {
            const parsed = JSON.parse(json);
            if (typeof parsed === 'object' && parsed !== null) {
                setFormData(parsed);
            }
        } catch {
            // Invalid JSON, don't update form
        }
    }, []);

    // Track JSON validation error
    const [jsonError, setJsonError] = useState<string | null>(null);

    const handleInvoke = useCallback(async () => {
        // Validate JSON before invoking
        let payload: unknown;
        try {
            payload = JSON.parse(requestBody);
            setJsonError(null);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Invalid JSON';
            setJsonError(errorMsg);
            return; // Don't invoke with invalid JSON
        }

        setIsInvoking(true);

        try {
            // Build request based on operation kind
            const request =
                operation.kind === 'service'
                    ? { type: operation.type, request: payload }
                    : { type: operation.type, goal: payload };

            const response = await onInvoke(operation.name, request);

            if (response) {
                // Determine if this is an action based on operation kind (not response)
                const isAction = operation.kind === 'action';
                // Add to history (newest first, max 10 entries)
                const entry: OperationHistoryEntry = {
                    id: crypto.randomUUID(),
                    timestamp: new Date(),
                    response,
                    // For actions, always track executionId for status display
                    executionId: isAction && response.id ? response.id : undefined,
                };
                setHistory((prev) => [entry, ...prev.slice(0, 9)]);
            }
        } finally {
            setIsInvoking(false);
        }
    }, [operation, requestBody, onInvoke]);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="rounded-lg border bg-card">
                {/* Operation header - simplified, no button */}
                <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                        <KindIcon className="w-4 h-4 text-muted-foreground shrink-0" />

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{operation.name}</span>
                                <Badge variant={getKindBadgeVariant(operation.kind)} className="shrink-0">
                                    {operation.kind}
                                </Badge>
                                {!hasInputFields && (
                                    <Badge variant="outline" className="shrink-0 text-xs">
                                        no params
                                    </Badge>
                                )}
                                {history.length > 0 && (
                                    <Badge variant="secondary" className="shrink-0 text-xs">
                                        {history.length} call{history.length > 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{operation.type}</p>
                        </div>

                        {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                    </div>
                </CollapsibleTrigger>

                {/* Expanded content */}
                <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                        {/* Input section - Form or JSON */}
                        {hasInputFields ? (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        {operation.kind === 'service' ? 'Request' : 'Goal'}
                                    </label>
                                    {hasSchema && (
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant={useFormView ? 'secondary' : 'ghost'}
                                                size="sm"
                                                className="h-6 px-2"
                                                onClick={() => setUseFormView(true)}
                                            >
                                                <FormInput className="w-3 h-3 mr-1" />
                                                Form
                                            </Button>
                                            <Button
                                                variant={!useFormView ? 'secondary' : 'ghost'}
                                                size="sm"
                                                className="h-6 px-2"
                                                onClick={() => setUseFormView(false)}
                                            >
                                                <FileJson className="w-3 h-3 mr-1" />
                                                JSON
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {useFormView && hasSchema && inputSchema ? (
                                    <div className="bg-muted/30 p-3 rounded-md space-y-3">
                                        <SchemaForm schema={inputSchema} value={formData} onChange={handleFormChange} />
                                        {/* Invoke button inside form */}
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={handleInvoke}
                                            disabled={isInvoking}
                                            className="w-full"
                                        >
                                            {isInvoking ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            ) : (
                                                <Play className="w-4 h-4 mr-2" />
                                            )}
                                            {operation.kind === 'service' ? 'Call Service' : 'Send Goal'}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Textarea
                                            value={requestBody}
                                            onChange={(e) => {
                                                handleJsonChange(e.target.value);
                                                setJsonError(null); // Clear error on change
                                            }}
                                            placeholder="{}"
                                            className={`font-mono text-sm min-h-[80px] ${jsonError ? 'border-destructive' : ''}`}
                                        />
                                        {jsonError && (
                                            <div className="flex items-center gap-2 text-xs text-destructive">
                                                <AlertCircle className="w-3 h-3" />
                                                Invalid JSON: {jsonError}
                                            </div>
                                        )}
                                        {/* Invoke button below textarea */}
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={handleInvoke}
                                            disabled={isInvoking}
                                            className="w-full"
                                        >
                                            {isInvoking ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            ) : (
                                                <Play className="w-4 h-4 mr-2" />
                                            )}
                                            {operation.kind === 'service' ? 'Call Service' : 'Send Goal'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* No params - just show button */
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                                    <AlertCircle className="w-3 h-3" />
                                    This {operation.kind} takes no parameters
                                </div>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleInvoke}
                                    disabled={isInvoking}
                                    className="w-full"
                                >
                                    {isInvoking ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    {operation.kind === 'service' ? 'Call Service' : 'Send Goal'}
                                </Button>
                            </div>
                        )}

                        {/* History section */}
                        {history.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowHistory(!showHistory)}
                                        className="h-6 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                                    >
                                        <History className="w-3.5 h-3.5 mr-1.5" />
                                        History ({history.length})
                                        {showHistory ? (
                                            <ChevronUp className="w-3 h-3 ml-1" />
                                        ) : (
                                            <ChevronDown className="w-3 h-3 ml-1" />
                                        )}
                                    </Button>
                                    {showHistory && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={clearHistory}
                                            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="w-3 h-3 mr-1" />
                                            Clear
                                        </Button>
                                    )}
                                </div>

                                {showHistory && (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                        {history.map((entry, idx) => (
                                            <div key={entry.id} className="relative">
                                                {idx === 0 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="absolute -top-1 -right-1 text-[10px] z-10"
                                                    >
                                                        latest
                                                    </Badge>
                                                )}
                                                <div className="text-[10px] text-muted-foreground mb-1">
                                                    {entry.timestamp.toLocaleTimeString()}
                                                </div>
                                                <OperationResponseDisplay
                                                    response={entry.response}
                                                    executionId={entry.executionId}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Show only latest response when history is collapsed */}
                                {!showHistory && latestEntry && (
                                    <OperationResponseDisplay
                                        response={latestEntry.response}
                                        executionId={latestEntry.executionId}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </CollapsibleContent>

                {/* Action status monitoring - OUTSIDE CollapsibleContent to keep polling active when collapsed */}
                {latestExecutionId && operation.kind === 'action' && (
                    <div className="px-3 pb-3">
                        <ActionStatusPanel executionId={latestExecutionId} />
                    </div>
                )}
            </div>
        </Collapsible>
    );
}

export function OperationsPanel({ entityId, highlightOperation, entityType = 'components' }: OperationsPanelProps) {
    const { operations, isLoadingOperations, fetchOperations, createExecution } = useAppStore(
        useShallow((state: AppState) => ({
            operations: state.operations,
            isLoadingOperations: state.isLoadingOperations,
            fetchOperations: state.fetchOperations,
            createExecution: state.createExecution,
        }))
    );

    const entityOperations = operations.get(entityId) || [];
    const services = entityOperations.filter((op) => op.kind === 'service');
    const actions = entityOperations.filter((op) => op.kind === 'action');

    // Fetch operations on mount or when entityId/entityType changes
    useEffect(() => {
        // Always fetch when entityId or entityType changes to ensure fresh data
        fetchOperations(entityId, entityType);
    }, [entityId, entityType, fetchOperations]);

    const handleRefresh = useCallback(() => {
        fetchOperations(entityId, entityType);
    }, [entityId, fetchOperations, entityType]);

    const handleInvoke = useCallback(
        async (opName: string, payload: unknown) => {
            return createExecution(entityId, opName, payload as Parameters<typeof createExecution>[2], entityType);
        },
        [entityId, createExecution, entityType]
    );

    if (isLoadingOperations && entityOperations.length === 0) {
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
                        <Zap className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Operations</CardTitle>
                        <span className="text-xs text-muted-foreground">
                            ({services.length} services, {actions.length} actions)
                        </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoadingOperations}>
                        <RefreshCw className={`w-4 h-4 ${isLoadingOperations ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {entityOperations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Zap className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">No operations available</p>
                        <p className="text-xs mt-1">This entity has no services or actions</p>
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                        {/* Services section */}
                        {services.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 sticky top-0 bg-card py-1 z-10">
                                    <Zap className="w-4 h-4" />
                                    Services
                                </h4>
                                <div className="space-y-2">
                                    {services.map((op) => (
                                        <OperationRow
                                            key={op.name}
                                            operation={op}
                                            entityId={entityId}
                                            onInvoke={handleInvoke}
                                            defaultExpanded={op.name === highlightOperation}
                                            entityType={entityType}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Actions section */}
                        {actions.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 sticky top-0 bg-card py-1 z-10">
                                    <Clock className="w-4 h-4" />
                                    Actions
                                </h4>
                                <div className="space-y-2">
                                    {actions.map((op) => (
                                        <OperationRow
                                            key={op.name}
                                            operation={op}
                                            entityId={entityId}
                                            onInvoke={handleInvoke}
                                            defaultExpanded={op.name === highlightOperation}
                                            entityType={entityType}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
