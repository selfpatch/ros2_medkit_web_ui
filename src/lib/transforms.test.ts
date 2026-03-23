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
    unwrapItems,
    transformFault,
    transformFaultsResponse,
    transformOperationsResponse,
    transformDataResponse,
    transformConfigurationsResponse,
    transformBulkDataDescriptor,
} from './transforms';

// =============================================================================
// unwrapItems
// =============================================================================

describe('unwrapItems', () => {
    it('passes through an array directly', () => {
        const arr = [1, 2, 3];
        expect(unwrapItems<number>(arr)).toEqual([1, 2, 3]);
    });

    it('unwraps {items: [...]} wrapper object', () => {
        const wrapped = { items: ['a', 'b'] };
        expect(unwrapItems<string>(wrapped)).toEqual(['a', 'b']);
    });

    it('returns empty array when items key is missing', () => {
        expect(unwrapItems<string>({})).toEqual([]);
    });

    it('returns empty array for null input', () => {
        expect(unwrapItems<string>(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
        expect(unwrapItems<string>(undefined)).toEqual([]);
    });

    it('returns empty array when items is undefined', () => {
        const wrapped = { items: undefined };
        expect(unwrapItems<string>(wrapped)).toEqual([]);
    });
});

// =============================================================================
// transformFault
// =============================================================================

describe('transformFault', () => {
    const makeFaultInput = (overrides: Record<string, unknown> = {}) => ({
        fault_code: 'ENGINE_OVERHEAT',
        description: 'Engine temperature exceeded threshold',
        severity: 2,
        severity_label: 'error',
        status: 'CONFIRMED',
        first_occurred: 1700000000,
        last_occurred: 1700001000,
        occurrence_count: 3,
        reporting_sources: ['/powertrain/engine_monitor'],
        ...overrides,
    });

    it('maps fault_code to code', () => {
        const result = transformFault(makeFaultInput());
        expect(result.code).toBe('ENGINE_OVERHEAT');
    });

    it('maps description to message', () => {
        const result = transformFault(makeFaultInput());
        expect(result.message).toBe('Engine temperature exceeded threshold');
    });

    it('maps first_occurred unix timestamp to ISO 8601 string', () => {
        const result = transformFault(makeFaultInput({ first_occurred: 1700000000 }));
        expect(result.timestamp).toBe(new Date(1700000000 * 1000).toISOString());
    });

    it('sets entity_type to "app"', () => {
        const result = transformFault(makeFaultInput());
        expect(result.entity_type).toBe('app');
    });

    describe('entity_id extraction from reporting_sources', () => {
        it('extracts last segment of node path', () => {
            const result = transformFault(makeFaultInput({ reporting_sources: ['/powertrain/engine_monitor'] }));
            expect(result.entity_id).toBe('engine-monitor');
        });

        it('converts underscores to hyphens in entity_id', () => {
            const result = transformFault(makeFaultInput({ reporting_sources: ['/ns/my_node_name'] }));
            expect(result.entity_id).toBe('my-node-name');
        });

        it('uses "unknown" when reporting_sources is empty', () => {
            const result = transformFault(makeFaultInput({ reporting_sources: [] }));
            expect(result.entity_id).toBe('unknown');
        });

        it('uses "unknown" when reporting_sources is missing', () => {
            const result = transformFault(makeFaultInput({ reporting_sources: undefined }));
            expect(result.entity_id).toBe('unknown');
        });
    });

    describe('severity mapping', () => {
        it('maps severity_label "critical" to critical', () => {
            const result = transformFault(makeFaultInput({ severity: 0, severity_label: 'critical' }));
            expect(result.severity).toBe('critical');
        });

        it('maps severity_label "error" to error', () => {
            const result = transformFault(makeFaultInput({ severity: 0, severity_label: 'error' }));
            expect(result.severity).toBe('error');
        });

        it('maps severity_label "warning" to warning', () => {
            const result = transformFault(makeFaultInput({ severity: 0, severity_label: 'warning' }));
            expect(result.severity).toBe('warning');
        });

        it('maps severity_label "warn" to warning', () => {
            const result = transformFault(makeFaultInput({ severity: 0, severity_label: 'warn' }));
            expect(result.severity).toBe('warning');
        });

        it('maps severity >= 3 to critical regardless of label', () => {
            const result = transformFault(makeFaultInput({ severity: 3, severity_label: '' }));
            expect(result.severity).toBe('critical');
        });

        it('maps severity === 2 to error when label is absent', () => {
            const result = transformFault(makeFaultInput({ severity: 2, severity_label: '' }));
            expect(result.severity).toBe('error');
        });

        it('maps severity === 1 to warning when label is absent', () => {
            const result = transformFault(makeFaultInput({ severity: 1, severity_label: '' }));
            expect(result.severity).toBe('warning');
        });

        it('defaults to info when severity is 0 and label is empty', () => {
            const result = transformFault(makeFaultInput({ severity: 0, severity_label: '' }));
            expect(result.severity).toBe('info');
        });
    });

    describe('status mapping', () => {
        it('maps CONFIRMED to active', () => {
            const result = transformFault(makeFaultInput({ status: 'CONFIRMED' }));
            expect(result.status).toBe('active');
        });

        it('maps ACTIVE to active', () => {
            const result = transformFault(makeFaultInput({ status: 'ACTIVE' }));
            expect(result.status).toBe('active');
        });

        it('maps PENDING to pending', () => {
            const result = transformFault(makeFaultInput({ status: 'PENDING' }));
            expect(result.status).toBe('pending');
        });

        it('maps PREFAILED to pending', () => {
            const result = transformFault(makeFaultInput({ status: 'PREFAILED' }));
            expect(result.status).toBe('pending');
        });

        it('maps CLEARED to cleared', () => {
            const result = transformFault(makeFaultInput({ status: 'CLEARED' }));
            expect(result.status).toBe('cleared');
        });

        it('maps RESOLVED to cleared', () => {
            const result = transformFault(makeFaultInput({ status: 'RESOLVED' }));
            expect(result.status).toBe('cleared');
        });

        it('maps HEALED to healed', () => {
            const result = transformFault(makeFaultInput({ status: 'HEALED' }));
            expect(result.status).toBe('healed');
        });

        it('maps PREPASSED to healed', () => {
            const result = transformFault(makeFaultInput({ status: 'PREPASSED' }));
            expect(result.status).toBe('healed');
        });

        it('defaults to active for unknown status', () => {
            const result = transformFault(makeFaultInput({ status: 'UNKNOWN_STATUS' }));
            expect(result.status).toBe('active');
        });
    });

    it('includes occurrence metadata in parameters', () => {
        const result = transformFault(makeFaultInput({ occurrence_count: 5, last_occurred: 1700002000 }));
        expect(result.parameters?.occurrence_count).toBe(5);
        expect(result.parameters?.last_occurred).toBe(1700002000);
        expect(result.parameters?.reporting_sources).toEqual(['/powertrain/engine_monitor']);
    });
});

// =============================================================================
// transformFaultsResponse
// =============================================================================

describe('transformFaultsResponse', () => {
    const makeFaultItem = (overrides: Record<string, unknown> = {}) => ({
        fault_code: 'TEST_FAULT',
        description: 'A test fault',
        severity: 2,
        severity_label: 'error',
        status: 'CONFIRMED',
        first_occurred: 1700000000,
        reporting_sources: ['/test/node'],
        ...overrides,
    });

    it('returns an empty items array for empty response', () => {
        const result = transformFaultsResponse({ items: [] });
        expect(result.items).toEqual([]);
        expect(result.count).toBe(0);
    });

    it('transforms each fault item', () => {
        const result = transformFaultsResponse({ items: [makeFaultItem()] });
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.code).toBe('TEST_FAULT');
        expect(result.items[0]?.message).toBe('A test fault');
    });

    it('uses x-medkit count when provided', () => {
        const result = transformFaultsResponse({ items: [makeFaultItem()], 'x-medkit': { count: 42 } });
        expect(result.count).toBe(42);
    });

    it('falls back to items.length when x-medkit count is absent', () => {
        const result = transformFaultsResponse({ items: [makeFaultItem(), makeFaultItem()] });
        expect(result.count).toBe(2);
    });

    it('handles missing items array gracefully', () => {
        const result = transformFaultsResponse({});
        expect(result.items).toEqual([]);
        expect(result.count).toBe(0);
    });
});

// =============================================================================
// transformOperationsResponse
// =============================================================================

describe('transformOperationsResponse', () => {
    const makeRawOp = (overrides: Record<string, unknown> = {}) => ({
        id: 'calibrate',
        name: 'calibrate',
        'x-medkit': {
            ros2: {
                kind: 'service' as const,
                service: '/engine/calibrate',
                type: 'std_srvs/srv/Trigger',
            },
        },
        ...overrides,
    });

    it('extracts kind from x-medkit.ros2.kind', () => {
        const result = transformOperationsResponse({ items: [makeRawOp()] });
        expect(result[0]?.kind).toBe('service');
    });

    it('uses action kind when x-medkit.ros2.kind is action', () => {
        const raw = makeRawOp({ 'x-medkit': { ros2: { kind: 'action', action: '/engine/drive', type: 'pkg/Drive' } } });
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.kind).toBe('action');
    });

    it('infers action kind from asynchronous_execution flag when x-medkit kind absent', () => {
        const raw = { id: 'op', name: 'op', asynchronous_execution: true };
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.kind).toBe('action');
    });

    it('defaults to service kind when no explicit kind info', () => {
        const raw = { id: 'op', name: 'op' };
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.kind).toBe('service');
    });

    it('extracts path from ros2.service for service ops', () => {
        const result = transformOperationsResponse({ items: [makeRawOp()] });
        expect(result[0]?.path).toBe('/engine/calibrate');
    });

    it('extracts path from ros2.action for action ops', () => {
        const raw = makeRawOp({ 'x-medkit': { ros2: { kind: 'action', action: '/engine/drive', type: 'pkg/Drive' } } });
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.path).toBe('/engine/drive');
    });

    it('falls back path to /name when ros2 path absent', () => {
        const raw = { id: 'op', name: 'my_op' };
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.path).toBe('/my_op');
    });

    it('extracts type from x-medkit.ros2.type', () => {
        const result = transformOperationsResponse({ items: [makeRawOp()] });
        expect(result[0]?.type).toBe('std_srvs/srv/Trigger');
    });

    it('returns empty string for type when absent', () => {
        const raw = { id: 'op', name: 'op' };
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.type).toBe('');
    });

    it('returns empty array for empty response', () => {
        const result = transformOperationsResponse({ items: [] });
        expect(result).toEqual([]);
    });

    it('uses name as fallback when id is the only identifier', () => {
        const raw = { id: 'my_op', name: 'my_op' };
        const result = transformOperationsResponse({ items: [raw] });
        expect(result[0]?.name).toBe('my_op');
    });
});

