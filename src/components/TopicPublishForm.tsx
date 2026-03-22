import { useState, useEffect, useMemo } from 'react';
import { Loader2, Send, Code, FormInput } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SchemaForm } from '@/components/SchemaFormField';
import { getSchemaDefaults, deepMerge } from '@/lib/schema-utils';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/lib/store';
import type { ComponentTopic, TopicSchema, SovdResourceEntityType } from '@/lib/types';

interface TopicPublishFormProps {
    /** The topic to publish to */
    topic: ComponentTopic;
    /** Entity ID (for API calls) */
    entityId: string;
    /** Entity type for API endpoint */
    entityType?: SovdResourceEntityType;
    /** External initial value (overrides topic-based defaults) */
    initialValue?: unknown;
    /** Callback when value changes */
    onValueChange?: (value: unknown) => void;
}

type ViewMode = 'form' | 'json';

/**
 * Get initial form values from topic data or default values
 */
function getInitialValues(topic: ComponentTopic): Record<string, unknown> {
    // Helper to ensure we have an object
    const ensureObject = (val: unknown): Record<string, unknown> | null => {
        if (!val) return null;
        if (typeof val === 'object') return val as Record<string, unknown>;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                if (typeof parsed === 'object' && parsed !== null) {
                    return parsed as Record<string, unknown>;
                }
            } catch {
                // Not JSON
            }
        }
        return null;
    };

    // If we have actual data, use it
    const dataObj = ensureObject(topic.data);
    if (dataObj) return dataObj;

    // If we have type_info with default_value, use that
    const defaultObj = ensureObject(topic.type_info?.default_value);
    if (defaultObj) return defaultObj;

    return {};
}

/**
 * Form for publishing messages to a ROS 2 topic
 * Supports both schema-based form view and raw JSON editing
 */
