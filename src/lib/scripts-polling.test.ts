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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollScriptExecutionsOnce, collectActiveExecutions } from './scripts-polling';
import { SCRIPT_ERROR_CODE } from './scripts';
import type { ScriptEntityType, ScriptExecutionRecord } from './types';

// ---------------------------------------------------------------------------
// Mock client factory - same shape as api-dispatch.test.ts
// ---------------------------------------------------------------------------

function createMockClient() {
    return {
        GET: vi.fn().mockResolvedValue({ data: { ok: true }, error: undefined }),
        POST: vi.fn().mockResolvedValue({ data: { ok: true }, error: undefined }),
        PUT: vi.fn().mockResolvedValue({ data: { ok: true }, error: undefined }),
        DELETE: vi.fn().mockResolvedValue({ data: { ok: true }, error: undefined }),
        streams: {},
    };
}

type MockClient = ReturnType<typeof createMockClient>;
type HistoryMap = Map<string, ScriptExecutionRecord[]>;

function record(
    id: string,
    status = 'running',
    entityType: ScriptEntityType = 'components',
    entityId = 'ecu'
): ScriptExecutionRecord {
    return {
        execution: { id, status },
        scriptId: 'diag',
        scriptName: 'diag',
        entityType,
        entityId,
    };
}

describe('collectActiveExecutions', () => {
    it('keeps only active, non-lost records across every key', () => {
        const history: HistoryMap = new Map([
            ['components/ecu', [record('e1', 'running'), record('e2', 'completed')]],
            [
                'apps/talker',
                [
                    { ...record('e3', 'prepared', 'apps', 'talker'), lost: true },
                    record('e4', 'prepared', 'apps', 'talker'),
                ],
            ],
        ]);

        const active = collectActiveExecutions(history);

        expect(active.map((r) => r.execution.id)).toEqual(['e1', 'e4']);
    });
});

