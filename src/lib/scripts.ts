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

import type { ScriptEntityType, ScriptExecution, ScriptExecutionRecord } from './types';

/** Wire values of GenericError.error_code used by the scripts endpoints. */
export const SCRIPT_ERROR_CODE = {
    notImplemented: 'not-implemented',
    entityNotFound: 'entity-not-found',
    resourceNotFound: 'resource-not-found',
    invalidRequest: 'invalid-request',
    invalidParameter: 'invalid-parameter',
    managed: 'x-medkit-managed-script',
    running: 'x-medkit-script-running',
    notRunning: 'x-medkit-script-not-running',
    alreadyExists: 'x-medkit-script-already-exists',
    tooLarge: 'x-medkit-script-too-large',
    concurrencyLimit: 'x-medkit-concurrency-limit',
} as const;

/**
 * Error carrying the gateway status and wire error code. The `throw new
 * Error(message)` pattern used elsewhere in the store drops both, and the
 * scripts UI needs them to tell 409-managed from 409-running.
 */
export class ScriptsApiError extends Error {
    readonly status: number;
    readonly errorCode: string;

    constructor(message: string, status: number, errorCode: string) {
        super(message);
        this.name = 'ScriptsApiError';
        this.status = status;
        this.errorCode = errorCode;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Extract GenericError.error_code from an openapi-fetch error body of unknown shape. */
export function scriptErrorCode(error: unknown): string {
    return isRecord(error) && typeof error.error_code === 'string' ? error.error_code : '';
}

/**
 * Build a ScriptsApiError from an openapi-fetch error body and the response
 * status. GenericError has no `status` field, so the status always comes from
 * the response.
 */
export function toScriptsApiError(error: unknown, status: number): ScriptsApiError {
    if (isRecord(error)) {
        const message = typeof error.message === 'string' && error.message ? error.message : `HTTP ${status}`;
        return new ScriptsApiError(message, status, scriptErrorCode(error));
    }
    return new ScriptsApiError(`HTTP ${status}`, status, '');
}

/** Message for the user: gateway text when present, otherwise the caller's fallback. */
export function scriptErrorMessage(err: unknown, fallback: string): string {
    return err instanceof ScriptsApiError && err.message ? err.message : fallback;
}

/**
 * Validate an openapi-fetch success payload as a usable `ScriptExecution`
 * before it enters the store. `data as ScriptExecution` is a cast, not a
 * check: openapi-fetch yields `undefined` data for an empty body on a 2xx
 * response (legitimate for a 202), and an unchecked cast would let that - or
 * any other malformed payload - become a record whose `execution` is
 * unusable. The very next read of `record.execution.status` (the next
 * polling tick, or the card's render) would then throw on something that is
 * not actually broken, just not yet reflected correctly.
 */
export function toScriptExecution(data: unknown): ScriptExecution {
    if (isRecord(data) && typeof data.id === 'string' && typeof data.status === 'string') {
        return data as ScriptExecution;
    }
    throw new ScriptsApiError('The gateway returned an unusable response for this execution', 0, '');
}

/**
 * True for a plain JSON object: excludes arrays, `null`, and primitives.
 * `JSON.parse` accepts all of those too, so a bare cast to
 * `Record<string, unknown>` would let `[1,2]`, `"hello"`, `42` and `null`
 * all pass through as script parameters and earn a gateway 400 instead of
 * the inline error the parameter field already knows how to show.
 */
export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && !Array.isArray(value);
}

/**
 * Statuses worth polling. Deliberately a white list: `status` is a free-form
 * string on the wire (plugin backends return their own values) and a black list
 * of terminal statuses would poll an unknown status forever.
 */
export const ACTIVE_SCRIPT_STATUSES = ['prepared', 'running'] as const;

export function isActiveScriptStatus(status: string): boolean {
    return (ACTIVE_SCRIPT_STATUSES as readonly string[]).includes(status);
}

export function scriptEntityKey(entityType: ScriptEntityType, entityId: string): string {
    return `${entityType}/${entityId}`;
}

export type ScriptOutput = { kind: 'stdout'; text: string } | { kind: 'json'; value: unknown };

/**
 * Characters of stdout kept from the start and the end of an oversized dump.
 * The content is entirely gateway-controlled and rendered into a single
 * `<pre>` text node whose CSS `max-height` only limits the scrollable box,
 * not the size of the DOM node itself - a script that prints a few megabytes
 * would otherwise sit there in full, and up to MAX_EXECUTION_HISTORY of
 * them can be held per entity at once.
 */
export const SCRIPT_OUTPUT_HEAD_CHARS = 4000;
export const SCRIPT_OUTPUT_TAIL_CHARS = 2000;
const SCRIPT_OUTPUT_MAX_CHARS = SCRIPT_OUTPUT_HEAD_CHARS + SCRIPT_OUTPUT_TAIL_CHARS;

/** Keeps a head and a tail of `text`, with an explicit marker showing what was cut. */
function truncateOutput(text: string): string {
    if (text.length <= SCRIPT_OUTPUT_MAX_CHARS) return text;
    const head = text.slice(0, SCRIPT_OUTPUT_HEAD_CHARS);
    const tail = text.slice(text.length - SCRIPT_OUTPUT_TAIL_CHARS);
    const omitted = text.length - SCRIPT_OUTPUT_HEAD_CHARS - SCRIPT_OUTPUT_TAIL_CHARS;
    return `${head}\n\n... [truncated ${omitted} characters] ...\n\n${tail}`;
}

/**
 * Narrow `ScriptExecution.parameters` (typed `unknown | null`, because the spec
 * declares it as free-form). The gateway parses stdout as JSON and falls back to
 * `{stdout: "..."}` when it is not JSON, so the stdout-only shape gets rendered
 * as text and everything else as JSON.
 */
export function scriptOutput(execution: ScriptExecution): ScriptOutput | null {
    const value = execution.parameters;
    if (value === null || value === undefined) return null;
    if (isRecord(value)) {
        const keys = Object.keys(value);
        if (keys.length === 0) return null;
        if (keys.length === 1 && keys[0] === 'stdout' && typeof value.stdout === 'string') {
            return { kind: 'stdout', text: truncateOutput(value.stdout) };
        }
    }
    return { kind: 'json', value };
}

export interface ScriptFailure {
    message: string;
    /** Present only for a non-zero exit; stop, force kill and timeout carry no exit code. */
    exitCode: number | null;
}

/** Narrow `ScriptExecution.error` (typed `unknown | null`). */
export function scriptFailure(execution: ScriptExecution): ScriptFailure | null {
    const value = execution.error;
    if (!isRecord(value)) return null;
    const message = typeof value.message === 'string' ? value.message : '';
    if (!message) return null;
    return { message, exitCode: typeof value.exit_code === 'number' ? value.exit_code : null };
}

/** Upper bound on tracked executions per entity; a record can hold a full stdout dump. */
export const MAX_EXECUTION_HISTORY = 20;

type HistoryMap = Map<string, ScriptExecutionRecord[]>;

/**
 * Caps the *inactive* records at MAX_EXECUTION_HISTORY, dropping the oldest
 * ones first - not the list as a whole, which can end up longer than that
 * when active executions push it over the cap. Dropping a running execution
 * would orphan the process: the gateway has no endpoint to list executions,
 * so its id could never be recovered. Every currently active record is kept
 * regardless of how many there are.
 */
function trimHistory(records: ScriptExecutionRecord[]): ScriptExecutionRecord[] {
    if (records.length <= MAX_EXECUTION_HISTORY) return records;
    const active = records.filter((r) => isActiveScriptStatus(r.execution.status));
    const inactive = records.filter((r) => !isActiveScriptStatus(r.execution.status));
    const keepInactive = inactive.slice(0, Math.max(0, MAX_EXECUTION_HISTORY - active.length));
    return records.filter((r) => active.includes(r) || keepInactive.includes(r));
}

/**
 * Insert or replace a record. Always returns a new Map and a new array for the
 * touched key so zustand's reference comparison re-renders subscribers.
 */
export function upsertExecutionRecord(map: HistoryMap, key: string, record: ScriptExecutionRecord): HistoryMap {
    const current = map.get(key) ?? [];
    const index = current.findIndex((r) => r.execution.id === record.execution.id);
    const next = index >= 0 ? current.map((r, i) => (i === index ? record : r)) : [record, ...current];
    const result = new Map(map);
    result.set(key, trimHistory(next));
    return result;
}

export function markExecutionLost(map: HistoryMap, key: string, executionId: string): HistoryMap {
    const current = map.get(key);
    if (!current || !current.some((r) => r.execution.id === executionId)) return map;
    const result = new Map(map);
    result.set(
        key,
        current.map((r) => (r.execution.id === executionId ? { ...r, lost: true } : r))
    );
    return result;
}

export function removeExecutionRecord(map: HistoryMap, key: string, executionId: string): HistoryMap {
    const current = map.get(key);
    if (!current) return map;
    const next = current.filter((r) => r.execution.id !== executionId);
    const result = new Map(map);
    if (next.length === 0) result.delete(key);
    else result.set(key, next);
    return result;
}
