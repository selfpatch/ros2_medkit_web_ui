// Copyright 2026 bburda
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { toast } from 'react-toastify';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppStore } from '@/lib/store';
import { scriptErrorMessage } from '@/lib/scripts';
import { convertJsonSchemaToTopicSchema, getSchemaDefaults } from '@/lib/schema-utils';
import { SchemaForm } from '@/components/SchemaFormField';
import { ScriptExecutionCard } from '@/components/ScriptExecutionCard';
import type {
    ScriptEntityType,
    ScriptExecutionRecord,
    ScriptMetadata,
    StartScriptExecutionRequest,
    TopicSchema,
} from '@/lib/types';

interface ScriptRowProps {
    script: ScriptMetadata;
    entityId: string;
    entityType: ScriptEntityType;
    /** Executions of this script only, newest first. */
    executions: ScriptExecutionRecord[];
    onDeleted: () => void;
}

/**
 * Only a schema whose every entry looks like a SchemaFieldType can drive the
 * form. `convertJsonSchemaToTopicSchema` passes an unrecognised schema through
 * unchanged, and feeding e.g. {type: 'object'} to SchemaForm throws inside
 * getSchemaDefaults. Anything else falls back to the raw JSON editor.
 */
function schemaLooksLikeForm(schema: TopicSchema | undefined): schema is TopicSchema {
    return (
        !!schema &&
        Object.values(schema).length > 0 &&
        Object.values(schema).every((field) => typeof field === 'object' && field !== null && 'type' in field)
    );
}

/**
 * Expandable row for a single script: metadata, the parameter form (or raw
 * JSON editor as fallback), Run and Delete controls, and the execution cards
 * for this script's runs.
 */
export function ScriptRow({ script, entityId, entityType, executions, onDeleted }: ScriptRowProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [jsonText, setJsonText] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState<Record<string, unknown>>({});
    const [proximityResponse, setProximityResponse] = useState('');

    const { startScriptExecutionAction, deleteScript } = useAppStore(
        useShallow((state) => ({
            startScriptExecutionAction: state.startScriptExecutionAction,
            deleteScript: state.deleteScript,
        }))
    );

    /**
     * The conversion MUST be memoised on the schema reference: the helper
     * builds a fresh object on every call and the effect below that seeds the
     * form's defaults is keyed on that reference. Without the memo the store's
     * once-per-second polling loop would wipe whatever the user is typing.
     */
    const formSchema = useMemo(
        () => (script.parameters_schema ? convertJsonSchemaToTopicSchema(script.parameters_schema) : undefined),
        [script.parameters_schema]
    );

    const usesForm = schemaLooksLikeForm(formSchema);

    useEffect(() => {
        if (usesForm && formSchema) {
            setFormValues(getSchemaDefaults(formSchema));
        }
    }, [formSchema, usesForm]);

    const handleRun = async () => {
        let parameters: Record<string, unknown> | undefined;
        if (usesForm) {
            parameters = formValues;
        } else {
            const trimmed = jsonText.trim();
            if (trimmed) {
                try {
                    parameters = JSON.parse(trimmed) as Record<string, unknown>;
                } catch (err) {
                    setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
                    return;
                }
            }
            setJsonError(null);
        }

        const trimmedProximity = proximityResponse.trim();
        const request: StartScriptExecutionRequest = {
            execution_type: 'now',
            ...(parameters !== undefined ? { parameters } : {}),
            ...(trimmedProximity ? { proximity_response: trimmedProximity } : {}),
        };

        setIsStarting(true);
        try {
            await startScriptExecutionAction(entityType, entityId, script, request);
        } catch (err) {
            toast.error(scriptErrorMessage(err, 'Failed to start the script'));
        } finally {
            setIsStarting(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteScript(entityType, entityId, script.id);
            onDeleted();
        } catch (err) {
            toast.error(scriptErrorMessage(err, 'Failed to delete the script'));
        } finally {
            setIsDeleting(false);
        }
    };

    const descriptionId = `script-description-${script.id}`;

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="rounded-lg border bg-card">
                <CollapsibleTrigger asChild>
                    {/*
                     * The accessible name stays short and controlled-vocabulary
                     * (script name, plus "managed" when it applies) instead of
                     * hiding that status entirely as a bare aria-label={script.name}
                     * used to. The free-text description is deliberately kept
                     * out of the name itself - it is attached via aria-describedby
                     * instead - because concatenating arbitrary manifest prose
                     * into the name risks colliding with short action-button
                     * names elsewhere on the page (e.g. a description containing
                     * "Runs" would otherwise substring-match a "Run" button).
                     */}
                    <button
                        type="button"
                        aria-label={script.managed === true ? `${script.name} managed` : script.name}
                        aria-describedby={script.description ? descriptionId : undefined}
                        className="w-full flex items-center gap-3 p-3 text-left cursor-pointer hover:bg-accent/30 transition-colors"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{script.name}</span>
                                {script.managed === true && (
                                    <Badge variant="outline" className="shrink-0 text-xs">
                                        managed
                                    </Badge>
                                )}
                            </div>
                            {script.description && (
                                <p id={descriptionId} className="text-xs text-muted-foreground truncate">
                                    {script.description}
                                </p>
                            )}
                        </div>
                        {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                    </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                        <p className="text-xs text-muted-foreground">
                            Parameters are passed to the script as JSON on stdin unless the manifest entry declares
                            args.
                        </p>

                        {usesForm && formSchema ? (
                            <div className="bg-muted/30 p-3 rounded-md">
                                <SchemaForm schema={formSchema} value={formValues} onChange={setFormValues} />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Textarea
                                    value={jsonText}
                                    onChange={(e) => {
                                        setJsonText(e.target.value);
                                        setJsonError(null);
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
                            </div>
                        )}

                        {/*
                         * The gateway's built-in backend always reports proximity_proof_required
                         * as false; this field only matters for plugin backends that require a
                         * proximity proof before starting the script.
                         */}
                        {script.proximity_proof_required === true && (
                            <div className="space-y-1">
                                <label
                                    htmlFor={`proximity-${script.id}`}
                                    className="text-xs font-medium text-muted-foreground"
                                >
                                    Proximity response
                                </label>
                                <Input
                                    id={`proximity-${script.id}`}
                                    value={proximityResponse}
                                    onChange={(e) => setProximityResponse(e.target.value)}
                                    placeholder="Proximity proof response"
                                />
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Button variant="default" size="sm" disabled={isStarting} onClick={() => void handleRun()}>
                                Run
                            </Button>
                            {script.managed !== true && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={isDeleting}
                                    onClick={() => void handleDelete()}
                                >
                                    Delete
                                </Button>
                            )}
                        </div>
                    </div>
                </CollapsibleContent>

                {/* Rendered outside CollapsibleContent so collapsing the row does not unmount them. */}
                {executions.length > 0 && (
                    <div className="px-3 pb-3 space-y-2">
                        {executions.map((record) => (
                            <ScriptExecutionCard key={record.execution.id} record={record} />
                        ))}
                    </div>
                )}
            </div>
        </Collapsible>
    );
}
