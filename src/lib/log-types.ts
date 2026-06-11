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
 * Log types for the gateway /logs API, refined from the generated 0.5.0 schema.
 *
 * The OpenAPI schema types logs more loosely than the gateway actually emits:
 * `severity` is a bare `string`, and `context`/configuration fields are
 * nullable and optional. The types below are anchored to
 * `components['schemas']` (so schema drift surfaces at compile time) and
 * tightened to the runtime guarantees the UI relies on: a known severity set,
 * an always-present logger context, and required configuration fields.
 *
 * Source of truth: gateway `log_manager.cpp::entry_to_json`.
 */

import type { components } from '@selfpatch/ros2-medkit-client-ts';

type Schemas = components['schemas'];

/** Severity levels the gateway emits (the schema types this as a bare `string`). */
export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/** Logger context; the gateway always populates `node`. */
export type LogContext = Schemas['LogContext'];

/** A single log entry, with `severity` narrowed and `context` always present. */
export type LogEntry = Omit<Schemas['LogEntry'], 'severity' | 'context'> & {
    severity: LogSeverity;
    context: LogContext;
};

/** Aggregation provenance attached to multi-source log collections. */
export type XMedkitAggregation = NonNullable<Schemas['LogEntryList']['x-medkit']>;

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

/**
 * Log configuration. The schema marks both fields optional and nullable; the
 * UI treats a configured severity filter and entry cap as required.
 */
export interface LogsConfiguration {
    severity_filter: LogSeverity;
    max_entries: number;
}

export interface LogsQueryParams {
    severity?: LogSeverity;
    context?: string;
}
