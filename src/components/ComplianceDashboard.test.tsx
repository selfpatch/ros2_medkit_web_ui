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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComplianceTimeline, ComplianceTimelineResult } from '@/lib/compliance-api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStoreState = { serverUrl: 'http://localhost:8080' as string | null, isConnected: true };

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState)),
}));

const mockFetchComplianceTimeline = vi.fn();

class MockComplianceApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ComplianceApiError';
        this.status = status;
    }
}

vi.mock('@/lib/compliance-api', () => ({
    fetchComplianceTimeline: (...args: unknown[]) => mockFetchComplianceTimeline(...args),
    ComplianceApiError: MockComplianceApiError,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTimeline(overrides: Partial<ComplianceTimeline> = {}): ComplianceTimeline {
    return {
        schema_version: 1,
        generated_at_ns: 1_700_000_000_000_000_000,
        record_count: 1,
        chain_algorithm: 'sha256',
        genesis_hash: '0'.repeat(64),
        chain_head: 'deadbeef'.repeat(8),
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
                freeze_frame: { battery_pct: { data: 42 } },
                prev_hash: '0'.repeat(64),
                record_hash: 'cafe'.repeat(16),
            },
        ],
        ...overrides,
    };
}

function makeResult(overrides: Partial<ComplianceTimeline> = {}): ComplianceTimelineResult {
    const timeline = makeTimeline(overrides);
    return { timeline, raw: JSON.stringify(timeline) };
}

// Lazy import so the mocks above are registered before the module loads.
const { ComplianceDashboard } = await import('./ComplianceDashboard');

describe('ComplianceDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockStoreState.serverUrl = 'http://localhost:8080';
        mockStoreState.isConnected = true;
    });

    it('shows a not-connected notice when disconnected', () => {
        mockStoreState.isConnected = false;
        render(<ComplianceDashboard />);
        expect(screen.getByText(/not connected/i)).toBeInTheDocument();
        expect(mockFetchComplianceTimeline).not.toHaveBeenCalled();
    });

    it('renders the chain head, algorithm badge and record count', async () => {
        mockFetchComplianceTimeline.mockResolvedValue(makeResult());
        render(<ComplianceDashboard />);

        expect(await screen.findByText('deadbeef'.repeat(8))).toBeInTheDocument();
        expect(screen.getByText('sha256')).toBeInTheDocument();
        expect(screen.getByText(/1 record/i)).toBeInTheDocument();
    });

    it('renders a row per confirmed-fault record', async () => {
        mockFetchComplianceTimeline.mockResolvedValue(makeResult());
        render(<ComplianceDashboard />);

        expect(await screen.findByText('NAV2_ABORT')).toBeInTheDocument();
        expect(screen.getByText('Navigation aborted')).toBeInTheDocument();
        expect(screen.getByText('ERROR')).toBeInTheDocument();
    });

    it('reveals the prev/record hashes when a row is expanded', async () => {
        const user = userEvent.setup();
        mockFetchComplianceTimeline.mockResolvedValue(makeResult());
        render(<ComplianceDashboard />);

        await user.click(await screen.findByText('NAV2_ABORT'));

        expect(await screen.findByText('cafe'.repeat(16))).toBeInTheDocument();
        expect(screen.getByText('Hash chain')).toBeInTheDocument();
    });

    it('shows the Export button for the admin (Pro) tier', async () => {
        // default role is admin (no localStorage override)
        mockFetchComplianceTimeline.mockResolvedValue(makeResult());
        render(<ComplianceDashboard />);

        await screen.findByText('NAV2_ABORT');
        expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('hides the Export button for the viewer tier', async () => {
        localStorage.setItem('medkit_user_role', 'viewer');
        mockFetchComplianceTimeline.mockResolvedValue(makeResult());
        render(<ComplianceDashboard />);

        await screen.findByText('NAV2_ABORT');
        expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    });

    it('shows an empty state when the timeline has no records', async () => {
        mockFetchComplianceTimeline.mockResolvedValue(makeResult({ record_count: 0, records: [] }));
        render(<ComplianceDashboard />);

        expect(await screen.findByText(/no confirmed faults recorded/i)).toBeInTheDocument();
    });

    it('degrades to a calm not-available notice when the endpoint is absent (404)', async () => {
        mockFetchComplianceTimeline.mockRejectedValue(new MockComplianceApiError('not found', 404));
        render(<ComplianceDashboard />);

        expect(await screen.findByText(/compliance timeline not available/i)).toBeInTheDocument();
        // Not the scary error card.
        expect(screen.queryByText(/failed to load compliance timeline/i)).not.toBeInTheDocument();
    });

    it('degrades cleanly when the feature is not implemented (501)', async () => {
        mockFetchComplianceTimeline.mockRejectedValue(new MockComplianceApiError('not implemented', 501));
        render(<ComplianceDashboard />);

        expect(await screen.findByText(/compliance timeline not available/i)).toBeInTheDocument();
    });

    it('shows an error card for unexpected failures', async () => {
        mockFetchComplianceTimeline.mockRejectedValue(new MockComplianceApiError('boom', 500));
        render(<ComplianceDashboard />);

        expect(await screen.findByText(/failed to load compliance timeline/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    });
});
