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
import type { SovdResourceEntityType } from './types';
import {
    getEntityDetail,
    getEntityData,
    getEntityDataItem,
    putEntityDataItem,
    getEntityOperations,
    getEntityFaults,
    getEntityFaultDetail,
    deleteEntityFault,
    deleteEntityFaults,
    getEntityConfigurations,
    getEntityConfiguration,
    putEntityConfiguration,
    deleteEntityConfiguration,
    deleteEntityConfigurations,
    postEntityExecution,
    getEntityExecution,
    deleteEntityExecution,
    getEntityBulkDataCategories,
    getEntityBulkData,
    getEntityLogs,
    getEntityLogsConfiguration,
    putEntityLogsConfiguration,
} from './api-dispatch';

// ---------------------------------------------------------------------------
// Mock client factory
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

// Cast helper - avoids repeating `as any` everywhere
type MockClient = ReturnType<typeof createMockClient>;

const ENTITY_TYPES: SovdResourceEntityType[] = ['apps', 'components', 'areas', 'functions'];

const ID_PARAM_MAP: Record<SovdResourceEntityType, string> = {
    apps: 'app_id',
    components: 'component_id',
    areas: 'area_id',
    functions: 'function_id',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert a single GET was called with the expected path pattern and path params. */
function expectGet(client: MockClient, pathSubstring: string, pathParams: Record<string, string>) {
    expect(client.GET).toHaveBeenCalledTimes(1);
    const [path, opts] = client.GET.mock.calls[0]!;
    expect(path).toContain(pathSubstring);
    expect(opts.params.path).toEqual(expect.objectContaining(pathParams));
}

function expectPut(client: MockClient, pathSubstring: string, pathParams: Record<string, string>, body?: unknown) {
    expect(client.PUT).toHaveBeenCalledTimes(1);
    const [path, opts] = client.PUT.mock.calls[0]!;
    expect(path).toContain(pathSubstring);
    expect(opts.params.path).toEqual(expect.objectContaining(pathParams));
    if (body !== undefined) {
        expect(opts.body).toEqual(body);
    }
}

function expectPost(client: MockClient, pathSubstring: string, pathParams: Record<string, string>, body?: unknown) {
    expect(client.POST).toHaveBeenCalledTimes(1);
    const [path, opts] = client.POST.mock.calls[0]!;
    expect(path).toContain(pathSubstring);
    expect(opts.params.path).toEqual(expect.objectContaining(pathParams));
    if (body !== undefined) {
        expect(opts.body).toEqual(body);
    }
}

function expectDelete(client: MockClient, pathSubstring: string, pathParams: Record<string, string>) {
    expect(client.DELETE).toHaveBeenCalledTimes(1);
    const [path, opts] = client.DELETE.mock.calls[0]!;
    expect(path).toContain(pathSubstring);
    expect(opts.params.path).toEqual(expect.objectContaining(pathParams));
}

// =============================================================================
// getEntityDetail
// =============================================================================

describe('getEntityDetail', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id} for entity type "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityDetail(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
    });

    it('returns the client response', async () => {
        client.GET.mockResolvedValueOnce({ data: { id: 'e1', name: 'Engine' }, error: undefined });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await getEntityDetail(client as any, 'apps', 'e1');
        expect(result).toEqual({ data: { id: 'e1', name: 'Engine' }, error: undefined });
    });

    it('returns error when client returns error', async () => {
        const errorResponse = { data: undefined, error: { message: 'Not found' } };
        client.GET.mockResolvedValueOnce(errorResponse);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await getEntityDetail(client as any, 'components', 'missing');
        expect(result).toEqual(errorResponse);
    });
});

// =============================================================================
// getEntityData
// =============================================================================

describe('getEntityData', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/data for entity type "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityData(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.GET.mock.calls[0]![0] as string;
        expect(path).toContain('/data');
    });
});

// =============================================================================
// getEntityDataItem
// =============================================================================

describe('getEntityDataItem', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/data/{data_id} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityDataItem(client as any, entityType, 'my-entity', 'temp-sensor');
        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/data/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({ [ID_PARAM_MAP[entityType]]: 'my-entity', data_id: 'temp-sensor' })
        );
    });
});

// =============================================================================
// putEntityDataItem
// =============================================================================

