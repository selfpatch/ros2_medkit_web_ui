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
import { fetchComplianceTimeline, ComplianceApiError, type ComplianceTimeline } from './compliance-api';

const BASE = 'http://localhost:8080/api/v1';

const SAMPLE: ComplianceTimeline = {
    schema_version: 1,
    generated_at_ns: 1_700_000_000_000_000_000,
    record_count: 1,
    chain_algorithm: 'sha256',
    genesis_hash: '0'.repeat(64),
    chain_head: 'a'.repeat(64),
    records: [
        {
            seq: 1,
            fault_code: 'NAV2_ABORT',
            severity: 3,
            severity_label: 'ERROR',
            description: 'Navigation aborted',
            reporting_sources: ['nav2'],
            status: 'confirmed',
            occurred_at_ns: 1_700_000_000_000_000_000,
            confirmed_at_ns: 1_700_000_000_500_000_000,
            last_occurred_at_ns: 1_700_000_000_500_000_000,
            cleared: false,
            freeze_frame: { battery: { data: 42 } },
            prev_hash: '0'.repeat(64),
            record_hash: 'a'.repeat(64),
        },
    ],
};

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('fetchComplianceTimeline', () => {
    it('returns parsed timeline plus raw body on success', async () => {
        const raw = JSON.stringify(SAMPLE);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(raw, { status: 200 }));

        const result = await fetchComplianceTimeline(BASE);

        expect(result.timeline).toEqual(SAMPLE);
        expect(result.raw).toBe(raw);
        expect(fetch).toHaveBeenCalledWith(`${BASE}/compliance/timeline`, { signal: undefined });
    });

    it('preserves the raw body byte-for-byte (does not re-serialize)', async () => {
        // A >2^53 nanosecond timestamp would be corrupted by JSON round-tripping;
        // the raw string must survive untouched for tamper evidence.
        const raw = '{"chain_head":"a","records":[],"big_ts":9007199254740993}';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(raw, { status: 200 }));

        const result = await fetchComplianceTimeline(BASE);

        expect(result.raw).toBe(raw);
    });

    it('passes the AbortSignal through to fetch', async () => {
        const controller = new AbortController();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(SAMPLE), { status: 200 }));

        await fetchComplianceTimeline(BASE, controller.signal);

        expect(fetch).toHaveBeenCalledWith(`${BASE}/compliance/timeline`, { signal: controller.signal });
    });

    it('throws ComplianceApiError with status 404 when the endpoint is absent', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
        );

        // Single call: a Response body can only be read once, so assert on one
        // settled rejection rather than invoking the mock twice.
        const rejected = fetchComplianceTimeline(BASE);
        await expect(rejected).rejects.toBeInstanceOf(ComplianceApiError);
        await expect(rejected).rejects.toMatchObject({ status: 404, message: 'not found' });
    });

    it('throws ComplianceApiError with status 501 when the feature is not implemented', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ message: 'not implemented' }), { status: 501 })
        );

        await expect(fetchComplianceTimeline(BASE)).rejects.toMatchObject({ status: 501 });
    });

    it('falls back to an HTTP status message when the error body is not JSON', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('gateway error', { status: 502 }));

        await expect(fetchComplianceTimeline(BASE)).rejects.toMatchObject({
            status: 502,
            message: 'HTTP 502',
        });
    });
});