describe('pollScriptExecutionsOnce', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it('returns null when no execution is active', async () => {
        const history: HistoryMap = new Map([['components/ecu', [record('e1', 'completed')]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toBeNull();
        expect(client.GET).not.toHaveBeenCalled();
    });

    it('skips records already marked lost', async () => {
        const lost = { ...record('e1', 'running'), lost: true };
        const history: HistoryMap = new Map([['components/ecu', [lost]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toBeNull();
        expect(client.GET).not.toHaveBeenCalled();
    });

    it('queries every active execution once per call', async () => {
        client.GET.mockResolvedValue({
            data: { id: 'x', status: 'running' },
            error: undefined,
            response: { status: 200 },
        });
        const history: HistoryMap = new Map([
            ['components/ecu', [record('e1', 'running'), record('e2', 'prepared')]],
            ['apps/talker', [record('e3', 'running', 'apps', 'talker')]],
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pollScriptExecutionsOnce(client as any, history);

        expect(client.GET).toHaveBeenCalledTimes(3);
    });

    it('returns the fresh execution payload as an outcome, without touching the input', async () => {
        const fresh = { id: 'e1', status: 'completed', progress: 100 };
        client.GET.mockResolvedValue({ data: fresh, error: undefined, response: { status: 200 } });
        const original = record('e1', 'running');
        const originalExecution = original.execution;
        const history: HistoryMap = new Map([['components/ecu', [original]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        const outcome = result![0]!;
        expect('lost' in outcome).toBe(false);
        if (!('lost' in outcome)) {
            expect(outcome.execution).toEqual(fresh);
        }
        // The caller re-derives the key from outcome.record, so it must be the
        // same tracked record - not a copy.
        expect(outcome.record).toBe(original);

        // The input map and the original record must be untouched - the function must never mutate its arguments.
        expect(history.get('components/ecu')![0]).toBe(original);
        expect(original.execution).toBe(originalExecution);
        expect(original.execution.status).toBe('running');
    });

    it('marks a record lost on a resource-not-found 404 and leaves the others untouched', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.GET.mockImplementation((_path: string, opts: any) => {
            const execId = opts.params.path.execution_id as string;
            if (execId === 'e1') {
                return Promise.resolve({
                    data: undefined,
                    error: { message: 'Not found', error_code: SCRIPT_ERROR_CODE.resourceNotFound },
                    response: { status: 404 },
                });
            }
            return Promise.resolve({
                data: { id: execId, status: 'prepared' },
                error: undefined,
                response: { status: 200 },
            });
        });
        const r1 = record('e1', 'running');
        const r2 = record('e2', 'running');
        const history: HistoryMap = new Map([['components/ecu', [r1, r2]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toHaveLength(2);
        const outcome1 = result!.find((o) => o.record.execution.id === 'e1')!;
        const outcome2 = result!.find((o) => o.record.execution.id === 'e2')!;
        expect('lost' in outcome1 && outcome1.lost).toBe(true);
        expect('lost' in outcome2).toBe(false);
        if (!('lost' in outcome2)) {
            expect(outcome2.execution.status).toBe('prepared');
        }

        // The input map and the original records must be untouched.
        expect(history.get('components/ecu')).toEqual([r1, r2]);
        expect(r1.lost).toBeUndefined();
        expect(r2.execution.status).toBe('running');
    });

    it('omits the record on a 404 whose error_code is entity-not-found, since the entity may reappear', async () => {
        client.GET.mockResolvedValue({
            data: undefined,
            error: { message: 'Entity not found', error_code: SCRIPT_ERROR_CODE.entityNotFound },
            response: { status: 404 },
        });
        const original = record('e1', 'running');
        const history: HistoryMap = new Map([['components/ecu', [original]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toEqual([]);
        // Not marked lost and not evicted from the caller's perspective: the
        // original record is untouched, unlike the resource-not-found case above.
        expect(history.get('components/ecu')![0]).toBe(original);
        expect(original.lost).toBeUndefined();
    });

    it('omits the record from outcomes when the request fails with 500', async () => {
        client.GET.mockResolvedValue({
            data: undefined,
            error: { message: 'Internal Server Error' },
            response: { status: 500 },
        });
        const original = record('e1', 'running');
        const history: HistoryMap = new Map([['components/ecu', [original]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toEqual([]);
        // The input map and the original record must be untouched.
        expect(history.get('components/ecu')![0]).toBe(original);
        expect(original.execution.status).toBe('running');
    });

    it('uses the entity type and id carried by the record', async () => {
        client.GET.mockResolvedValue({
            data: { id: 'e1', status: 'running' },
            error: undefined,
            response: { status: 200 },
        });
        const appRecord = record('e1', 'running', 'apps', 'talker');
        const history: HistoryMap = new Map([['apps/talker', [appRecord]]]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pollScriptExecutionsOnce(client as any, history);

        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toBe('/apps/{app_id}/scripts/{script_id}/executions/{execution_id}');
        expect(opts.params.path).toEqual({ app_id: 'talker', script_id: 'diag', execution_id: 'e1' });
    });

    it('returns independent outcomes for records tracked under different keys', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.GET.mockImplementation((_path: string, opts: any) => {
            const execId = opts.params.path.execution_id as string;
            if (execId === 'e1') {
                return Promise.resolve({
                    data: undefined,
                    error: { message: 'gone', error_code: SCRIPT_ERROR_CODE.resourceNotFound },
                    response: { status: 404 },
                });
            }
            return Promise.resolve({
                data: { id: execId, status: 'completed' },
                error: undefined,
                response: { status: 200 },
            });
        });
        const r1 = record('e1', 'running', 'components', 'ecu');
        const r2 = record('e2', 'prepared', 'apps', 'talker');
        const history: HistoryMap = new Map([
            ['components/ecu', [r1]],
            ['apps/talker', [r2]],
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await pollScriptExecutionsOnce(client as any, history);

        expect(result).toHaveLength(2);
        const outcome1 = result!.find((o) => o.record === r1)!;
        const outcome2 = result!.find((o) => o.record === r2)!;
        expect('lost' in outcome1 && outcome1.lost).toBe(true);
        expect('lost' in outcome2).toBe(false);
        if (!('lost' in outcome2)) {
            expect(outcome2.execution.status).toBe('completed');
        }

        // The input map and the original records must be untouched.
        expect(history.get('components/ecu')).toEqual([r1]);
        expect(history.get('apps/talker')).toEqual([r2]);
        expect(r1.lost).toBeUndefined();
        expect(r2.execution.status).toBe('prepared');
    });

    it('returns null when the abort signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const history: HistoryMap = new Map([['components/ecu', [record('e1', 'running')]]]);

        const result = await pollScriptExecutionsOnce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            client as any,
            history,
            { signal: controller.signal }
        );

        expect(result).toBeNull();
        expect(client.GET).not.toHaveBeenCalled();
    });
});
