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

/**
 * Polling cycle for tracked script executions, kept out of the zustand store
 * so it can be unit tested directly (this repo has no pattern for testing
 * store actions). The store wraps this in a setInterval.
 *
 * This module only issues the requests and reports what happened per record;
 * it never folds results onto a history map itself. Folding requires
 * re-reading the store's state after the await (the map may have changed
 * while requests were in flight - a sibling action may have added, removed,
 * or already updated a record), so that responsibility belongs to the
 * caller, not to a function that only ever sees a single snapshot.
 */

import type { MedkitClient } from '@selfpatch/ros2-medkit-client-ts';
import { getScriptExecution } from './api-dispatch';
import { isActiveScriptStatus, scriptErrorCode, SCRIPT_ERROR_CODE } from './scripts';
import type { ScriptExecution, ScriptExecutionRecord } from './types';

type HistoryMap = Map<string, ScriptExecutionRecord[]>;

export function collectActiveExecutions(history: HistoryMap): ScriptExecutionRecord[] {
    const active: ScriptExecutionRecord[] = [];
    for (const records of history.values()) {
        for (const record of records) {
            if (!record.lost && isActiveScriptStatus(record.execution.status)) active.push(record);
        }
    }
    return active;
}

/** Outcome of polling a single tracked execution. */
export type ScriptPollOutcome =
    | { record: ScriptExecutionRecord; execution: ScriptExecution }
    | { record: ScriptExecutionRecord; lost: true };

/**
 * One polling cycle. Returns the outcomes of the requests made, or null when
 * there was nothing to do (so the caller can stop the interval). A record
 * whose request failed with anything other than `resource-not-found` (the
 * script or execution itself is gone) is simply omitted from the result -
 * the caller keeps whatever it already has for it. In particular
 * `entity-not-found` - the entity is momentarily absent, which happens under
 * runtime discovery when a node restarts - must not evict the record, since
 * the entity can reappear on the next tick.
 */
export async function pollScriptExecutionsOnce(
    client: MedkitClient,
    history: HistoryMap,
    options: { signal?: AbortSignal } = {}
): Promise<ScriptPollOutcome[] | null> {
    if (options.signal?.aborted) return null;

    const active = collectActiveExecutions(history);
    if (active.length === 0) return null;

    const results = await Promise.all(
        active.map(async (record): Promise<ScriptPollOutcome | null> => {
            try {
                const { data, error } = await getScriptExecution(
                    client,
                    record.entityType,
                    record.entityId,
                    record.scriptId,
                    record.execution.id,
                    options.signal
                );
                if (error) {
                    return scriptErrorCode(error) === SCRIPT_ERROR_CODE.resourceNotFound
                        ? { record, lost: true as const }
                        : null;
                }
                return data ? { record, execution: data as ScriptExecution } : null;
            } catch (err) {
                console.error('[scriptPolling] failed:', err);
                return null;
            }
        })
    );

    return results.filter((result): result is ScriptPollOutcome => result !== null);
}
