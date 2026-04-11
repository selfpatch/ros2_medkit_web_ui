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
 * Local TypeScript interfaces mirroring the gateway /logs JSON shape.
 *
 * These are defined explicitly rather than derived from the generated
 * `components['schemas']` re-export because the published
 * @selfpatch/ros2-medkit-client-ts@0.1.1 package is missing
 * `generated/schema.js`, which silently degrades those generated types
 * to `any` (masked by `skipLibCheck: true`).
 *
 * Reference: gateway `log_manager.cpp::entry_to_json` for the source of truth.
 */

export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface LogContext {
    /** Logger FQN without leading slash, e.g. "powertrain/engine/temp_sensor" */
    node: string;
    function?: string;
    file?: string;
    line?: number;
}

export interface LogEntry {
    /** Server-assigned monotonic ID, e.g. "log_123" */
    id: string;
    /** ISO 8601 UTC with nanosecond precision */
    timestamp: string;
    severity: LogSeverity;
    message: string;
    context: LogContext;
}

export interface XMedkitAggregation {
    entity_id?: string;
    aggregation_level?: 'function' | 'area';
    aggregated?: boolean;
    aggregation_sources?: string[];
    /** Function-level aggregation: number of hosted apps contributing logs */
    host_count?: number;
    /** Area-level aggregation: number of components in the area */
    component_count?: number;
    /** Area-level aggregation: number of apps aggregated across all components */
    app_count?: number;
}

export interface LogCollection {
    items: LogEntry[];
    'x-medkit'?: XMedkitAggregation;
}

/**
 * Result of a fetchEntityLogs call. On network or HTTP errors, `items` is
 * empty and `errorStatus` carries the HTTP status code (or -1 for
 * transport-level failures). Callers use `errorStatus === 503` to render
 * the "Logs not available on this gateway" state, distinct from a zero-entry
 * successful response.
 */
export interface LogsFetchResult {
    items: LogEntry[];
    'x-medkit'?: XMedkitAggregation;
    errorStatus?: number;
}

export interface LogsConfiguration {
    severity_filter: LogSeverity;
    max_entries: number;
}

export interface LogsQueryParams {
    severity?: LogSeverity;
    context?: string;
}
