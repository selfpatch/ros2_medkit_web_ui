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
import { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScriptsPanel } from './ScriptsPanel';
import type { ScriptExecution, ScriptExecutionRecord, ScriptMetadata, ScriptsFetchResult } from '@/lib/types';

const mockFetchEntityScripts = vi.fn();

const mockState: {
    fetchEntityScripts: typeof mockFetchEntityScripts;
    scriptExecutions: Map<string, ScriptExecutionRecord[]>;
} = {
    fetchEntityScripts: mockFetchEntityScripts,
    scriptExecutions: new Map(),
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: typeof mockState) => unknown) => selector(mockState)),
}));

// The row's own behaviour (form, run, delete) is covered by ScriptRow.test.tsx.
// Here we only need to know what props ScriptsPanel hands it.
vi.mock('@/components/ScriptRow', () => ({
    ScriptRow: ({
        script,
        entityId,
        entityType,
        executions,
        onDeleted,
    }: {
        script: ScriptMetadata;
        entityId: string;
        entityType: string;
        executions: ScriptExecutionRecord[];
        onDeleted: () => void;
    }) => (
        <div data-testid={`script-row-${script.id}`}>
            <span data-testid={`script-row-meta-${script.id}`}>
                {`${entityType}:${entityId}:${executions.map((r) => r.execution.id).join(',')}`}
            </span>
            <button onClick={onDeleted}>{`delete-${script.id}`}</button>
        </div>
    ),
}));

// The dialog's own behaviour (form, validation, submit) is covered by
// ScriptUploadDialog.test.tsx. Here we only need to trigger onUploaded.
vi.mock('@/components/ScriptUploadDialog', () => ({
    ScriptUploadDialog: ({ open, onUploaded }: { open: boolean; onUploaded: () => void }) =>
        open ? (
            <div data-testid="upload-dialog">
                <button onClick={onUploaded}>trigger-uploaded</button>
            </div>
        ) : null,
}));

function makeScript(overrides: Partial<ScriptMetadata> = {}): ScriptMetadata {
    return {
        id: 'diag',
        name: 'Diagnostics',
        description: 'Runs full diagnostics',
        managed: false,
        proximity_proof_required: false,
        parameters_schema: null,
        ...overrides,
    };
}

function makeRecord(id: string, scriptId: string): ScriptExecutionRecord {
    return {
        execution: { id, status: 'running' } as ScriptExecution,
        scriptId,
        scriptName: scriptId,
        entityType: 'components',
        entityId: 'ecu',
    };
}

