import { useEffect, useState, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { Loader2, RefreshCw, Lock, Save, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceReadError } from '@/components/ResourceReadError';
import { RowGrid } from '@/components/RowGrid';
import { useAppStore, type AppState } from '@/lib/store';
import type { Parameter, ParameterType } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { SovdResourceEntityType } from '@/lib/types';

interface ConfigurationPanelProps {
    entityId: string;
    /** Optional parameter name to highlight */
    highlightParam?: string;
    /** Entity type for API calls */
    entityType?: SovdResourceEntityType;
}

/**
 * Parameter row component with inline editing
 */
function ParameterRow({
    param,
    onSetParameter,
    onResetParameter,
    isHighlighted,
}: {
    param: Parameter;
    onSetParameter: (name: string, value: unknown) => Promise<boolean>;
    onResetParameter: (name: string) => Promise<boolean>;
    isHighlighted?: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const startEditing = useCallback(() => {
        if (param.read_only) return;
        setEditValue(formatValue(param.value, param.type));
        setIsEditing(true);
    }, [param]);

    const cancelEditing = useCallback(() => {
        setIsEditing(false);
        setEditValue('');
    }, []);

    const saveValue = useCallback(async () => {
        setIsSaving(true);
        try {
            const parsedValue = parseValue(editValue, param.type);
            const success = await onSetParameter(param.name, parsedValue);
            if (success) {
                setIsEditing(false);
            }
        } finally {
            setIsSaving(false);
        }
    }, [editValue, param, onSetParameter]);

    const resetValue = useCallback(async () => {
        if (param.read_only) return;
        setIsResetting(true);
        try {
            await onResetParameter(param.name);
        } finally {
            setIsResetting(false);
        }
    }, [param, onResetParameter]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                saveValue();
            } else if (e.key === 'Escape') {
                cancelEditing();
            }
        },
        [saveValue, cancelEditing]
    );

    // Toggle for boolean parameters
    const toggleBool = useCallback(async () => {
        if (param.read_only || param.type !== 'bool') return;
        setIsSaving(true);
        try {
            await onSetParameter(param.name, !param.value);
        } finally {
            setIsSaving(false);
        }
    }, [param, onSetParameter]);

    return (
        <div
            className={cn(
                // Where the pane is narrow, the type, value and reset wrap under the name
                'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors',
                // The parameter a link led to: a breath of acid behind it
                isHighlighted ? 'bg-[#f4ffd6]' : 'bg-white hover:bg-canvas'
            )}
        >
            {/* Parameter name */}
            <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] text-foreground truncate">{param.name}</span>
                    {param.read_only && (
                        <span title="Read-only">
                            <Lock className="w-3 h-3 text-faint" />
                        </span>
                    )}
                </div>
                {param.description && <p className="text-xs text-faint truncate mt-0.5">{param.description}</p>}
            </div>

            {/* Type */}
            <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-full bg-canvas px-2 font-mono text-[11px] text-muted-foreground">
                {param.type}
            </span>

            {/* Value display/edit */}
            <div className="w-40 shrink-0">
                {param.type === 'bool' ? (
                    // Boolean toggle button
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-start gap-2 px-2.5 font-mono text-[13px]"
                        disabled={param.read_only || isSaving}
                        onClick={toggleBool}
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <span
                                    aria-hidden
                                    className={cn(
                                        'size-2 shrink-0 rounded-full',
                                        param.value
                                            ? 'bg-state-ok'
                                            : 'bg-white shadow-[inset_0_0_0_1.5px_var(--color-state-off)]'
                                    )}
                                />
                                {param.value ? 'true' : 'false'}
                            </>
                        )}
                    </Button>
                ) : isEditing ? (
                    // Editing mode
                    <div className="flex items-center gap-1">
                        <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="h-8 border-graphite/12 bg-white font-mono text-[13px]"
                            autoFocus
                            disabled={isSaving}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={saveValue}
                            disabled={isSaving}
                            className="h-8 w-8 p-0"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={isSaving}
                            className="h-8 w-8 p-0"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ) : (
                    // Display mode - click to edit
                    <div
                        className={cn(
                            'h-8 truncate rounded-lg border px-2.5 py-1.5 font-mono text-[13px] leading-[18px]',
                            param.read_only
                                ? 'cursor-not-allowed border-transparent bg-canvas text-muted-foreground'
                                : 'cursor-pointer border-graphite/12 bg-white text-foreground hover:border-graphite/30 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'
                        )}
                        onClick={startEditing}
                        onKeyDown={(e) => {
                            if (!param.read_only && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                startEditing();
                            }
                        }}
                        role={param.read_only ? undefined : 'button'}
                        tabIndex={param.read_only ? undefined : 0}
                        aria-label={
                            param.read_only
                                ? `${param.name}: ${formatValue(param.value, param.type)} (read-only)`
                                : `Edit ${param.name}`
                        }
                        title={param.read_only ? 'Read-only parameter' : 'Click to edit'}
                    >
                        {formatValue(param.value, param.type)}
                    </div>
                )}
            </div>

            {/* Reset to default button */}
            {!param.read_only && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetValue}
                    disabled={isResetting}
                    className="h-8 w-8 p-0 shrink-0"
                    title="Reset to default"
                >
                    {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                </Button>
            )}
        </div>
    );
}

