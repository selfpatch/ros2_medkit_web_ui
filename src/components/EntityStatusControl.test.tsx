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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Mocks
//
// Status is read from the real store slice (statusByEntity), seeded per-test.
// Only setStatus (the transition dispatch) is mocked; the rest of api-dispatch
// stays real so the store module loads. fetchEntityStatus is seeded as a no-op
// vi.fn() in every test so the on-mount fetch does not overwrite the seeded
// status with 'unknown' against the fake client.
// ---------------------------------------------------------------------------

const mockSetStatus = vi.fn();

vi.mock('@/lib/api-dispatch', async (importActual) => {
    const actual = await importActual<typeof import('@/lib/api-dispatch')>();
    return {
        ...actual,
        setStatus: (...args: unknown[]) => mockSetStatus(...args),
    };
});

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'react-toastify';
import { useAppStore } from '@/lib/store';
import { EntityStatusControl } from './EntityStatusControl';

const fakeClient = { __fake: true } as never;

/**
 * Build an openapi-fetch style result. `ok` is derived from the status the same
 * way `Response.ok` is, because that is the field the control decides success
 * on - a double that omits it cannot tell a 204 from a 502.
 */
function ok(status: number, data: unknown = undefined) {
    return { data, error: undefined, response: httpResponse(status) };
}

function errResult(status: number, message: string) {
    return { data: undefined, error: { message }, response: httpResponse(status) };
}

/**
 * A non-2xx whose body openapi-fetch could not turn into an error value:
 * `{ error: undefined }` for 204/HEAD/`Content-Length: 0`, `''` for an empty
 * body with no `Content-Length` (openapi-fetch 0.17.0, src/index.js:245/268).
 */
function emptyBodyFailure(status: number, error: unknown = undefined) {
    return { data: undefined, error, response: httpResponse(status) };
}

function httpResponse(status: number): Response {
    return { status, ok: status >= 200 && status < 300 } as Response;
}

/**
 * Seed the store with a cached status and a no-op fetchEntityStatus, plus the
 * fake client used by setStatus dispatch.
 */
function seedStatus(key: string, value: string) {
    useAppStore.setState({
        statusByEntity: { [key]: value as never },
        fetchEntityStatus: vi.fn(),
        client: fakeClient,
    });
}

