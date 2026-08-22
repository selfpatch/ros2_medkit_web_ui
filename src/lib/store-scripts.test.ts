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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from './store';
import { SCRIPT_ERROR_CODE, ScriptsApiError } from './scripts';
import type { MedkitClient } from '@selfpatch/ros2-medkit-client-ts';
import type { ScriptExecutionRecord, ScriptMetadata } from './types';

// -----------------------------------------------------------------------------
// These script store actions are not pure helpers, so they cannot be
// exercised through store-helpers.test.ts. They are tested here against the
// real store (setState/getState) rather than through a mock, since the bugs
// covered - the `lost` flag never clearing, any 404 (not just
// resource-not-found) setting it, an unchecked cast letting an unusable
// payload into the store - live in the wiring between the fetch result and
// the state update, not in a function that could be pulled out in isolation.
// -----------------------------------------------------------------------------

function makeRecord(overrides: Partial<ScriptExecutionRecord> = {}): ScriptExecutionRecord {
    return {
        execution: { id: 'e1', status: 'completed' },
        scriptId: 'diag',
        scriptName: 'diag',
        entityType: 'components',
        entityId: 'ecu',
        ...overrides,
    };
}

function makeScript(overrides: Partial<ScriptMetadata> = {}): ScriptMetadata {
    return { id: 'diag', name: 'Diagnostics', ...overrides };
}

/**
 * `GET` always gets a harmless default response, even when the test is
 * really exercising POST or PUT: a successful start/stop can make
 * startScriptPolling create a real interval, and if that interval happens to
 * fire before the test's own cleanup runs, it must not hit an undefined
 * `client.GET`.
 */
function makeClient(method: 'GET' | 'POST' | 'PUT', response: unknown): MedkitClient {
    const client: Record<string, unknown> = {
        GET: vi.fn().mockResolvedValue({ data: undefined, error: undefined, response: { status: 200 } }),
    };
    client[method] = vi.fn().mockResolvedValue(response);
    return client as unknown as MedkitClient;
}

beforeEach(() => {
    useAppStore.getState().stopScriptPolling();
    useAppStore.setState({ client: null, scriptExecutions: new Map(), scriptPollingIntervalId: null });
});

afterEach(() => {
    useAppStore.getState().stopScriptPolling();
    useAppStore.setState({ client: null, scriptExecutions: new Map(), scriptPollingIntervalId: null });
});

describe('refreshScriptExecution', () => {
    it('clears a stale lost flag once the gateway answers successfully', async () => {
        const client = makeClient('GET', {
            data: { id: 'e1', status: 'completed' },
            error: undefined,
            response: { status: 200 },
        });
        useAppStore.setState({
            client,
            scriptExecutions: new Map([['components/ecu', [makeRecord({ lost: true })]]]),
        });

        await useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1');

        const updated = useAppStore.getState().scriptExecutions.get('components/ecu')?.[0];
        expect(updated?.lost).toBe(false);
    });

    it('leaves an untracked record alone on entity-not-found, since the entity may reappear, but still surfaces the failure', async () => {
        const client = makeClient('GET', {
            data: undefined,
            error: { message: 'Entity not found', error_code: SCRIPT_ERROR_CODE.entityNotFound },
            response: { status: 404 },
        });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        // Not the "gone" case (resource-not-found) - this must reach the
        // caller so the card's "Failed to refresh" toast can fire, instead
        // of being swallowed the way it used to be.
        await expect(useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1')).rejects.toThrow(
            ScriptsApiError
        );

        const record = useAppStore.getState().scriptExecutions.get('components/ecu')?.[0];
        expect(record?.lost).toBeUndefined();
    });

    it('marks a record lost when the 404 is resource-not-found, without throwing', async () => {
        const client = makeClient('GET', {
            data: undefined,
            error: { message: 'gone', error_code: SCRIPT_ERROR_CODE.resourceNotFound },
            response: { status: 404 },
        });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        await useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1');

        const record = useAppStore.getState().scriptExecutions.get('components/ecu')?.[0];
        expect(record?.lost).toBe(true);
    });

    it('rethrows a generic gateway error instead of swallowing it', async () => {
        const client = makeClient('GET', {
            data: undefined,
            error: { message: 'Internal error', error_code: '' },
            response: { status: 500 },
        });
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [makeRecord()]]]) });

        await expect(useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1')).rejects.toThrow(
            ScriptsApiError
        );
    });

    it('throws instead of storing an unusable execution when the gateway returns no body', async () => {
        // openapi-fetch yields undefined data for an empty body on a 2xx
        // response - legitimate for a 202. `data as ScriptExecution` used to
        // let that through unchecked.
        const client = makeClient('GET', { data: undefined, error: undefined, response: { status: 202 } });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        await expect(useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1')).rejects.toThrow(
            ScriptsApiError
        );

        // The existing record must be untouched by the rejected payload.
        expect(useAppStore.getState().scriptExecutions.get('components/ecu')?.[0]).toEqual(original);
    });

    it('throws when not connected', async () => {
        useAppStore.setState({ client: null });
        await expect(useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1')).rejects.toThrow(
            ScriptsApiError
        );
    });
});

describe('startScriptExecutionAction', () => {
    it('throws instead of storing an unusable execution when the gateway returns no body', async () => {
        const client = makeClient('POST', { data: undefined, error: undefined, response: { status: 202 } });
        useAppStore.setState({ client });

        await expect(
            useAppStore
                .getState()
                .startScriptExecutionAction('components', 'ecu', makeScript(), { execution_type: 'now' })
        ).rejects.toThrow(ScriptsApiError);

        // The map must stay empty - not hold a record whose `execution` is
        // undefined, which would throw the next time anything reads
        // record.execution.status (collectActiveExecutions, on the very
        // next polling tick, in particular).
        expect(useAppStore.getState().scriptExecutions.get('components/ecu')).toBeUndefined();
        expect(() => useAppStore.getState().startScriptPolling()).not.toThrow();
    });

    it('stores the execution when the gateway returns a usable payload', async () => {
        const client = makeClient('POST', {
            data: { id: 'e1', status: 'running' },
            error: undefined,
            response: { status: 200 },
        });
        useAppStore.setState({ client });

        await useAppStore.getState().startScriptExecutionAction('components', 'ecu', makeScript(), {
            execution_type: 'now',
        });

        expect(useAppStore.getState().scriptExecutions.get('components/ecu')?.[0]?.execution.status).toBe('running');
    });
});

describe('stopScriptExecution', () => {
    it('throws instead of corrupting the record when the gateway returns no body', async () => {
        const client = makeClient('PUT', { data: undefined, error: undefined, response: { status: 202 } });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        await expect(
            useAppStore.getState().stopScriptExecution('components', 'ecu', 'diag', 'e1', 'stop')
        ).rejects.toThrow(ScriptsApiError);

        expect(useAppStore.getState().scriptExecutions.get('components/ecu')?.[0]).toEqual(original);
    });

    it('updates the record when the gateway returns a usable payload', async () => {
        const client = makeClient('PUT', {
            data: { id: 'e1', status: 'terminated' },
            error: undefined,
            response: { status: 200 },
        });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        await useAppStore.getState().stopScriptExecution('components', 'ecu', 'diag', 'e1', 'stop');

        expect(useAppStore.getState().scriptExecutions.get('components/ecu')?.[0]?.execution.status).toBe('terminated');
    });
});