describe('putEntityDataItem', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls PUT /%s/{id}/data/{data_id} for "%s"', async (entityType) => {
        const body = { value: 42 };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await putEntityDataItem(client as any, entityType, 'my-entity', 'temp-sensor', body);
        expectPut(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity', data_id: 'temp-sensor' }, body);
        const path = client.PUT.mock.calls[0]![0] as string;
        expect(path).toContain('/data/');
    });
});

// =============================================================================
// getEntityOperations
// =============================================================================

describe('getEntityOperations', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/operations for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityOperations(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.GET.mock.calls[0]![0] as string;
        expect(path).toContain('/operations');
    });
});

// =============================================================================
// getEntityFaults
// =============================================================================

describe('getEntityFaults', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/faults for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityFaults(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.GET.mock.calls[0]![0] as string;
        expect(path).toContain('/faults');
    });
});

// =============================================================================
// getEntityFaultDetail
// =============================================================================

describe('getEntityFaultDetail', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/faults/{fault_code} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityFaultDetail(client as any, entityType, 'my-entity', 'ENGINE_OVERHEAT');
        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/faults/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({ [ID_PARAM_MAP[entityType]]: 'my-entity', fault_code: 'ENGINE_OVERHEAT' })
        );
    });
});

// =============================================================================
// deleteEntityFault
// =============================================================================

describe('deleteEntityFault', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls DELETE /%s/{id}/faults/{fault_code} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteEntityFault(client as any, entityType, 'my-entity', 'BRAKE_FAIL');
        expect(client.DELETE).toHaveBeenCalledTimes(1);
        const [path, opts] = client.DELETE.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/faults/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({ [ID_PARAM_MAP[entityType]]: 'my-entity', fault_code: 'BRAKE_FAIL' })
        );
    });
});

// =============================================================================
// deleteEntityFaults
// =============================================================================

describe('deleteEntityFaults', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls DELETE /%s/{id}/faults for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteEntityFaults(client as any, entityType, 'my-entity');
        expectDelete(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.DELETE.mock.calls[0]![0] as string;
        expect(path).toContain('/faults');
    });
});

// =============================================================================
// getEntityConfigurations
// =============================================================================

describe('getEntityConfigurations', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/configurations for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityConfigurations(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.GET.mock.calls[0]![0] as string;
        expect(path).toContain('/configurations');
    });
});

// =============================================================================
// getEntityConfiguration
// =============================================================================

describe('getEntityConfiguration', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/configurations/{config_id} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityConfiguration(client as any, entityType, 'my-entity', 'max_rpm');
        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/configurations/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({ [ID_PARAM_MAP[entityType]]: 'my-entity', config_id: 'max_rpm' })
        );
    });
});

// =============================================================================
// putEntityConfiguration
// =============================================================================

describe('putEntityConfiguration', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls PUT /%s/{id}/configurations/{config_id} for "%s"', async (entityType) => {
        const body = { value: 9000 };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await putEntityConfiguration(client as any, entityType, 'my-entity', 'max_rpm', body);
        expectPut(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity', config_id: 'max_rpm' }, body);
        const path = client.PUT.mock.calls[0]![0] as string;
        expect(path).toContain('/configurations/');
    });

    it('passes complex body values', async () => {
        const body = { value: [1, 2, 3] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await putEntityConfiguration(client as any, 'apps', 'my-app', 'thresholds', body);
        const opts = client.PUT.mock.calls[0]![1];
        expect(opts.body).toEqual({ value: [1, 2, 3] });
    });
});

// =============================================================================
// deleteEntityConfiguration
// =============================================================================

describe('deleteEntityConfiguration', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls DELETE /%s/{id}/configurations/{config_id} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteEntityConfiguration(client as any, entityType, 'my-entity', 'max_rpm');
        expect(client.DELETE).toHaveBeenCalledTimes(1);
        const [path, opts] = client.DELETE.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/configurations/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({ [ID_PARAM_MAP[entityType]]: 'my-entity', config_id: 'max_rpm' })
        );
    });
});

// =============================================================================
// deleteEntityConfigurations
// =============================================================================

describe('deleteEntityConfigurations', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls DELETE /%s/{id}/configurations for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await deleteEntityConfigurations(client as any, entityType, 'my-entity');
        expectDelete(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.DELETE.mock.calls[0]![0] as string;
        expect(path).toContain('/configurations');
    });
});

// =============================================================================
// postEntityExecution
// =============================================================================