/**
 * Format parameter value for display
 */
function formatValue(value: unknown, type: ParameterType): string {
    if (value === null || value === undefined) return '';

    if (type.endsWith('_array') || Array.isArray(value)) {
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Parse string input to appropriate type
 */
function parseValue(input: string, type: ParameterType): unknown {
    switch (type) {
        case 'bool':
            return input.toLowerCase() === 'true';
        case 'int':
            return parseInt(input, 10);
        case 'double':
            return parseFloat(input);
        case 'string':
            return input;
        case 'byte_array':
        case 'bool_array':
        case 'int_array':
        case 'double_array':
        case 'string_array':
            try {
                return JSON.parse(input);
            } catch {
                // Return empty array instead of invalid string to prevent type mismatch
                return [];
            }
        default:
            return input;
    }
}

export function ConfigurationPanel({ entityId, highlightParam, entityType = 'components' }: ConfigurationPanelProps) {
    const {
        configurations,
        isLoadingConfigurations,
        readError,
        fetchConfigurations,
        setParameter,
        resetParameter,
        resetAllConfigurations,
    } = useAppStore(
        useShallow((state: AppState) => ({
            configurations: state.configurations,
            isLoadingConfigurations: state.isLoadingConfigurations,
            readError: state.configurationsErrors.get(entityId),
            fetchConfigurations: state.fetchConfigurations,
            setParameter: state.setParameter,
            resetParameter: state.resetParameter,
            resetAllConfigurations: state.resetAllConfigurations,
        }))
    );

    const [isResettingAll, setIsResettingAll] = useState(false);
    const parameters = configurations.get(entityId) || [];
    const prevEntityIdRef = useRef<string | null>(null);

    // Fetch configurations on mount and when entityId changes
    useEffect(() => {
        // Always fetch if entityId changed, or if not yet loaded
        if (prevEntityIdRef.current !== entityId || !configurations.has(entityId)) {
            fetchConfigurations(entityId, entityType);
        }
        prevEntityIdRef.current = entityId;
    }, [entityId, entityType, fetchConfigurations, configurations]);

    const handleRefresh = useCallback(() => {
        fetchConfigurations(entityId, entityType);
    }, [entityId, fetchConfigurations, entityType]);

    const handleSetParameter = useCallback(
        async (name: string, value: unknown) => {
            return setParameter(entityId, name, value, entityType);
        },
        [entityId, setParameter, entityType]
    );

    const handleResetParameter = useCallback(
        async (name: string) => {
            return resetParameter(entityId, name, entityType);
        },
        [entityId, resetParameter, entityType]
    );

    const handleResetAll = useCallback(async () => {
        setIsResettingAll(true);
        try {
            await resetAllConfigurations(entityId, entityType);
        } finally {
            setIsResettingAll(false);
        }
    }, [entityId, resetAllConfigurations, entityType]);

    if (isLoadingConfigurations && parameters.length === 0) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // No heading: the Config tab (or, on a parameter's own page, the toolbar) says what these are;
    // here how many, and the actions on all of them
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-1.5">
                <span className="text-xs text-faint">{parameters.length} parameters</span>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 px-3"
                    onClick={handleResetAll}
                    disabled={isResettingAll || parameters.length === 0}
                    title="Reset all parameters to defaults"
                >
                    {isResettingAll ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                    )}
                    Reset All
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={handleRefresh}
                    disabled={isLoadingConfigurations}
                    title="Refresh parameters"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoadingConfigurations ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            {parameters.length === 0 && readError ? (
                <ResourceReadError what="parameters" reason={readError} onRetry={handleRefresh} />
            ) : parameters.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    No parameters available for this component.
                </p>
            ) : (
                <RowGrid columns={1}>
                    {parameters.map((param) => (
                        <ParameterRow
                            key={param.name}
                            param={param}
                            onSetParameter={handleSetParameter}
                            onResetParameter={handleResetParameter}
                            isHighlighted={param.name === highlightParam}
                        />
                    ))}
                </RowGrid>
            )}
        </section>
    );
}