const renderControl = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe('EntityStatusControl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSetStatus.mockResolvedValue(ok(204));
        useAppStore.setState({
            statusByEntity: {},
            fetchEntityStatus: vi.fn(),
            client: fakeClient,
            actuationSupported: null,
        });
    });

    afterEach(() => {
        cleanup();
    });

    // -----------------------------------------------------------------------
    // Migrated baseline coverage (now driven by the store slice)
    // -----------------------------------------------------------------------

    it('renders the current status badge from the cached status', async () => {
        seedStatus('apps:motor', 'ready');
        renderControl(<EntityStatusControl entityType="apps" entityId="motor" />);
        expect(await screen.findByText(/^ready$/i)).toBeInTheDocument();
    });

    it('renders an action button for each lifecycle action', () => {
        seedStatus('apps:motor', 'ready');
        renderControl(<EntityStatusControl entityType="apps" entityId="motor" />);
        expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^restart$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /force restart/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^shutdown$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /force shutdown/i })).toBeInTheDocument();
    });

    it('calls setStatus with client, entityType, entityId and action on confirmed restart', async () => {
        const user = userEvent.setup();
        // ready leaves Restart enabled.
        seedStatus('components:host-1', 'ready');
        renderControl(<EntityStatusControl entityType="components" entityId="host-1" />);

        await user.click(screen.getByRole('button', { name: /^restart$/i }));
        await user.click(await screen.findByRole('button', { name: /confirm/i }));

        await waitFor(() => expect(mockSetStatus).toHaveBeenCalledTimes(1));
        const call = mockSetStatus.mock.calls[0]!;
        expect(call[0]).toBe(fakeClient);
        expect(call[1]).toBe('components');
        expect(call[2]).toBe('host-1');
        expect(call[3]).toBe('restart');
    });

    it('refreshes the status after a successful confirmed action', async () => {
        const user = userEvent.setup();
        const refresh = vi.fn();
        useAppStore.setState({
            statusByEntity: { 'apps:motor': 'ready' },
            fetchEntityStatus: refresh,
            client: fakeClient,
        });
        renderControl(<EntityStatusControl entityType="apps" entityId="motor" />);

        // Mount effect calls fetchEntityStatus once.
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole('button', { name: /^shutdown$/i }));
        await user.click(await screen.findByRole('button', { name: /confirm/i }));

        // The post-dispatch refresh calls fetchEntityStatus again.
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    });

    it('shows a disabled "not available" state when status is unavailable (501)', async () => {
        // The gateway 501 maps to the cached value 'unavailable' in the store.
        seedStatus('apps:motor', 'unavailable');
        renderControl(<EntityStatusControl entityType="apps" entityId="motor" />);

        expect(await screen.findByText(/not available/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^restart$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^shutdown$/i })).toBeDisabled();
    });

    it('shows the "not available" state when the cached status is unavailable for components', async () => {
        seedStatus('components:host-1', 'unavailable');
        renderControl(<EntityStatusControl entityType="components" entityId="host-1" />);
        expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    });

    it('surfaces a non-501 error from setStatus inline and keeps the action enabled', async () => {
        const user = userEvent.setup();
        mockSetStatus.mockResolvedValue(errResult(400, 'invalid transition'));
        // start is enabled when notReady and dispatches immediately.
        seedStatus('apps:motor', 'notReady');
        renderControl(<EntityStatusControl entityType="apps" entityId="motor" />);

        await user.click(screen.getByRole('button', { name: /^start$/i }));

        expect(await screen.findByText(/invalid transition/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^start$/i })).not.toBeDisabled();
    });

    // -----------------------------------------------------------------------
    // Task 2: gating by status (disable + tooltip)
    // -----------------------------------------------------------------------

    it('disables Start with a tooltip when status is ready', async () => {
        seedStatus('components:host1', 'ready');
        renderControl(<EntityStatusControl entityType="components" entityId="host1" />);
        expect(await screen.findByRole('button', { name: /^start$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^restart$/i })).toBeEnabled();
    });

    it('disables Restart/Shutdown when status is notReady, keeps Start enabled', async () => {
        seedStatus('apps:planner', 'notReady');
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);
        expect(await screen.findByRole('button', { name: /^start/i })).toBeEnabled();
        expect(screen.getByRole('button', { name: /^restart/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^shutdown/i })).toBeDisabled();
    });

    it('leaves Start as the only enabled action when status is notReady', async () => {
        // Every restart and shutdown variant interrupts a running entity, so on a
        // stopped one they are all unavailable - Force restart included.
        seedStatus('apps:planner', 'notReady');
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);
        expect(await screen.findByRole('button', { name: /^start$/i })).toBeEnabled();
        for (const name of [/^restart$/i, /force restart/i, /^shutdown$/i, /force shutdown/i]) {
            expect(screen.getByRole('button', { name })).toBeDisabled();
        }
    });

    // -----------------------------------------------------------------------
    // Task 3: confirmation dialog for non-Start actions
    // -----------------------------------------------------------------------

    it('Restart opens a confirm dialog and does not call setStatus until confirmed', async () => {
        const user = userEvent.setup();
        seedStatus('apps:planner', 'ready');
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        await user.click(screen.getByRole('button', { name: /^restart$/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(mockSetStatus).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: /confirm/i }));
        await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith(fakeClient, 'apps', 'planner', 'restart'));
    });

    it('Start dispatches immediately with no dialog', async () => {
        const user = userEvent.setup();
        seedStatus('apps:planner', 'notReady');
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        await user.click(screen.getByRole('button', { name: /^start$/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith(fakeClient, 'apps', 'planner', 'start'));
    });

    // -----------------------------------------------------------------------
    // Task B: response-driven transition feedback (replaces the 501 no-op)
    // -----------------------------------------------------------------------

    it('501 transition warns "not implemented" and sets actuationSupported false', async () => {
        seedStatus('apps:planner', 'notReady');
        useAppStore.setState({ actuationSupported: null });
        mockSetStatus.mockResolvedValue(errResult(501, 'no actuation provider'));
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        await userEvent.click(screen.getByRole('button', { name: /^start/i }));

        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(toast.error).not.toHaveBeenCalled();
        expect(useAppStore.getState().actuationSupported).toBe(false);
    });

    it('2xx transition reports success and sets actuationSupported true', async () => {
        seedStatus('apps:planner', 'notReady');
        useAppStore.setState({ actuationSupported: null });
        mockSetStatus.mockResolvedValue(ok(202));
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        await userEvent.click(screen.getByRole('button', { name: /^start/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(useAppStore.getState().actuationSupported).toBe(true);
    });

    it.each([
        ['undefined error (Content-Length: 0)', undefined],
        ['empty-string error (empty body, no Content-Length)', ''],
    ])('treats a 502 with an %s as a failure, not a success', async (_label, errorValue) => {
        seedStatus('apps:planner', 'notReady');
        useAppStore.setState({ actuationSupported: null });
        mockSetStatus.mockResolvedValue(emptyBodyFailure(502, errorValue));
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        await userEvent.click(screen.getByRole('button', { name: /^start/i }));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.success).not.toHaveBeenCalled();
        // A failed transition proves nothing about actuation support.
        expect(useAppStore.getState().actuationSupported).toBeNull();
        // The gateway said nothing usable, so the status has to carry the message.
        expect(await screen.findByRole('alert')).toHaveTextContent(/502/);
    });

    it('does not refetch the status after a failed transition', async () => {
        const refresh = vi.fn();
        useAppStore.setState({
            statusByEntity: { 'apps:planner': 'notReady' },
            fetchEntityStatus: refresh,
            client: fakeClient,
        });
        mockSetStatus.mockResolvedValue(emptyBodyFailure(503));
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

        await userEvent.click(screen.getByRole('button', { name: /^start/i }));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Task C: disable + "not implemented" note when actuationSupported === false
    // -----------------------------------------------------------------------

    it('disables all transition buttons and shows a note when actuation is unsupported', async () => {
        seedStatus('apps:planner', 'notReady');
        useAppStore.setState({ actuationSupported: false });
        renderControl(<EntityStatusControl entityType="apps" entityId="planner" />);

        expect(await screen.findByRole('button', { name: /^start/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^restart/i })).toBeDisabled();
        expect(screen.getByText(/not implemented by this gateway/i)).toBeInTheDocument();
    });
});
