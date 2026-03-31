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
 * Response transformation functions for the SOVD gateway API.
 *
 * These are standalone pure functions extracted from SovdApiClient so that
 * they can be reused with any HTTP client (hand-written or generated).
 */

import type {
    BulkDataDescriptor,
    ComponentConfigurations,
    ComponentTopic,
    Fault,
    FaultSeverity,
    FaultStatusValue,
    ListFaultsResponse,
    Operation,
    OperationKind,
    Parameter,
} from './types';
import { convertJsonSchemaToTopicSchema } from './schema-utils';

// =============================================================================
// unwrapItems
// =============================================================================

/**
 * Unwrap SOVD list responses.
 *
 * The gateway returns either a bare array (legacy) or an `{items: [...]}` wrapper.
 * Returns an empty array for any falsy or missing input.
 */
export function unwrapItems<T>(response: unknown): T[] {
    if (Array.isArray(response)) {
        return response as T[];
    }
    const wrapped = response as { items?: T[] } | null | undefined;
    return wrapped?.items ?? [];
}

// =============================================================================
// transformFault
// =============================================================================

/**
 * Raw fault item shape returned by the gateway faults endpoints.
 */
export interface RawFaultItem {
    fault_code: string;
    description: string;
    severity: number;
    severity_label: string;
    status: string;
    first_occurred: number;
    last_occurred?: number;
    occurrence_count?: number;
    reporting_sources?: string[];
}

/**
 * Transform a single raw gateway fault item into the frontend `Fault` type.
 *
 * Field renames:
 *   - `fault_code`   → `code`
 *   - `description`  → `message`
 *   - `severity` (number) + `severity_label` → `severity` (string)
 *   - `status` (CONFIRMED / PREFAILED / ...) → `status` (active / pending / cleared / healed)
 *   - `first_occurred` (unix seconds) → `timestamp` (ISO 8601)
 *   - `reporting_sources[0]` last path segment → `entity_id` (underscores replaced by hyphens)
 */
export function transformFault(apiFault: RawFaultItem): Fault {
    // Map severity number/label to FaultSeverity.
    // Label check takes priority over numeric value; critical is checked first.
    let severity: FaultSeverity = 'info';
    const label = apiFault.severity_label?.toLowerCase() || '';
    if (label === 'critical' || apiFault.severity >= 3) {
        severity = 'critical';
    } else if (label === 'error' || apiFault.severity === 2) {
        severity = 'error';
    } else if (label === 'warn' || label === 'warning' || apiFault.severity === 1) {
        severity = 'warning';
    }

    // Map API status string to FaultStatusValue.
    let status: FaultStatusValue = 'active';
    const apiStatus = apiFault.status?.toLowerCase() || '';
    if (apiStatus === 'confirmed' || apiStatus === 'active') {
        status = 'active';
    } else if (apiStatus === 'pending' || apiStatus === 'prefailed') {
        status = 'pending';
    } else if (apiStatus === 'cleared' || apiStatus === 'resolved') {
        status = 'cleared';
    } else if (apiStatus === 'healed' || apiStatus === 'prepassed') {
        status = 'healed';
    }

    // Extract entity info from reporting_sources.
    // reporting_sources contains ROS 2 node paths like "/bridge/diagnostic_bridge".
    // We take the last segment and convert underscores to hyphens to match
    // the SOVD app ID convention (e.g., "diagnostic_bridge" → "diagnostic-bridge").
    const source = apiFault.reporting_sources?.[0] || '';
    const nodeName = source.split('/').pop() || 'unknown';
    const entity_id = nodeName.replace(/_/g, '-');

    return {
        code: apiFault.fault_code,
        message: apiFault.description,
        severity,
        status,
        timestamp: new Date(apiFault.first_occurred * 1000).toISOString(),
        entity_id,
        entity_type: 'app',
        parameters: {
            occurrence_count: apiFault.occurrence_count,
            last_occurred: apiFault.last_occurred,
            reporting_sources: apiFault.reporting_sources,
        },
    };
}

// =============================================================================
// transformFaultsResponse
// =============================================================================

/**
 * Raw shape of the faults list endpoint response.
 */
interface RawFaultsResponse {
    items?: unknown[];
    'x-medkit'?: { count?: number };
}

/**
 * Transform the raw gateway faults list response into `ListFaultsResponse`.
 */
export function transformFaultsResponse(rawData: unknown): ListFaultsResponse {
    const data = rawData as RawFaultsResponse;
    const items = (data.items || []).map((f) => transformFault(f as RawFaultItem));
    return { items, count: data['x-medkit']?.count ?? items.length };
}

// =============================================================================
// transformOperationsResponse
// =============================================================================

/**
 * Raw operation item shape from the gateway operations endpoint.
 */
interface RawOperation {
    id: string;
    name: string;
    asynchronous_execution?: boolean;
    'x-medkit'?: {
        entity_id?: string;
        ros2?: {
            kind?: 'service' | 'action';
            service?: string;
            action?: string;
            type?: string;
        };
        type_info?: {
            request?: unknown;
            response?: unknown;
            goal?: unknown;
            result?: unknown;
            feedback?: unknown;
        };
    };
}

/**
 * Transform the raw operations list response into `Operation[]`.
 *
 * Extracts `kind`, `path`, and `type` from the `x-medkit` vendor extension.
 */
