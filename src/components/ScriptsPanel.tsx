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

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Terminal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScriptRow } from '@/components/ScriptRow';
import { ScriptUploadDialog } from '@/components/ScriptUploadDialog';
import { useAppStore } from '@/lib/store';
import { scriptEntityKey } from '@/lib/scripts';
import type { ScriptEntityType, ScriptExecutionRecord, ScriptMetadata } from '@/lib/types';

interface ScriptsPanelProps {
    entityId: string;
    entityType: ScriptEntityType;
}

/**
 * Module-level constant used as the "no history yet" fallback. A `?? []`
 * fallback inside the store selector below would build a fresh array on
 * every read, and zustand 5 treats that as an unstable snapshot and loops
 * with a getSnapshot warning.
 */
const EMPTY_EXECUTIONS: ScriptExecutionRecord[] = [];

/**
 * Scripts panel: lists the scripts uploaded to this app or component, and
 * hosts the upload dialog. Each row (`ScriptRow`) owns its own run/delete
 * controls and execution cards; this panel owns the list fetch, the
 * empty/error states, and the reload trigger shared by upload and delete.
 *
 * The 501 branch ("not configured on this gateway") is defensive: the
 * Scripts tab itself is gated on the gateway capability, so in practice this
 * panel only mounts when a script backend exists.
 */
export function ScriptsPanel({ entityId, entityType }: ScriptsPanelProps) {
    const fetchEntityScripts = useAppStore((state) => state.fetchEntityScripts);
    const stored = useAppStore((state) => state.scriptExecutions.get(scriptEntityKey(entityType, entityId)));
    const executions = stored ?? EMPTY_EXECUTIONS;

    const [scripts, setScripts] = useState<ScriptMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [uploadOpen, setUploadOpen] = useState(false);

    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Clear whatever the previous entity (or previous attempt) rendered so
        // it never lingers under the new heading while the fresh request is
        // in flight.
        setScripts([]);
        setErrorStatus(null);
        setIsLoading(true);

        const load = async () => {
            try {
                const result = await fetchEntityScripts(entityType, entityId, controller.signal);
                if (controller.signal.aborted) return;

                if (result.errorStatus !== undefined) {
                    setErrorStatus(result.errorStatus);
                } else {
                    setScripts(result.items);
                }
            } catch (err) {
                if ((err as { name?: string }).name === 'AbortError') return;
                setErrorStatus(-1);
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        };

        void load();

        return () => {
            abortRef.current?.abort();
        };
    }, [entityId, entityType, reloadToken, fetchEntityScripts]);

    const reload = () => setReloadToken((t) => t + 1);

    let body: React.JSX.Element;
    if (isLoading) {
        body = (
            <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading scripts...</span>
            </div>
        );
    } else if (errorStatus === 501) {
        body = (
            <div className="text-center py-8">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">Scripts are not configured on this gateway</p>
            </div>
        );
    } else if (errorStatus !== null) {
        body = (
            <div className="text-center py-8 space-y-2">
                <p className="text-sm text-destructive">Failed to load scripts</p>
                <button type="button" onClick={reload} className="text-xs underline text-muted-foreground">
                    Retry
                </button>
            </div>
        );
    } else if (scripts.length === 0) {
        body = (
            <div className="text-center py-8">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">No scripts available for this entity</p>
            </div>
        );
    } else {
        body = (
            <div className="space-y-2">
                {scripts.map((script) => (
                    <ScriptRow
                        key={script.id}
                        script={script}
                        entityId={entityId}
                        entityType={entityType}
                        executions={executions.filter((r) => r.scriptId === script.id)}
                        onDeleted={reload}
                    />
                ))}
            </div>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Scripts</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                            <Upload className="w-4 h-4 mr-1.5" />
                            Upload
                        </Button>
                        <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh">
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>{body}</CardContent>
            <ScriptUploadDialog
                open={uploadOpen}
                onOpenChange={setUploadOpen}
                entityId={entityId}
                entityType={entityType}
                onUploaded={reload}
            />
        </Card>
    );
}
