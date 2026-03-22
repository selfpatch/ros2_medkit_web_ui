import { useEffect, useState, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { Settings, Loader2, RefreshCw, Lock, Save, X, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type AppState } from '@/lib/store';
import type { Parameter, ParameterType } from '@/lib/types';
import type { SovdResourceEntityType } from '@/lib/types';

interface ConfigurationPanelProps {
    entityId: string;
    /** Optional parameter name to highlight */
    highlightParam?: string;
    /** Entity type for API calls */
    entityType?: SovdResourceEntityType;
}

/**
 * Get badge color for parameter type
 */
function getTypeBadgeVariant(type: ParameterType): 'default' | 'secondary' | 'outline' {
    switch (type) {
        case 'bool':
            return 'default';
        case 'int':
        case 'double':
            return 'secondary';
        default:
            return 'outline';
    }
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
            className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors ${isHighlighted ? 'ring-2 ring-primary border-primary' : ''}`}
        >
            {/* Parameter name */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm truncate">{param.name}</span>
                    {param.read_only && (
                        <span title="Read-only">
                            <Lock className="w-3 h-3 text-muted-foreground" />
                        </span>
                    )}
                </div>
                {param.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{param.description}</p>
                )}
            </div>

            {/* Type badge */}
            <Badge variant={getTypeBadgeVariant(param.type)} className="shrink-0">
                {param.type}
            </Badge>

            {/* Value display/edit */}
            <div className="w-40 shrink-0">
                {param.type === 'bool' ? (
                    // Boolean toggle button
                    <Button
                        variant={param.value ? 'default' : 'outline'}
                        size="sm"
                        className="w-full"
                        disabled={param.read_only || isSaving}
                        onClick={toggleBool}
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : param.value ? 'true' : 'false'}
                    </Button>
                ) : isEditing ? (
                    // Editing mode
                    <div className="flex items-center gap-1">
                        <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="h-8 text-sm font-mono"
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
                        className={`px-3 py-1.5 rounded border text-sm font-mono truncate ${
                            param.read_only
                                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                : 'bg-background cursor-pointer hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                        }`}
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
        fetchConfigurations,
        setParameter,
        resetParameter,
        resetAllConfigurations,
    } = useAppStore(
        useShallow((state: AppState) => ({
            configurations: state.configurations,
            isLoadingConfigurations: state.isLoadingConfigurations,
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
                        <Settings className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Configurations</CardTitle>
                        <span className="text-xs text-muted-foreground">({parameters.length} parameters)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResetAll}
                            disabled={isResettingAll || parameters.length === 0}
                            title="Reset all parameters to defaults"
                        >
                            {isResettingAll ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                                <RotateCcw className="w-4 h-4 mr-1" />
                            )}
                            Reset All
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoadingConfigurations}>
                            <RefreshCw className={`w-4 h-4 ${isLoadingConfigurations ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {parameters.length === 0 ? (
                    <div className="text-center text-muted-foreground py-4">
                        No parameters available for this component.
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {parameters.map((param) => (
                            <ParameterRow
                                key={param.name}
                                param={param}
                                onSetParameter={handleSetParameter}
                                onResetParameter={handleResetParameter}
                                isHighlighted={param.name === highlightParam}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