export function transformOperationsResponse(rawData: unknown): Operation[] {
    const rawOps = unwrapItems<RawOperation>(rawData);
    return rawOps.map((op) => {
        const xMedkit = op['x-medkit'];
        const ros2Info = xMedkit?.ros2;
        const rawTypeInfo = xMedkit?.type_info;

        // Determine kind from x-medkit.ros2.kind or from asynchronous_execution flag.
        let kind: OperationKind = 'service';
        if (ros2Info?.kind) {
            kind = ros2Info.kind;
        } else if (op.asynchronous_execution) {
            kind = 'action';
        }

        // Build type_info with the appropriate schema structure for the kind.
        let typeInfo: Operation['type_info'] | undefined;
        if (rawTypeInfo) {
            if (kind === 'service' && (rawTypeInfo.request || rawTypeInfo.response)) {
                typeInfo = {
                    schema: {
                        request:
                            (rawTypeInfo.request ? convertJsonSchemaToTopicSchema(rawTypeInfo.request) : undefined) ??
                            {},
                        response:
                            (rawTypeInfo.response ? convertJsonSchemaToTopicSchema(rawTypeInfo.response) : undefined) ??
                            {},
                    },
                };
            } else if (kind === 'action' && (rawTypeInfo.goal || rawTypeInfo.result)) {
                typeInfo = {
                    schema: {
                        goal: (rawTypeInfo.goal ? convertJsonSchemaToTopicSchema(rawTypeInfo.goal) : undefined) ?? {},
                        result:
                            (rawTypeInfo.result ? convertJsonSchemaToTopicSchema(rawTypeInfo.result) : undefined) ?? {},
                        feedback:
                            (rawTypeInfo.feedback ? convertJsonSchemaToTopicSchema(rawTypeInfo.feedback) : undefined) ??
                            {},
                    },
                };
            }
        }

        return {
            name: op.name || op.id,
            path: ros2Info?.service || ros2Info?.action || `/${op.name}`,
            type: ros2Info?.type || '',
            kind,
            type_info: typeInfo,
        };
    });
}

// =============================================================================
// transformDataResponse
// =============================================================================

/**
 * Raw data item shape from the gateway data endpoint.
 */
interface RawDataItem {
    id: string;
    name?: string;
    category?: string;
    'x-medkit'?: {
        ros2?: { topic?: string; type?: string; direction?: string };
        type_info?: { schema?: unknown; default_value?: unknown };
    };
}

/**
 * Transform the raw data list response into `ComponentTopic[]`.
 *
 * Extracts topic metadata (type, direction, schema) from the `x-medkit` extension.
 */
export function transformDataResponse(rawData: unknown): ComponentTopic[] {
    const dataItems = unwrapItems<RawDataItem>(rawData);
    return dataItems.map((item) => {
        const rawTypeInfo = item['x-medkit']?.type_info;
        const convertedSchema = rawTypeInfo?.schema ? convertJsonSchemaToTopicSchema(rawTypeInfo.schema) : undefined;
        const direction = item['x-medkit']?.ros2?.direction;
        const topicName = item.name || item['x-medkit']?.ros2?.topic || item.id;
        return {
            topic: topicName,
            timestamp: Date.now() * 1000000,
            data: null,
            status: 'metadata_only' as const,
            type: item['x-medkit']?.ros2?.type,
            type_info: convertedSchema
                ? {
                      schema: convertedSchema,
                      default_value: rawTypeInfo?.default_value as Record<string, unknown>,
                  }
                : undefined,
            // Direction-based fields for apps/functions.
            isPublisher: direction === 'publish' || direction === 'both',
            isSubscriber: direction === 'subscribe' || direction === 'both',
            uniqueKey: direction ? `${topicName}:${direction}` : topicName,
        };
    });
}

// =============================================================================
// transformConfigurationsResponse
// =============================================================================

/**
 * Raw configurations response shape from the gateway.
 */
interface RawConfigurationsResponse {
    'x-medkit'?: {
        entity_id?: string;
        ros2?: { node?: string };
        parameters?: Parameter[];
    };
}

/**
 * Transform the raw configurations response into `ComponentConfigurations`.
 *
 * All meaningful data lives in the `x-medkit` extension. The `entityId` parameter
 * is used as a fallback when `x-medkit` fields are absent.
 */
export function transformConfigurationsResponse(rawData: unknown, entityId: string): ComponentConfigurations {
    const data = rawData as RawConfigurationsResponse;
    const xMedkit = data['x-medkit'] || {};
    return {
        component_id: xMedkit.entity_id || entityId,
        node_name: xMedkit.ros2?.node || entityId,
        parameters: xMedkit.parameters || [],
    };
}

// =============================================================================
// transformBulkDataDescriptor
// =============================================================================

/**
 * Raw bulk-data descriptor shape as returned by the gateway.
 * The SOVD spec uses `content_type` and `created_at`; the frontend type uses
 * `mimetype` and `creation_date`.
 */
interface RawBulkDataDescriptor {
    id: string;
    name: string;
    content_type?: string;
    size: number;
    created_at?: string;
    'x-medkit'?: {
        fault_code: string;
        duration_sec: number;
        format: string;
    };
}

/**
 * Transform a raw gateway bulk-data descriptor into `BulkDataDescriptor`.
 *
 * Field renames:
 *   - `content_type` → `mimetype`
 *   - `created_at`   → `creation_date`
 */
export function transformBulkDataDescriptor(raw: unknown): BulkDataDescriptor {
    const r = raw as RawBulkDataDescriptor;
    return {
        id: r.id,
        name: r.name,
        mimetype: r.content_type ?? '',
        size: r.size,
        creation_date: r.created_at ?? '',
        'x-medkit': r['x-medkit'],
    };
}
