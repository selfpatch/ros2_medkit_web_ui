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
import { SCRIPT_ERROR_CODE } from './scripts';
import type { MedkitClient } from '@selfpatch/ros2-medkit-client-ts';
import type { ScriptExecutionRecord } from './types';

// -----------------------------------------------------------------------------
// refreshScriptExecution is a store action, not a pure helper, so it cannot be
// exercised through store-helpers.test.ts. It is tested here against the real
// store (setState/getState) rather than through a mock, since the bug this
// covers - the `lost` flag never clearing, and any 404 (not just
// resource-not-found) setting it - lives in the wiring between the fetch
// result and the state update, not in a function that could be pulled out
// in isolation.
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

function makeClient(response: unknown): MedkitClient {
    return { GET: vi.fn().mockResolvedValue(response) } as unknown as MedkitClient;
}

describe('refreshScriptExecution', () => {
    beforeEach(() => {
        useAppStore.getState().stopScriptPolling();
        useAppStore.setState({ client: null, scriptExecutions: new Map(), scriptPollingIntervalId: null });
    });

    afterEach(() => {
        useAppStore.getState().stopScriptPolling();
        useAppStore.setState({ client: null, scriptExecutions: new Map(), scriptPollingIntervalId: null });
    });

    it('clears a stale lost flag once the gateway answers successfully', async () => {
        const client = makeClient({
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

    it('leaves an untracked record alone on entity-not-found, since the entity may reappear', async () => {
        const client = makeClient({
            data: undefined,
            error: { message: 'Entity not found', error_code: SCRIPT_ERROR_CODE.entityNotFound },
            response: { status: 404 },
        });
        const original = makeRecord();
        useAppStore.setState({ client, scriptExecutions: new Map([['components/ecu', [original]]]) });

        await useAppStore.getState().refreshScriptExecution('components', 'ecu', 'diag', 'e1');

        const record = useAppStore.getState().scriptExecutions.get('components/ecu')?.[0];
        expect(record?.lost).toBeUndefined();
    });

    it('marks a record lost when the 404 is resource-not-found', async () => {
        const client = makeClient({
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
});
