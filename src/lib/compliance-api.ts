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
 * Client for the tamper-evident compliance / NIS2 timeline endpoints.
 *
 * Mirrors the raw-fetch pattern used by updates-api.ts. `baseUrl` is the
 * normalized gateway base (already ends with /api/v1), so the resource path
 * is appended directly.
 */

/** Severity labels emitted by the gateway (uint8 0..4). */
export type ComplianceSeverityLabel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'UNKNOWN';

/** A single freeze-frame sample captured when the fault was confirmed. */
export interface ComplianceFreezeFrameValue {
    data: unknown;
}

/** One confirmed-fault record in the hash-chained audit timeline. */
export interface ComplianceRecord {
    seq: number;
    fault_code: string;
    severity: number;
    severity_label: string;
    description: string;
    reporting_sources: string[];
    status: string;
    occurred_at_ns: number;
    confirmed_at_ns: number | null;
    last_occurred_at_ns: number;
    cleared: boolean;
    freeze_frame: Record<string, ComplianceFreezeFrameValue> | null;
    prev_hash: string;
    record_hash: string;
}

/** Full compliance timeline document returned by the gateway. */
export interface ComplianceTimeline {
    schema_version: number;
    generated_at_ns: number;
    record_count: number;
    chain_algorithm: string;
    genesis_hash: string;
    chain_head: string;
    records: ComplianceRecord[];
}

/** Parsed timeline plus the raw response body. */
export interface ComplianceTimelineResult {
    timeline: ComplianceTimeline;
    /**
     * Untouched response text. Used for Export so the int64 nanosecond
     * timestamps and the hash chain survive byte-for-byte. Re-serializing the
     * parsed object would round the >2^53 timestamps and break tamper evidence.
     */
    raw: string;
}

/** Error thrown by compliance API helpers, carrying the HTTP status. */
export class ComplianceApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ComplianceApiError';
        this.status = status;
    }
}

async function ensureOk(res: Response): Promise<void> {
    if (res.ok) return;
    let message = `HTTP ${res.status}`;
    try {
        const body = await res.json();
        if (body.message) message = body.message;
    } catch {
        // ignore parse errors
    }
    throw new ComplianceApiError(message, res.status);
}

/** GET /compliance/timeline - the tamper-evident confirmed-fault timeline. */
export async function fetchComplianceTimeline(
    baseUrl: string,
    signal?: AbortSignal
): Promise<ComplianceTimelineResult> {
    const res = await fetch(`${baseUrl}/compliance/timeline`, { signal });
    await ensureOk(res);
    const raw = await res.text();
    const timeline = JSON.parse(raw) as ComplianceTimeline;
    return { timeline, raw };
}