// =============================================================================
// transformDataResponse
// =============================================================================

describe('transformDataResponse', () => {
    const makeDataItem = (overrides: Record<string, unknown> = {}) => ({
        id: '/engine/temperature',
        name: '/engine/temperature',
        'x-medkit': {
            ros2: {
                topic: '/engine/temperature',
                type: 'sensor_msgs/msg/Temperature',
                direction: 'publish',
            },
        },
        ...overrides,
    });

    it('extracts topic name from item name', () => {
        const result = transformDataResponse({ items: [makeDataItem()] });
        expect(result[0]?.topic).toBe('/engine/temperature');
    });

    it('falls back topic name to x-medkit.ros2.topic', () => {
        const raw = { id: 'tmp', 'x-medkit': { ros2: { topic: '/fallback/topic', type: 'std_msgs/msg/Float32' } } };
        const result = transformDataResponse({ items: [raw] });
        expect(result[0]?.topic).toBe('/fallback/topic');
    });

    it('falls back topic name to id when name and x-medkit topic absent', () => {
        const raw = { id: 'my_topic_id' };
        const result = transformDataResponse({ items: [raw] });
        expect(result[0]?.topic).toBe('my_topic_id');
    });

    it('extracts type from x-medkit.ros2.type', () => {
        const result = transformDataResponse({ items: [makeDataItem()] });
        expect(result[0]?.type).toBe('sensor_msgs/msg/Temperature');
    });

    it('sets status to metadata_only', () => {
        const result = transformDataResponse({ items: [makeDataItem()] });
        expect(result[0]?.status).toBe('metadata_only');
    });

    it('maps direction "publish" to isPublisher=true, isSubscriber=false', () => {
        const result = transformDataResponse({ items: [makeDataItem({ 'x-medkit': { ros2: { direction: 'publish' } } })] });
        expect(result[0]?.isPublisher).toBe(true);
        expect(result[0]?.isSubscriber).toBe(false);
    });

    it('maps direction "subscribe" to isPublisher=false, isSubscriber=true', () => {
        const raw = makeDataItem({ 'x-medkit': { ros2: { direction: 'subscribe' } } });
        const result = transformDataResponse({ items: [raw] });
        expect(result[0]?.isPublisher).toBe(false);
        expect(result[0]?.isSubscriber).toBe(true);
    });

    it('maps direction "both" to isPublisher=true, isSubscriber=true', () => {
        const raw = makeDataItem({ 'x-medkit': { ros2: { direction: 'both' } } });
        const result = transformDataResponse({ items: [raw] });
        expect(result[0]?.isPublisher).toBe(true);
        expect(result[0]?.isSubscriber).toBe(true);
    });

    it('uses topic:direction as uniqueKey when direction present', () => {
        const result = transformDataResponse({ items: [makeDataItem()] });
        expect(result[0]?.uniqueKey).toBe('/engine/temperature:publish');
    });

    it('uses topic as uniqueKey when direction absent', () => {
        const raw = { id: 'my_topic', name: 'my_topic' };
        const result = transformDataResponse({ items: [raw] });
        expect(result[0]?.uniqueKey).toBe('my_topic');
    });

    it('returns empty array for empty response', () => {
        const result = transformDataResponse({ items: [] });
        expect(result).toEqual([]);
    });
});

