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

import { describe, it, expect } from 'vitest';
import {
    ScriptsApiError,
    toScriptsApiError,
    scriptErrorMessage,
    ACTIVE_SCRIPT_STATUSES,
    isActiveScriptStatus,
    scriptEntityKey,
    SCRIPT_ERROR_CODE,
    scriptOutput,
    scriptFailure,
    upsertExecutionRecord,
    markExecutionLost,
    removeExecutionRecord,
    MAX_EXECUTION_HISTORY,
} from './scripts';
import type { ScriptExecution, ScriptExecutionRecord } from './types';

function record(id: string, status = 'running', scriptId = 'diag'): ScriptExecutionRecord {
    return {
        execution: { id, status },
        scriptId,
        scriptName: scriptId,
        entityType: 'components',
        entityId: 'ecu',
    };
}

describe('isActiveScriptStatus', () => {
    it('treats prepared and running as active', () => {
        expect(isActiveScriptStatus('prepared')).toBe(true);
        expect(isActiveScriptStatus('running')).toBe(true);
        expect(ACTIVE_SCRIPT_STATUSES).toEqual(['prepared', 'running']);
    });

    it('treats terminal and unknown statuses as inactive', () => {
        expect(isActiveScriptStatus('completed')).toBe(false);
        expect(isActiveScriptStatus('failed')).toBe(false);
        expect(isActiveScriptStatus('terminated')).toBe(false);
        expect(isActiveScriptStatus('aborted-by-plugin')).toBe(false);
        expect(isActiveScriptStatus('')).toBe(false);
    });
});

describe('scriptEntityKey', () => {
    it('joins entity type and id', () => {
        expect(scriptEntityKey('apps', 'talker')).toBe('apps/talker');
    });
});

describe('toScriptsApiError', () => {
    it('takes the status from the response and the code from the body', () => {
        const err = toScriptsApiError({ error_code: SCRIPT_ERROR_CODE.managed, message: 'Managed script' }, 409);
        expect(err).toBeInstanceOf(ScriptsApiError);
        expect(err.status).toBe(409);
        expect(err.errorCode).toBe('x-medkit-managed-script');
        expect(err.message).toBe('Managed script');
    });

    it('falls back to HTTP <status> when the body carries no message', () => {
        const err = toScriptsApiError({}, 502);
        expect(err.status).toBe(502);
        expect(err.errorCode).toBe('');
        expect(err.message).toBe('HTTP 502');
    });

    it('falls back for a non-object error value', () => {
        const err = toScriptsApiError('boom', 502);
        expect(err.status).toBe(502);
        expect(err.errorCode).toBe('');
        expect(err.message).toBe('HTTP 502');
    });
});

describe('scriptErrorMessage', () => {
    it('uses the gateway message when present', () => {
        const err = new ScriptsApiError('Managed script', 409, SCRIPT_ERROR_CODE.managed);
        expect(scriptErrorMessage(err, 'fallback')).toBe('Managed script');
    });

    it('uses the fallback for an empty message', () => {
        const err = new ScriptsApiError('', 500, '');
        expect(scriptErrorMessage(err, 'fallback')).toBe('fallback');
    });

    it('uses the fallback for a non-error value', () => {
        expect(scriptErrorMessage(undefined, 'fallback')).toBe('fallback');
    });

    it('uses the fallback for a bare network Error', () => {
        const err = new TypeError('Failed to fetch');
        expect(scriptErrorMessage(err, 'fallback')).toBe('fallback');
    });
});

describe('scriptOutput', () => {
    it('returns null when parameters is null', () => {
        const execution: ScriptExecution = { id: 'e1', status: 'completed', parameters: null };
        expect(scriptOutput(execution)).toBeNull();
    });

    it('returns null for an empty object', () => {
        const execution: ScriptExecution = { id: 'e1', status: 'completed', parameters: {} };
        expect(scriptOutput(execution)).toBeNull();
    });

    it('returns a stdout entry when stdout is the only key', () => {
        const execution: ScriptExecution = { id: 'e1', status: 'completed', parameters: { stdout: 'hi' } };
        expect(scriptOutput(execution)).toEqual({ kind: 'stdout', text: 'hi' });
    });

    it('returns a json entry when stdout appears with other keys', () => {
        const execution: ScriptExecution = {
            id: 'e1',
            status: 'completed',
            parameters: { stdout: 'hi', exit_code: 0 },
        };
        expect(scriptOutput(execution)).toEqual({ kind: 'json', value: { stdout: 'hi', exit_code: 0 } });
    });

    it('returns a json entry for a non-object payload', () => {
        expect(scriptOutput({ id: 'e1', status: 'completed', parameters: 42 })).toEqual({
            kind: 'json',
            value: 42,
        });
        expect(scriptOutput({ id: 'e1', status: 'completed', parameters: [1, 2] })).toEqual({
            kind: 'json',
            value: [1, 2],
        });
        expect(scriptOutput({ id: 'e1', status: 'completed', parameters: 'text' })).toEqual({
            kind: 'json',
            value: 'text',
        });
    });
});

