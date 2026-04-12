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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseUpdatesPollingResult } from '@/hooks/useUpdatesPolling';
import type { UpdateEntry } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseUpdatesPolling = vi.fn<() => UseUpdatesPollingResult>();

vi.mock('@/hooks/useUpdatesPolling', () => ({
    useUpdatesPolling: () => mockUseUpdatesPolling(),
}));

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: { serverUrl: string; isConnected: boolean }) => unknown) =>
        selector({
            serverUrl: 'http://localhost:8080',
            isConnected: true,
        })
    ),
}));

// toast is used by the component but we don't need real notifications in tests
vi.mock('react-toastify', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const mockTriggerPrepare = vi.fn();
const mockDeleteUpdate = vi.fn();

vi.mock('@/lib/updates-api', () => ({
    triggerPrepare: (...args: unknown[]) => mockTriggerPrepare(...args),
    triggerExecute: vi.fn(),
    triggerAutomated: vi.fn(),
    deleteUpdate: (...args: unknown[]) => mockDeleteUpdate(...args),
    UpdatesApiError: class extends Error {
        readonly status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
        }
    },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<UseUpdatesPollingResult> = {}): UseUpdatesPollingResult {
    return {
        updates: [],
        isLoading: false,
        error: null,
        notAvailable: false,
        refresh: vi.fn(),
        effectiveInterval: 5000,
        ...overrides,
    };
}

function makeEntry(
    id: string,
    statusValue: 'pending' | 'inProgress' | 'completed' | 'failed' = 'pending'
): UpdateEntry {
    return {
        id,
        status: { status: statusValue },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Lazy import to ensure mocks are set up before the module is loaded
const { UpdatesDashboard } = await import('./UpdatesDashboard');

describe('UpdatesDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading state initially', () => {
        mockUseUpdatesPolling.mockReturnValue(makeResult({ isLoading: true, updates: [] }));

        render(<UpdatesDashboard />);

        expect(screen.getByText(/loading updates/i)).toBeInTheDocument();
    });

    it('shows empty state when no updates', () => {
        mockUseUpdatesPolling.mockReturnValue(makeResult({ isLoading: false, updates: [] }));

        render(<UpdatesDashboard />);

        expect(screen.getByText(/no software updates/i)).toBeInTheDocument();
    });

    it('shows not available state on 501', () => {
        mockUseUpdatesPolling.mockReturnValue(makeResult({ notAvailable: true }));

        render(<UpdatesDashboard />);

        expect(screen.getByText(/not available/i)).toBeInTheDocument();
    });

    it('renders grid of UpdateCards', () => {
        const updates = [makeEntry('firmware-v2.1.0'), makeEntry('kernel-patch-42')];
        mockUseUpdatesPolling.mockReturnValue(makeResult({ updates }));

        render(<UpdatesDashboard />);

        expect(screen.getByText('firmware-v2.1.0')).toBeInTheDocument();
        expect(screen.getByText('kernel-patch-42')).toBeInTheDocument();
    });

    it('shows correct summary counts', () => {
        const updates = [
            makeEntry('update-1', 'pending'),
            makeEntry('update-2', 'inProgress'),
            makeEntry('update-3', 'failed'),
        ];
        mockUseUpdatesPolling.mockReturnValue(makeResult({ updates }));

        render(<UpdatesDashboard />);

        expect(screen.getByText(/2 active/i)).toBeInTheDocument();
        expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    });

    it('refresh button triggers refetch', async () => {
        const user = userEvent.setup();
        const refresh = vi.fn();
        mockUseUpdatesPolling.mockReturnValue(makeResult({ refresh }));

        render(<UpdatesDashboard />);

        const refreshButton = screen.getByRole('button', { name: /refresh updates/i });
        await user.click(refreshButton);

        expect(refresh).toHaveBeenCalledOnce();
    });

    it('shows error state with error message', () => {
        mockUseUpdatesPolling.mockReturnValue(makeResult({ error: 'Network timeout' }));

        render(<UpdatesDashboard />);

        expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
    });

    it('shows toast on successful action', async () => {
        const user = userEvent.setup();
        const refresh = vi.fn();
        mockTriggerPrepare.mockResolvedValue(undefined);
        mockUseUpdatesPolling.mockReturnValue(makeResult({ updates: [makeEntry('fw-v2', 'pending')], refresh }));
        const { toast } = await import('react-toastify');

        render(<UpdatesDashboard />);

        const prepareBtn = screen.getByRole('button', { name: /prepare/i });
        await user.click(prepareBtn);

        expect(mockTriggerPrepare).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('shows toast on failed action', async () => {
        const user = userEvent.setup();
        mockTriggerPrepare.mockRejectedValue(new Error('Update in progress'));
        mockUseUpdatesPolling.mockReturnValue(makeResult({ updates: [makeEntry('fw-v2', 'pending')] }));
        const { toast } = await import('react-toastify');

        render(<UpdatesDashboard />);

        const prepareBtn = screen.getByRole('button', { name: /prepare/i });
        await user.click(prepareBtn);

        expect(toast.error).toHaveBeenCalled();
    });
});