// =============================================================================
// transformConfigurationsResponse
// =============================================================================

describe('transformConfigurationsResponse', () => {
    const makeConfigResponse = (overrides: Record<string, unknown> = {}) => ({
        'x-medkit': {
            entity_id: 'engine-controller',
            ros2: { node: '/powertrain/engine_controller' },
            parameters: [
                { name: 'max_rpm', value: 8000, type: 'int' },
                { name: 'enabled', value: true, type: 'bool' },
            ],
        },
        ...overrides,
    });

    it('extracts component_id from x-medkit.entity_id', () => {
        const result = transformConfigurationsResponse(makeConfigResponse(), 'fallback-id');
        expect(result.component_id).toBe('engine-controller');
    });

    it('falls back component_id to entityId parameter', () => {
        const result = transformConfigurationsResponse({ 'x-medkit': {} }, 'fallback-id');
        expect(result.component_id).toBe('fallback-id');
    });

    it('extracts node_name from x-medkit.ros2.node', () => {
        const result = transformConfigurationsResponse(makeConfigResponse(), 'fallback-id');
        expect(result.node_name).toBe('/powertrain/engine_controller');
    });

    it('falls back node_name to entityId when ros2.node absent', () => {
        const result = transformConfigurationsResponse({ 'x-medkit': {} }, 'fallback-id');
        expect(result.node_name).toBe('fallback-id');
    });

    it('extracts parameters array', () => {
        const result = transformConfigurationsResponse(makeConfigResponse(), 'fallback-id');
        expect(result.parameters).toHaveLength(2);
        expect(result.parameters[0]?.name).toBe('max_rpm');
    });

    it('returns empty parameters array when absent', () => {
        const result = transformConfigurationsResponse({ 'x-medkit': {} }, 'fallback-id');
        expect(result.parameters).toEqual([]);
    });

    it('handles missing x-medkit entirely', () => {
        const result = transformConfigurationsResponse({}, 'fallback-id');
        expect(result.component_id).toBe('fallback-id');
        expect(result.node_name).toBe('fallback-id');
        expect(result.parameters).toEqual([]);
    });
});

