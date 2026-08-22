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

import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { toast } from 'react-toastify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { isActiveScriptStatus, scriptErrorMessage, scriptFailure, scriptOutput } from '@/lib/scripts';
import type { ScriptExecutionRecord } from '@/lib/types';

interface ScriptExecutionCardProps {
    record: ScriptExecutionRecord;
}

type ExecutionTone = 'ok' | 'error' | 'stopped' | 'neutral';

function toneForStatus(status: string): ExecutionTone {
    if (status === 'completed') return 'ok';
    if (status === 'failed') return 'error';
    if (status === 'terminated') return 'stopped';
    return 'neutral';
}

const TONE_BADGE_CLASSES: Record<ExecutionTone, string> = {
    ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    stopped: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    neutral: 'bg-muted text-muted-foreground',
};

const TONE_TEXT_CLASSES: Record<ExecutionTone, string> = {
    ok: 'text-green-700 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    stopped: 'text-amber-700 dark:text-amber-400',
    neutral: 'text-muted-foreground',
};

/** No in-flight button action. */
type PendingAction = 'stop' | 'force' | 'remove' | 'refresh' | null;

/**
 * Displays one script execution: status badge, progress, result/error and the
 * Stop / Force kill / Remove / Refresh controls. Schedules no timers itself -
 * a single interval in the store polls every active execution, so this
 * component only reacts to whatever record it is handed.
 */
export function ScriptExecutionCard({ record }: ScriptExecutionCardProps) {
    const { execution, scriptId, entityType, entityId, lost } = record;
    const status = execution.status;
    // A record the gateway has evicted is never active for animation/control
    // purposes, even if its last known status was a running one - otherwise
    // the badge keeps pulsing "running" right next to the message saying the
    // gateway no longer tracks it.
    const active = isActiveScriptStatus(status) && !lost;
    const tone = toneForStatus(status);
    const progress = typeof execution.progress === 'number' ? execution.progress : null;
    const output = scriptOutput(execution);
    const failure = scriptFailure(execution);
    const failureLabel = status === 'terminated' ? 'Stopped' : 'Error';

    const [pendingAction, setPendingAction] = useState<PendingAction>(null);

    const { stopScriptExecution, removeScriptExecution, refreshScriptExecution } = useAppStore(
        useShallow((state) => ({
            stopScriptExecution: state.stopScriptExecution,
            removeScriptExecution: state.removeScriptExecution,
            refreshScriptExecution: state.refreshScriptExecution,
        }))
    );

    const handleStop = async (action: string, which: PendingAction) => {
        setPendingAction(which);
        try {
            await stopScriptExecution(entityType, entityId, scriptId, execution.id, action);
        } catch (err) {
            toast.error(scriptErrorMessage(err, 'Failed to stop the script'));
        } finally {
            setPendingAction(null);
        }
    };

    const handleRemove = async () => {
        setPendingAction('remove');
        try {
            await removeScriptExecution(entityType, entityId, scriptId, execution.id);
        } catch (err) {
            toast.error(scriptErrorMessage(err, 'Failed to remove the execution'));
        } finally {
            setPendingAction(null);
        }
    };

    const handleRefresh = async () => {
        setPendingAction('refresh');
        try {
            await refreshScriptExecution(entityType, entityId, scriptId, execution.id);
        } catch (err) {
            toast.error(scriptErrorMessage(err, 'Failed to refresh the execution'));
        } finally {
            setPendingAction(null);
        }
    };

    const busy = pendingAction !== null;

    return (
        <Card>
            <CardContent className="py-3 px-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                        data-testid="execution-status"
                        data-tone={tone}
                        role="status"
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_BADGE_CLASSES[tone]} ${active ? 'animate-pulse' : ''}`}
                    >
                        {status}
                    </span>
                    {lost && (
                        <span className="text-xs text-muted-foreground">
                            The gateway no longer tracks this execution
                        </span>
                    )}
                </div>

                {progress !== null && (
                    <div
                        role="progressbar"
                        aria-label={`Progress for execution ${execution.id}`}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="w-full h-2 rounded-full bg-muted overflow-hidden"
                    >
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                )}

                {output?.kind === 'stdout' && (
                    <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto overflow-y-auto max-h-[200px] whitespace-pre-wrap">
                        {output.text}
                    </pre>
                )}
                {output?.kind === 'json' && (
                    <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto overflow-y-auto max-h-[200px] whitespace-pre-wrap">
                        {JSON.stringify(output.value, null, 2)}
                    </pre>
                )}

                {failure && (
                    <div className={`text-sm ${TONE_TEXT_CLASSES[tone]}`}>
                        <span className="font-medium">{failureLabel}:</span> {failure.message}
                        {failure.exitCode !== null && <span className="ml-1">exit code {failure.exitCode}</span>}
                    </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                    {active && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleStop('stop', 'stop')}
                        >
                            Stop
                        </Button>
                    )}
                    {active && (
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void handleStop('forced_termination', 'force')}
                        >
                            Force kill
                        </Button>
                    )}
                    {!active && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleRemove()}>
                            Remove
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleRefresh()}>
                        Refresh
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