describe('postEntityExecution', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls POST /%s/{id}/operations/{op_id}/executions for "%s"', async (entityType) => {
        const body = { input: { request: {} } };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await postEntityExecution(client as any, entityType, 'my-entity', 'calibrate', body);
        expectPost(
            client,
            `/${entityType}/`,
            { [ID_PARAM_MAP[entityType]]: 'my-entity', operation_id: 'calibrate' },
            body
        );
        const path = client.POST.mock.calls[0]![0] as string;
        expect(path).toContain('/operations/');
        expect(path).toContain('/executions');
    });

    it('passes empty input body', async () => {
        const body = { input: undefined };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await postEntityExecution(client as any, 'apps', 'e1', 'trigger', body);
        const opts = client.POST.mock.calls[0]![1];
        expect(opts.body).toEqual(body);
    });
});

// =============================================================================
// getEntityExecution
// =============================================================================

describe('getEntityExecution', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/operations/{op_id}/executions/{exec_id} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityExecution(client as any, entityType, 'my-entity', 'calibrate', 'exec-001');
        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/operations/');
        expect(path).toContain('/executions/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({
                [ID_PARAM_MAP[entityType]]: 'my-entity',
                operation_id: 'calibrate',
                execution_id: 'exec-001',
            })
        );
    });
});

// =============================================================================
// deleteEntityExecution
// =============================================================================

describe('deleteEntityExecution', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)(
        'calls DELETE /%s/{id}/operations/{op_id}/executions/{exec_id} for "%s"',
        async (entityType) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await deleteEntityExecution(client as any, entityType, 'my-entity', 'calibrate', 'exec-001');
            expect(client.DELETE).toHaveBeenCalledTimes(1);
            const [path, opts] = client.DELETE.mock.calls[0]!;
            expect(path).toContain(`/${entityType}/`);
            expect(path).toContain('/operations/');
            expect(path).toContain('/executions/');
            expect(opts.params.path).toEqual(
                expect.objectContaining({
                    [ID_PARAM_MAP[entityType]]: 'my-entity',
                    operation_id: 'calibrate',
                    execution_id: 'exec-001',
                })
            );
        }
    );
});

// =============================================================================
// getEntityBulkDataCategories
// =============================================================================

describe('getEntityBulkDataCategories', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/bulk-data for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityBulkDataCategories(client as any, entityType, 'my-entity');
        expectGet(client, `/${entityType}/`, { [ID_PARAM_MAP[entityType]]: 'my-entity' });
        const path = client.GET.mock.calls[0]![0] as string;
        expect(path).toContain('/bulk-data');
    });
});

// =============================================================================
// getEntityBulkData
// =============================================================================

describe('getEntityBulkData', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it.each(ENTITY_TYPES)('calls GET /%s/{id}/bulk-data/{category_id} for "%s"', async (entityType) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityBulkData(client as any, entityType, 'my-entity', 'rosbag-captures');
        expect(client.GET).toHaveBeenCalledTimes(1);
        const [path, opts] = client.GET.mock.calls[0]!;
        expect(path).toContain(`/${entityType}/`);
        expect(path).toContain('/bulk-data/');
        expect(opts.params.path).toEqual(
            expect.objectContaining({
                [ID_PARAM_MAP[entityType]]: 'my-entity',
                category_id: 'rosbag-captures',
            })
        );
    });

    it('returns data from the client', async () => {
        const mockData = { items: [{ id: 'abc', name: 'capture.mcap' }] };
        client.GET.mockResolvedValueOnce({ data: mockData, error: undefined });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await getEntityBulkData(client as any, 'apps', 'e1', 'rosbags');
        expect(result).toEqual({ data: mockData, error: undefined });
    });
});

// =============================================================================
// Cross-cutting: error propagation
// =============================================================================

