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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetStatus = vi.fn();
const mockSetStatus = vi.fn();

vi.mock('@/lib/api-dispatch', () => ({
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    setStatus: (...args: unknown[]) => mockSetStatus(...args),
}));

// The component reads the typed client from the store; provide a sentinel.
const fakeClient = { __fake: true };

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: { client: unknown }) => unknown) => selector({ client: fakeClient })),
}));

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an openapi-fetch style result. */
function ok(status: number, data: unknown = undefined) {
    return { data, error: undefined, response: { status } as Response };
}

function errResult(status: number, message: string) {
    return { data: undefined, error: { message }, response: { status } as Response };
}

// Lazy import so mocks are wired before the module loads.
const { EntityStatusControl } = await import('./EntityStatusControl');

describe('EntityStatusControl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // getStatus is called on mount to refresh the live status.
        mockGetStatus.mockResolvedValue(ok(200, { status: 'ready' }));
        mockSetStatus.mockResolvedValue(ok(204));
    });

    it('renders the current status badge from the status prop', async () => {
        render(<EntityStatusControl entityType="apps" entityId="motor" status="ready" />);
        // Both the prop-seeded badge and the on-mount refresh should land on "ready".
        expect(await screen.findByText(/ready/i)).toBeInTheDocument();
    });

    it('renders an action button for each lifecycle action', () => {
        render(<EntityStatusControl entityType="apps" entityId="motor" status="ready" />);
        expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^restart$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /force restart/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^shutdown$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /force shutdown/i })).toBeInTheDocument();
    });

    it('calls setStatus with client, entityType, entityId and action on click', async () => {
        const user = userEvent.setup();
        render(<EntityStatusControl entityType="components" entityId="host-1" status="ready" />);

        await user.click(screen.getByRole('button', { name: /^restart$/i }));

        await waitFor(() => expect(mockSetStatus).toHaveBeenCalledTimes(1));
        const call = mockSetStatus.mock.calls[0]!;
        expect(call[0]).toBe(fakeClient);
        expect(call[1]).toBe('components');
        expect(call[2]).toBe('host-1');
        expect(call[3]).toBe('restart');
    });

    it('refreshes the status after a successful action', async () => {
        const user = userEvent.setup();
        mockGetStatus.mockResolvedValue(ok(200, { status: 'notReady' }));
        render(<EntityStatusControl entityType="apps" entityId="motor" status="ready" />);

        await user.click(screen.getByRole('button', { name: /^shutdown$/i }));

        // getStatus runs once on mount and once after the action.
        await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/notReady/i)).toBeInTheDocument();
    });

    it('surfaces a 501 from setStatus as a "not available" state and disables actions', async () => {
        const user = userEvent.setup();
        mockSetStatus.mockResolvedValue(errResult(501, 'Not Implemented'));
        render(<EntityStatusControl entityType="apps" entityId="motor" status="ready" />);

        await user.click(screen.getByRole('button', { name: /^start$/i }));

        expect(await screen.findByText(/not available/i)).toBeInTheDocument();
        // After "not available", action buttons are disabled.
        expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled();
    });

    it('shows a 501 not-available state when the on-mount status fetch returns 501', async () => {
        mockGetStatus.mockResolvedValue(errResult(501, 'Not Implemented'));
        render(<EntityStatusControl entityType="components" entityId="host-1" />);

        expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    });

    it('surfaces a non-501 error from setStatus inline and keeps actions enabled', async () => {
        const user = userEvent.setup();
        mockSetStatus.mockResolvedValue(errResult(400, 'invalid transition'));
        render(<EntityStatusControl entityType="apps" entityId="motor" status="ready" />);

        await user.click(screen.getByRole('button', { name: /^start$/i }));

        expect(await screen.findByText(/invalid transition/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^start$/i })).not.toBeDisabled();
    });
});
