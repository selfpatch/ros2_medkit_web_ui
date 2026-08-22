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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScriptExecutionCard } from './ScriptExecutionCard';
import type { ScriptExecution, ScriptExecutionRecord } from '@/lib/types';

// toast is used by the component but we don't need real notifications in tests.
vi.mock('react-toastify', () => ({
    toast: {
        error: vi.fn(),
    },
}));

const mockStopScriptExecution = vi.fn();
const mockRemoveScriptExecution = vi.fn();
const mockRefreshScriptExecution = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            stopScriptExecution: mockStopScriptExecution,
            removeScriptExecution: mockRemoveScriptExecution,
            refreshScriptExecution: mockRefreshScriptExecution,
        })
    ),
}));

function makeRecord(execution: Partial<ScriptExecution> & { id: string; status: string }): ScriptExecutionRecord {
    return {
        execution: execution as ScriptExecution,
        scriptId: 'diag',
        scriptName: 'Diagnostics',
        entityType: 'components',
        entityId: 'ecu',
    };
}

describe('ScriptExecutionCard', () => {
    beforeEach(() => {
        mockStopScriptExecution.mockReset().mockResolvedValue(undefined);
        mockRemoveScriptExecution.mockReset().mockResolvedValue(undefined);
        mockRefreshScriptExecution.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the raw status as the badge text', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);

        expect(screen.getByTestId('execution-status')).toHaveTextContent('running');
        expect(screen.getByTestId('execution-status')).toHaveAttribute('data-tone', 'neutral');
    });

    it('announces status changes via a live region', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);

        // role="status" is an implicit polite live region: a screen-reader
        // user who moved elsewhere still hears "completed" once it changes.
        expect(screen.getByTestId('execution-status')).toHaveAttribute('role', 'status');
    });

    it('does not pulse the badge for a lost record even though its last known status was running', () => {
        const record = { ...makeRecord({ id: 'exec_1', status: 'running' }), lost: true };
        render(<ScriptExecutionCard record={record} />);

        expect(screen.getByTestId('execution-status')).not.toHaveClass('animate-pulse');
    });

    it('sends action "stop" when Stop is clicked', async () => {
        const user = userEvent.setup();
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);

        await user.click(screen.getByRole('button', { name: 'Stop' }));

        await waitFor(() => {
            expect(mockStopScriptExecution).toHaveBeenCalledWith('components', 'ecu', 'diag', 'exec_1', 'stop');
        });
    });

    it('sends action "forced_termination" when Force kill is clicked', async () => {
        const user = userEvent.setup();
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);

        await user.click(screen.getByRole('button', { name: 'Force kill' }));

        await waitFor(() => {
            expect(mockStopScriptExecution).toHaveBeenCalledWith(
                'components',
                'ecu',
                'diag',
                'exec_1',
                'forced_termination'
            );
        });
    });

    it('hides Stop and Force kill for terminal statuses', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'completed' })} />);

        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Force kill' })).not.toBeInTheDocument();
    });

    it('shows Remove only for terminal statuses', () => {
        const { rerender } = render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);
        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();

        rerender(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'completed' })} />);
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('renders the progress bar at 0 percent', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running', progress: 0 })} />);

        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '0');
    });

    it('hides the progress bar when progress is null', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running', progress: null })} />);

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('renders stdout-only output as plain text', () => {
        render(
            <ScriptExecutionCard
                record={makeRecord({ id: 'exec_1', status: 'completed', parameters: { stdout: 'hi' } })}
            />
        );

        expect(screen.getByText('hi')).toBeInTheDocument();
    });

    it('renders output as JSON when stdout appears with other keys', () => {
        render(
            <ScriptExecutionCard
                record={makeRecord({
                    id: 'exec_1',
                    status: 'completed',
                    parameters: { stdout: 'hi', exit_code: 0 },
                })}
            />
        );

        expect(screen.getByText(/"stdout"/)).toBeInTheDocument();
        expect(screen.getByText(/"exit_code"/)).toBeInTheDocument();
    });

    it('renders no result area when parameters is null', () => {
        const { container } = render(
            <ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'completed', parameters: null })} />
        );

        expect(container.querySelector('pre')).not.toBeInTheDocument();
    });

    it('renders the error message and exit code for a failed execution', () => {
        render(
            <ScriptExecutionCard
                record={makeRecord({
                    id: 'exec_1',
                    status: 'failed',
                    error: { message: 'boom', exit_code: 3 },
                })}
            />
        );

        expect(screen.getByTestId('execution-status')).toHaveAttribute('data-tone', 'error');
        expect(screen.getByText(/boom/)).toBeInTheDocument();
        expect(screen.getByText(/exit code 3/)).toBeInTheDocument();
    });

    it('renders a terminated execution as stopped without an exit code', () => {
        render(
            <ScriptExecutionCard
                record={makeRecord({
                    id: 'exec_1',
                    status: 'terminated',
                    error: { message: 'Execution stopped by user' },
                })}
            />
        );

        expect(screen.getByTestId('execution-status')).toHaveAttribute('data-tone', 'stopped');
        expect(screen.getByText(/Execution stopped by user/)).toBeInTheDocument();
        expect(screen.queryByText(/exit code/i)).not.toBeInTheDocument();
    });

    it('renders an unknown status neutrally and still offers Refresh', () => {
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'weird' })} />);

        expect(screen.getByTestId('execution-status')).toHaveAttribute('data-tone', 'neutral');
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('keeps showing the result of a lost record and still offers Remove', () => {
        const record = {
            ...makeRecord({ id: 'exec_1', status: 'running', parameters: { stdout: 'partial output' } }),
            lost: true,
        };
        render(<ScriptExecutionCard record={record} />);

        expect(screen.getByText('partial output')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    });

    it('offers Refresh for a lost record', () => {
        const record = { ...makeRecord({ id: 'exec_1', status: 'running' }), lost: true };
        render(<ScriptExecutionCard record={record} />);

        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('schedules no timers of its own', () => {
        vi.useFakeTimers();
        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);

        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });

    it('shows the gateway message when Stop is rejected with 409', async () => {
        const { ScriptsApiError } = await import('@/lib/scripts');
        mockStopScriptExecution.mockRejectedValueOnce(
            new ScriptsApiError('Script is already running', 409, 'x-medkit-script-running')
        );
        const { toast } = await import('react-toastify');
        const user = userEvent.setup();

        render(<ScriptExecutionCard record={makeRecord({ id: 'exec_1', status: 'running' })} />);
        await user.click(screen.getByRole('button', { name: 'Stop' }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Script is already running');
        });
    });
});
