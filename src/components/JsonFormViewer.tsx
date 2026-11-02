import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Code, FormInput } from 'lucide-react';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { cn } from '@/lib/utils';
import type { TopicSchema } from '@/lib/types';
import { SchemaForm } from './SchemaFormField';

type ViewMode = 'json' | 'form';

interface JsonFormViewerProps {
    /** Data to display */
    data: unknown;
    /** Schema for form rendering (optional) */
    schema?: TopicSchema;
    /** Whether the form is editable */
    editable?: boolean;
    /** Callback when data changes (only called in editable mode) */
    onChange?: (data: unknown) => void;
    /** Default view mode */
    defaultMode?: ViewMode;
    /** Class name for the container */
    className?: string;
    /** Label for the section */
    label?: string;
    /** Show timestamp */
    timestamp?: number;
}

/**
 * Check if value is a primitive (not object or array)
 */
function isPrimitive(value: unknown): boolean {
    return value === null || value === undefined || typeof value !== 'object';
}

/**
 * Recursive component for rendering nested readonly values
 */
interface ReadonlyFieldProps {
    name: string;
    value: unknown;
    depth?: number;
}

function ReadonlyField({ name, value, depth = 0 }: ReadonlyFieldProps) {
    const [isExpanded, setIsExpanded] = useState(depth < 2);
    const indent = depth * 16;

    // Primitive value
    if (isPrimitive(value)) {
        return (
            <div style={{ marginLeft: indent }} className="flex items-center gap-3 py-0.5">
                <span className="text-sm font-medium min-w-[100px] text-muted-foreground">{name}</span>
                <span className="font-mono text-sm">
                    {value === null || value === undefined ? (
                        <span className="text-muted-foreground italic">{String(value)}</span>
                    ) : (
                        <span className="text-foreground">
                            {typeof value === 'string' ? `"${value}"` : String(value)}
                        </span>
                    )}
                </span>
            </div>
        );
    }

    // Array
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return (
                <div style={{ marginLeft: indent }} className="flex items-center gap-3 py-0.5">
                    <span className="text-sm font-medium min-w-[100px] text-muted-foreground">{name}</span>
                    <span className="text-muted-foreground italic text-sm">[] (empty)</span>
                </div>
            );
        }

        return (
            <div style={{ marginLeft: indent }}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 hover:bg-muted rounded px-1 py-0.5 -ml-1"
                >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="text-sm font-medium text-muted-foreground">{name}</span>
                    <span className="text-xs text-muted-foreground">({value.length} items)</span>
                </button>
                {isExpanded && (
                    <div className="ml-2 border-l border-muted pl-2">
                        {value.map((item, index) => (
                            <ReadonlyField key={index} name={`[${index}]`} value={item} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Object
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
        return (
            <div style={{ marginLeft: indent }} className="flex items-center gap-3 py-0.5">
                <span className="text-sm font-medium min-w-[100px] text-muted-foreground">{name}</span>
                <span className="text-muted-foreground italic text-sm">{'{}'} (empty)</span>
            </div>
        );
    }

    return (
        <div style={{ marginLeft: indent }}>
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 hover:bg-muted rounded px-1 py-0.5 -ml-1"
            >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-medium text-muted-foreground">{name}</span>
            </button>
            {isExpanded && (
                <div className="ml-2 border-l border-muted pl-2">
                    {entries.map(([key, val]) => (
                        <ReadonlyField key={key} name={key} value={val} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Render readonly form view
 */
function ReadonlyFormView({ data }: { data: unknown }) {
    if (isPrimitive(data)) {
        return (
            <div className="font-mono text-sm py-2">
                {data === null ? (
                    <span className="text-muted-foreground italic">null</span>
                ) : data === undefined ? (
                    <span className="text-muted-foreground italic">undefined</span>
                ) : (
                    String(data)
                )}
            </div>
        );
    }

    if (Array.isArray(data)) {
        return (
            <div className="space-y-1">
                {data.map((item, index) => (
                    <ReadonlyField key={index} name={`[${index}]`} value={item} depth={0} />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {Object.entries(data as Record<string, unknown>).map(([key, value]) => (
                <ReadonlyField key={key} name={key} value={value} depth={0} />
            ))}
        </div>
    );
}

/**
 * Format timestamp from nanoseconds to human-readable
 */
function formatTimestamp(ns: number): string {
    const ms = ns / 1_000_000;
    const date = new Date(ms);
    return date.toLocaleString() + '.' + String(Math.floor((ns / 1_000_000) % 1000)).padStart(3, '0');
}

/**
 * JsonFormViewer - displays data in JSON or Form view
 * Supports both readonly and editable modes
 */
export function JsonFormViewer({
    data,
    schema,
    editable = false,
    onChange,
    defaultMode = 'form',
    className,
    label,
    timestamp,
}: JsonFormViewerProps) {
    const [mode, setMode] = useState<ViewMode>(defaultMode);
    const [jsonText, setJsonText] = useState(() => JSON.stringify(data, null, 2));

    // Handle JSON text changes in editable mode
    const handleJsonChange = useCallback(
        (text: string) => {
            setJsonText(text);
            if (onChange) {
                try {
                    const parsed = JSON.parse(text);
                    onChange(parsed);
                } catch {
                    // Invalid JSON, don't propagate
                }
            }
        },
        [onChange]
    );

    // Handle form changes in editable mode
    const handleFormChange = useCallback(
        (newData: Record<string, unknown>) => {
            setJsonText(JSON.stringify(newData, null, 2));
            if (onChange) {
                onChange(newData);
            }
        },
        [onChange]
    );

    // Sync jsonText when data prop changes
    const currentJsonText = JSON.stringify(data, null, 2);
    if (!editable && jsonText !== currentJsonText) {
        setJsonText(currentJsonText);
    }

    return (
        <div className={cn('rounded-lg border bg-card', className)}>
            {/* Header with label and mode toggle */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-hairline bg-canvas">
                {label && <span className="text-sm font-medium">{label}</span>}
                <SegmentedSwitch
                    className="ml-auto"
                    options={[
                        { value: 'json', label: 'JSON', icon: Code },
                        { value: 'form', label: 'Form', icon: FormInput },
                    ]}
                    value={mode}
                    onChange={setMode}
                />
            </div>

            {/* Content */}
            <div className="p-3 max-h-[400px] overflow-auto">
                {mode === 'json' ? (
                    editable ? (
                        <textarea
                            value={jsonText}
                            onChange={(e) => handleJsonChange(e.target.value)}
                            className="w-full h-64 font-mono text-xs p-2 bg-muted rounded resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            spellCheck={false}
                        />
                    ) : (
                        <pre className="font-mono text-xs whitespace-pre-wrap text-foreground">{jsonText}</pre>
                    )
                ) : editable && schema ? (
                    <SchemaForm
                        schema={schema}
                        value={(data as Record<string, unknown>) || {}}
                        onChange={handleFormChange}
                    />
                ) : (
                    <ReadonlyFormView data={data} />
                )}
            </div>

            {/* Footer with timestamp */}
            {timestamp && (
                <div className="px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
                    Received: {formatTimestamp(timestamp)}
                </div>
            )}
        </div>
    );
}

export default JsonFormViewer;