describe('error propagation', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it('propagates GET errors from getEntityConfigurations', async () => {
        const err = { message: 'Internal Server Error', status: 500 };
        client.GET.mockResolvedValueOnce({ data: undefined, error: err });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await getEntityConfigurations(client as any, 'apps', 'e1');
        expect(result?.error).toEqual(err);
    });

    it('propagates PUT errors from putEntityConfiguration', async () => {
        const err = { message: 'Validation failed', status: 400 };
        client.PUT.mockResolvedValueOnce({ data: undefined, error: err });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await putEntityConfiguration(client as any, 'components', 'c1', 'param', { value: 'bad' });
        expect(result?.error).toEqual(err);
    });

    it('propagates POST errors from postEntityExecution', async () => {
        const err = { message: 'Service unavailable', status: 503 };
        client.POST.mockResolvedValueOnce({ data: undefined, error: err });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await postEntityExecution(client as any, 'areas', 'a1', 'op', { input: {} });
        expect(result?.error).toEqual(err);
    });

    it('propagates DELETE errors from deleteEntityFault', async () => {
        const err = { message: 'Forbidden', status: 403 };
        client.DELETE.mockResolvedValueOnce({ data: undefined, error: err });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await deleteEntityFault(client as any, 'functions', 'f1', 'FC_001');
        expect(result?.error).toEqual(err);
    });
});

// =============================================================================
// getEntityLogs
// =============================================================================

describe('getEntityLogs', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it('dispatches to /apps/{app_id}/logs', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogs(client as any, 'apps', 'motor_ctrl', { severity: 'warning' });
        expect(client.GET).toHaveBeenCalledWith('/apps/{app_id}/logs', {
            params: {
                path: { app_id: 'motor_ctrl' },
                query: { severity: 'warning' },
            },
        });
    });

    it('dispatches to /components/{component_id}/logs with context param', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogs(client as any, 'components', 'powertrain', { context: 'engine' });
        expect(client.GET).toHaveBeenCalledWith('/components/{component_id}/logs', {
            params: {
                path: { component_id: 'powertrain' },
                query: { context: 'engine' },
            },
        });
    });

    it('dispatches to /areas/{area_id}/logs', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogs(client as any, 'areas', 'chassis', {});
        expect(client.GET).toHaveBeenCalledWith('/areas/{area_id}/logs', {
            params: {
                path: { area_id: 'chassis' },
                query: {},
            },
        });
    });

    it('dispatches to /functions/{function_id}/logs', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogs(client as any, 'functions', 'braking', {});
        expect(client.GET).toHaveBeenCalledWith('/functions/{function_id}/logs', {
            params: {
                path: { function_id: 'braking' },
                query: {},
            },
        });
    });

    it('passes AbortSignal through', async () => {
        const controller = new AbortController();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogs(client as any, 'apps', 'motor', { severity: 'error' }, controller.signal);
        expect(client.GET).toHaveBeenCalledWith(
            '/apps/{app_id}/logs',
            expect.objectContaining({
                signal: controller.signal,
            })
        );
    });
});

// =============================================================================
// getEntityLogsConfiguration
// =============================================================================

describe('getEntityLogsConfiguration', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it('dispatches to /apps/{app_id}/logs/configuration', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogsConfiguration(client as any, 'apps', 'motor');
        expect(client.GET).toHaveBeenCalledWith('/apps/{app_id}/logs/configuration', {
            params: { path: { app_id: 'motor' } },
        });
    });

    it('dispatches to /components, /areas, /functions', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogsConfiguration(client as any, 'components', 'c1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogsConfiguration(client as any, 'areas', 'a1');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await getEntityLogsConfiguration(client as any, 'functions', 'f1');
        expect(client.GET).toHaveBeenNthCalledWith(1, '/components/{component_id}/logs/configuration', {
            params: { path: { component_id: 'c1' } },
        });
        expect(client.GET).toHaveBeenNthCalledWith(2, '/areas/{area_id}/logs/configuration', {
            params: { path: { area_id: 'a1' } },
        });
        expect(client.GET).toHaveBeenNthCalledWith(3, '/functions/{function_id}/logs/configuration', {
            params: { path: { function_id: 'f1' } },
        });
    });
});

// =============================================================================
// putEntityLogsConfiguration
// =============================================================================

describe('putEntityLogsConfiguration', () => {
    let client: MockClient;
    beforeEach(() => {
        client = createMockClient();
    });

    it('PUTs to /apps/{app_id}/logs/configuration with body', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await putEntityLogsConfiguration(client as any, 'apps', 'motor', {
            severity_filter: 'warning',
            max_entries: 500,
        });
        expect(client.PUT).toHaveBeenCalledWith('/apps/{app_id}/logs/configuration', {
            params: { path: { app_id: 'motor' } },
            body: { severity_filter: 'warning', max_entries: 500 },
        });
    });
});