describe('scriptFailure', () => {
    it('returns null when error is null', () => {
        const execution: ScriptExecution = { id: 'e1', status: 'failed', error: null };
        expect(scriptFailure(execution)).toBeNull();
    });

    it('extracts message and exit code from a failed execution', () => {
        const execution: ScriptExecution = {
            id: 'e1',
            status: 'failed',
            error: { message: 'Script exited with an error', exit_code: 3 },
        };
        expect(scriptFailure(execution)).toEqual({ message: 'Script exited with an error', exitCode: 3 });
    });

    it('returns exitCode null for a stop or timeout error', () => {
        const execution: ScriptExecution = {
            id: 'e1',
            status: 'terminated',
            error: { message: 'Execution stopped by user' },
        };
        expect(scriptFailure(execution)).toEqual({ message: 'Execution stopped by user', exitCode: null });
    });

    it('returns null when error is not an object', () => {
        const execution: ScriptExecution = { id: 'e1', status: 'failed', error: 'boom' };
        expect(scriptFailure(execution)).toBeNull();
    });
});

describe('execution history reducers', () => {
    it('prepends a new record and returns a new map and a new array', () => {
        const existing = record('e1');
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [existing]]]);
        const incoming = record('e2');

        const next = upsertExecutionRecord(initial, 'components/ecu', incoming);

        expect(next).not.toBe(initial);
        expect(next.get('components/ecu')).not.toBe(initial.get('components/ecu'));
        expect(next.get('components/ecu')).toEqual([incoming, existing]);
    });

    it('replaces an existing record in place, preserving order', () => {
        const r1 = record('e1');
        const r2 = record('e2');
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [r1, r2]]]);
        const updated: ScriptExecutionRecord = { ...r1, execution: { ...r1.execution, status: 'completed' } };

        const next = upsertExecutionRecord(initial, 'components/ecu', updated);

        expect(next.get('components/ecu')).toEqual([updated, r2]);
    });

    it('trims history to MAX_EXECUTION_HISTORY, dropping the oldest inactive record', () => {
        // records[0] is the newest, the last element is the oldest.
        const records = Array.from({ length: MAX_EXECUTION_HISTORY }, (_, i) =>
            record(`c${MAX_EXECUTION_HISTORY - 1 - i}`, 'completed')
        );
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', records]]);

        const next = upsertExecutionRecord(initial, 'components/ecu', record('c-new', 'completed'));

        const arr = next.get('components/ecu')!;
        expect(arr).toHaveLength(MAX_EXECUTION_HISTORY);
        expect(arr[0]!.execution.id).toBe('c-new');
        expect(arr.some((r) => r.execution.id === 'c0')).toBe(false);
        expect(arr.some((r) => r.execution.id === 'c1')).toBe(true);
    });

    it('never drops a record that is still active when trimming', () => {
        const completed = Array.from({ length: 25 }, (_, i) => record(`c${i}`, 'completed'));
        const running = record('running-1', 'running');
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [...completed, running]]]);

        const next = upsertExecutionRecord(initial, 'components/ecu', record('c-new', 'completed'));

        const arr = next.get('components/ecu')!;
        expect(arr).toHaveLength(MAX_EXECUTION_HISTORY);
        expect(arr.some((r) => r.execution.id === 'running-1')).toBe(true);
    });

    it('marks a single record as lost without touching its neighbours', () => {
        const r1 = record('e1');
        const r2 = record('e2');
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [r1, r2]]]);

        const next = markExecutionLost(initial, 'components/ecu', 'e1');

        expect(next).not.toBe(initial);
        const arr = next.get('components/ecu')!;
        expect(arr).not.toBe(initial.get('components/ecu'));
        expect(arr[0]).toEqual({ ...r1, lost: true });
        expect(arr[1]).toBe(r2);
    });

    it('returns the same map when marking an unknown key', () => {
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [record('e1')]]]);

        const next = markExecutionLost(initial, 'apps/other', 'e1');

        expect(next).toBe(initial);
    });

    it('removes only the target record', () => {
        const r1 = record('e1');
        const r2 = record('e2');
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [r1, r2]]]);

        const next = removeExecutionRecord(initial, 'components/ecu', 'e1');

        expect(next).not.toBe(initial);
        const arr = next.get('components/ecu')!;
        expect(arr).not.toBe(initial.get('components/ecu'));
        expect(arr).toEqual([r2]);
    });

    it('drops the key entirely when the last record is removed', () => {
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([['components/ecu', [record('e1')]]]);

        const next = removeExecutionRecord(initial, 'components/ecu', 'e1');

        expect(next.has('components/ecu')).toBe(false);
    });

    it('keeps other entities untouched', () => {
        const ecuRecords = [record('e1')];
        const otherRecords = [record('e2', 'running', 'other')];
        const initial: Map<string, ScriptExecutionRecord[]> = new Map([
            ['components/ecu', ecuRecords],
            ['apps/talker', otherRecords],
        ]);

        const next = removeExecutionRecord(initial, 'components/ecu', 'e1');

        expect(next.get('apps/talker')).toBe(otherRecords);
    });
});