// =============================================================================
// transformBulkDataDescriptor
// =============================================================================

describe('transformBulkDataDescriptor', () => {
    const makeRawDescriptor = (overrides: Record<string, unknown> = {}) => ({
        id: 'abc-123',
        name: 'rosbag_2026_03_22.mcap',
        content_type: 'application/x-mcap',
        size: 1024 * 1024,
        created_at: '2026-03-22T10:00:00Z',
        'x-medkit': {
            fault_code: 'ENGINE_OVERHEAT',
            duration_sec: 5.0,
            format: 'mcap',
        },
        ...overrides,
    });

    it('renames content_type to mimetype', () => {
        const result = transformBulkDataDescriptor(makeRawDescriptor());
        expect(result.mimetype).toBe('application/x-mcap');
        expect(result).not.toHaveProperty('content_type');
    });

    it('renames created_at to creation_date', () => {
        const result = transformBulkDataDescriptor(makeRawDescriptor());
        expect(result.creation_date).toBe('2026-03-22T10:00:00Z');
        expect(result).not.toHaveProperty('created_at');
    });

    it('preserves id, name, and size', () => {
        const result = transformBulkDataDescriptor(makeRawDescriptor());
        expect(result.id).toBe('abc-123');
        expect(result.name).toBe('rosbag_2026_03_22.mcap');
        expect(result.size).toBe(1024 * 1024);
    });

    it('preserves x-medkit extension fields', () => {
        const result = transformBulkDataDescriptor(makeRawDescriptor());
        expect(result['x-medkit']?.fault_code).toBe('ENGINE_OVERHEAT');
        expect(result['x-medkit']?.duration_sec).toBe(5.0);
        expect(result['x-medkit']?.format).toBe('mcap');
    });

    it('handles missing x-medkit gracefully', () => {
        const raw = makeRawDescriptor();
        delete (raw as Record<string, unknown>)['x-medkit'];
        const result = transformBulkDataDescriptor(raw);
        expect(result['x-medkit']).toBeUndefined();
    });

    it('handles missing content_type gracefully', () => {
        const raw = makeRawDescriptor();
        delete (raw as Record<string, unknown>)['content_type'];
        const result = transformBulkDataDescriptor(raw);
        expect(result.mimetype).toBe('');
    });

    it('handles missing created_at gracefully', () => {
        const raw = makeRawDescriptor();
        delete (raw as Record<string, unknown>)['created_at'];
        const result = transformBulkDataDescriptor(raw);
        expect(result.creation_date).toBe('');
    });
});