describe('ScriptsPanel', () => {
    beforeEach(() => {
        mockFetchEntityScripts.mockReset();
        mockState.scriptExecutions = new Map();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders one row per script', async () => {
        mockFetchEntityScripts.mockResolvedValue({
            items: [makeScript({ id: 'a' }), makeScript({ id: 'b', name: 'Beta' })],
        } satisfies ScriptsFetchResult);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByTestId('script-row-a')).toBeInTheDocument();
            expect(screen.getByTestId('script-row-b')).toBeInTheDocument();
        });
    });

    it('shows the empty state when the gateway returns no scripts', async () => {
        mockFetchEntityScripts.mockResolvedValue({ items: [] } satisfies ScriptsFetchResult);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        expect(await screen.findByText(/No scripts available for this entity/i)).toBeInTheDocument();
    });

    it('shows the backend-not-configured state on errorStatus 501', async () => {
        mockFetchEntityScripts.mockResolvedValue({ items: [], errorStatus: 501 } satisfies ScriptsFetchResult);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        expect(await screen.findByText(/Scripts are not configured on this gateway/i)).toBeInTheDocument();
    });

    it('shows a generic error state on errorStatus 500', async () => {
        mockFetchEntityScripts.mockResolvedValue({ items: [], errorStatus: 500 } satisfies ScriptsFetchResult);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        expect(await screen.findByText(/Failed to load scripts/i)).toBeInTheDocument();
    });

    it('shows the generic error state on errorStatus -1', async () => {
        mockFetchEntityScripts.mockResolvedValue({ items: [], errorStatus: -1 } satisfies ScriptsFetchResult);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        expect(await screen.findByText(/Failed to load scripts/i)).toBeInTheDocument();
    });

    it('aborts the in-flight list request when the entity changes', async () => {
        const abortedSignals: AbortSignal[] = [];
        mockFetchEntityScripts.mockImplementation((_et: string, _id: string, signal: AbortSignal) => {
            abortedSignals.push(signal);
            return new Promise<ScriptsFetchResult>((resolve) => {
                signal.addEventListener('abort', () => resolve({ items: [] }));
            });
        });

        const { rerender } = render(<ScriptsPanel entityId="ecu" entityType="components" />);
        await waitFor(() => {
            expect(abortedSignals).toHaveLength(1);
        });

        rerender(<ScriptsPanel entityId="motor" entityType="apps" />);
        await waitFor(() => {
            expect(abortedSignals).toHaveLength(2);
        });

        expect(abortedSignals[0]?.aborted).toBe(true);
    });

    it('does not render the previous entity scripts when a stale response resolves late', async () => {
        let resolveFirst: (value: ScriptsFetchResult) => void = () => {};
        mockFetchEntityScripts.mockImplementationOnce(
            () =>
                new Promise<ScriptsFetchResult>((resolve) => {
                    resolveFirst = resolve;
                })
        );

        const { rerender } = render(<ScriptsPanel entityId="ecu" entityType="components" />);
        await waitFor(() => {
            expect(mockFetchEntityScripts).toHaveBeenCalledTimes(1);
        });

        mockFetchEntityScripts.mockResolvedValueOnce({ items: [makeScript({ id: 'new-script' })] });
        rerender(<ScriptsPanel entityId="motor" entityType="apps" />);
        await waitFor(() => {
            expect(screen.getByTestId('script-row-new-script')).toBeInTheDocument();
        });

        // Resolve the stale (now-aborted) first request with a different script.
        await act(async () => {
            resolveFirst({ items: [makeScript({ id: 'stale-script' })] });
            await Promise.resolve();
        });

        expect(screen.queryByTestId('script-row-stale-script')).not.toBeInTheDocument();
        expect(screen.getByTestId('script-row-new-script')).toBeInTheDocument();
    });

    it('swallows the AbortError without an unhandled rejection', async () => {
        mockFetchEntityScripts.mockImplementation(
            (_et: string, _id: string, signal: AbortSignal) =>
                new Promise<ScriptsFetchResult>((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        const err = new Error('aborted');
                        err.name = 'AbortError';
                        reject(err);
                    });
                })
        );

        const { rerender, unmount } = render(<ScriptsPanel entityId="ecu" entityType="components" />);
        await waitFor(() => {
            expect(mockFetchEntityScripts).toHaveBeenCalledTimes(1);
        });

        rerender(<ScriptsPanel entityId="motor" entityType="apps" />);
        await waitFor(() => {
            expect(mockFetchEntityScripts).toHaveBeenCalledTimes(2);
        });

        // Unmounting aborts the still-pending second request too. If the
        // component does not catch AbortError, this leaves an unhandled
        // rejection that vitest reports as a failure for this test.
        unmount();
        await act(async () => {
            await Promise.resolve();
        });
    });

    it('reloads the list after a successful upload', async () => {
        mockFetchEntityScripts
            .mockResolvedValueOnce({ items: [] })
            .mockResolvedValueOnce({ items: [makeScript({ id: 'new' })] });

        render(<ScriptsPanel entityId="ecu" entityType="components" />);
        expect(await screen.findByText(/No scripts available for this entity/i)).toBeInTheDocument();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: /upload/i }));
        await user.click(screen.getByText('trigger-uploaded'));

        await waitFor(() => {
            expect(screen.getByTestId('script-row-new')).toBeInTheDocument();
        });
        expect(mockFetchEntityScripts).toHaveBeenCalledTimes(2);
    });

    it('reloads the list after a script is deleted', async () => {
        mockFetchEntityScripts
            .mockResolvedValueOnce({ items: [makeScript({ id: 'a' })] })
            .mockResolvedValueOnce({ items: [makeScript({ id: 'b' })] });

        render(<ScriptsPanel entityId="ecu" entityType="components" />);
        await waitFor(() => {
            expect(screen.getByTestId('script-row-a')).toBeInTheDocument();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('delete-a'));

        await waitFor(() => {
            expect(screen.getByTestId('script-row-b')).toBeInTheDocument();
        });
        expect(mockFetchEntityScripts).toHaveBeenCalledTimes(2);
    });

    it('passes the entity type through for apps and for components', async () => {
        mockFetchEntityScripts.mockResolvedValue({ items: [makeScript({ id: 'a' })] });

        const { rerender } = render(<ScriptsPanel entityId="ecu" entityType="components" />);
        await waitFor(() => {
            expect(screen.getByTestId('script-row-meta-a')).toHaveTextContent('components:ecu:');
        });

        rerender(<ScriptsPanel entityId="motor" entityType="apps" />);
        await waitFor(() => {
            expect(screen.getByTestId('script-row-meta-a')).toHaveTextContent('apps:motor:');
        });
    });

    it('passes only the executions of the matching script to each row', async () => {
        mockFetchEntityScripts.mockResolvedValue({
            items: [makeScript({ id: 'a' }), makeScript({ id: 'b' })],
        });
        mockState.scriptExecutions = new Map([
            ['components/ecu', [makeRecord('exec_a', 'a'), makeRecord('exec_b', 'b')]],
        ]);

        render(<ScriptsPanel entityId="ecu" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByTestId('script-row-meta-a')).toHaveTextContent('components:ecu:exec_a');
            expect(screen.getByTestId('script-row-meta-b')).toHaveTextContent('components:ecu:exec_b');
        });
    });
});