export function TopicPublishForm({
    topic,
    entityId,
    entityType = 'components',
    initialValue,
    onValueChange,
}: TopicPublishFormProps) {
    const { publishToEntityData } = useAppStore(
        useShallow((state) => ({
            publishToEntityData: state.publishToEntityData,
        }))
    );
    const [viewMode, setViewMode] = useState<ViewMode>('form');
    const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
        if (initialValue && typeof initialValue === 'object') {
            return initialValue as Record<string, unknown>;
        }
        return getInitialValues(topic);
    });
    const [isPublishing, setIsPublishing] = useState(false);

    // Reset form when switching topics.
    // Note: We intentionally only depend on topic.topic (the topic path) to reset on topic change.
    // Other topic properties (data, type_info) may change frequently without requiring a form reset.
    useEffect(() => {
        const initial =
            initialValue && typeof initialValue === 'object'
                ? (initialValue as Record<string, unknown>)
                : getInitialValues(topic);
        setFormValues(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topic.topic]);

    // Sync with external initialValue changes
    useEffect(() => {
        if (initialValue && typeof initialValue === 'object') {
            setFormValues(initialValue as Record<string, unknown>);
        }
    }, [initialValue]);

    // Notify parent of value changes
    const handleFormValuesChange = (newValues: Record<string, unknown>) => {
        setFormValues(newValues);
        onValueChange?.(newValues);
    };

    // Always compute complete JSON from schema + current form values
    const jsonValue = useMemo(() => {
        // If we have schema, merge defaults with current form values to ensure completeness
        if (topic.type_info?.schema) {
            const defaults = getSchemaDefaults(topic.type_info.schema as TopicSchema);
            const merged = deepMerge(defaults, formValues);
            return JSON.stringify(merged, null, 2);
        }
        // Otherwise just use form values
        return JSON.stringify(formValues, null, 2);
    }, [formValues, topic.type_info?.schema]);

    // Track JSON input separately for editing (when in JSON mode)
    const [jsonInput, setJsonInput] = useState(jsonValue);

    // Sync computed JSON to input when form values change
    useEffect(() => {
        setJsonInput(jsonValue);
    }, [jsonValue]);

    // Parse JSON input and update form values
    const handleJsonChange = (newJson: string) => {
        setJsonInput(newJson);
        try {
            const parsed = JSON.parse(newJson);
            if (typeof parsed === 'object' && parsed !== null) {
                handleFormValuesChange(parsed);
            }
        } catch {
            // Invalid JSON - don't update form values
        }
    };

    const handlePublish = async () => {
        // Use the full topic path for the API, but strip leading slash for cleaner URL
        // The backend adds it back if needed
        const topicName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;

        // Validate and get data to publish
        let dataToPublish: unknown;
        if (viewMode === 'json') {
            try {
                dataToPublish = JSON.parse(jsonInput);
            } catch {
                toast.error('Invalid JSON format. Please check your message data.');
                return;
            }
        } else {
            // Merge form values with schema defaults for completeness
            if (topic.type_info?.schema) {
                const defaults = getSchemaDefaults(topic.type_info.schema as TopicSchema);
                dataToPublish = deepMerge(defaults, formValues);
            } else {
                dataToPublish = formValues;
            }
        }

        // Get message type - prefer explicit type, fall back to inference
        const messageType = topic.type || inferMessageType(topic.data);

        setIsPublishing(true);
        try {
            await publishToEntityData(entityType, entityId, topicName, {
                value: { type: messageType, data: dataToPublish },
            });
            toast.success(`Published to ${topic.topic}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to publish';
            toast.error(`Publish failed: ${message}`);
        } finally {
            setIsPublishing(false);
        }
    };

    /**
     * Fallback heuristic to infer message type from data structure.
     * This is unreliable and should only be used when topic.type is not available.
     * @param data - The topic data to analyze
     * @returns Best guess at message type, defaults to std_msgs/msg/String
     */
    const inferMessageType = (data: unknown): string => {
        if (data && typeof data === 'object') {
            const keys = Object.keys(data as object);
            if (keys.includes('linear') && keys.includes('angular')) {
                return 'geometry_msgs/msg/Twist';
            }
            if (keys.includes('data') && keys.length === 1) {
                return 'std_msgs/msg/String';
            }
        }
        // Warning: falling back to String type - message structure may not match
        console.warn(`Could not determine message type for topic ${topic.topic}, defaulting to std_msgs/msg/String`);
        return 'std_msgs/msg/String';
    };

    const hasSchema = topic.type_info?.schema && Object.keys(topic.type_info.schema).length > 0;

    return (
        <div className="space-y-4">
            {/* View mode toggle - only show if we have schema */}
            {hasSchema ? (
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant={viewMode === 'form' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('form')}
                        className="h-7"
                    >
                        <FormInput className="h-3 w-3 mr-1" />
                        Form
                    </Button>
                    <Button
                        type="button"
                        variant={viewMode === 'json' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('json')}
                        className="h-7"
                    >
                        <Code className="h-3 w-3 mr-1" />
                        JSON
                    </Button>
                    {topic.type && <span className="text-xs text-muted-foreground ml-auto">{topic.type}</span>}
                </div>
            ) : (
                <div className="text-xs text-muted-foreground">
                    {topic.type ? (
                        <span>Type: {topic.type} (schema not available)</span>
                    ) : (
                        <span>Message type unknown - topic may not exist on ROS 2 graph yet</span>
                    )}
                </div>
            )}

            {/* Form or JSON editor */}
            {viewMode === 'form' && hasSchema ? (
                <div className="p-3 rounded-md border bg-card">
                    <SchemaForm
                        schema={topic.type_info?.schema as TopicSchema}
                        value={formValues}
                        onChange={handleFormValuesChange}
                    />
                </div>
            ) : (
                <Textarea
                    value={jsonInput}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    placeholder="Enter JSON message data..."
                    className="font-mono text-xs min-h-[120px]"
                />
            )}

            {/* Publish button */}
            <Button onClick={handlePublish} disabled={isPublishing} size="sm" className="w-full">
                {isPublishing ? (
                    <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Publishing...
                    </>
                ) : (
                    <>
                        <Send className="w-3 h-3 mr-2" />
                        Publish
                    </>
                )}
            </Button>
        </div>
    );
}
