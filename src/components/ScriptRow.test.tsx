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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScriptRow } from './ScriptRow';
import type { ScriptExecution, ScriptExecutionRecord, ScriptMetadata } from '@/lib/types';

// toast is used by the component but we don't need real notifications in tests.
vi.mock('react-toastify', () => ({
    toast: {
        error: vi.fn(),
    },
}));

const mockStartScriptExecutionAction = vi.fn();
const mockDeleteScript = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            startScriptExecutionAction: mockStartScriptExecutionAction,
            deleteScript: mockDeleteScript,
        })
    ),
}));

// ScriptRow only needs to know that ScriptExecutionCard renders somewhere - its
// own behaviour (Stop/Force kill/Remove/Refresh) is covered by ScriptExecutionCard.test.tsx.
vi.mock('@/components/ScriptExecutionCard', () => ({
    ScriptExecutionCard: ({ record }: { record: ScriptExecutionRecord }) => (
        <div data-testid={`execution-card-${record.execution.id}`}>{record.execution.status}</div>
    ),
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

function makeRecord(execution: Partial<ScriptExecution> & { id: string; status: string }): ScriptExecutionRecord {
    return {
        execution: execution as ScriptExecution,
        scriptId: 'diag',
        scriptName: 'Diagnostics',
        entityType: 'components',
        entityId: 'ecu',
    };
}

/**
 * The expander button's accessible name is computed from its content (script
 * name, "managed" badge, description), not overridden with aria-label, so it
 * is no longer just the script name verbatim. Testing Library's `name` option
 * matches a string exactly but a RegExp only needs to match somewhere in the
 * name - anchored to the start here since the script name is always first.
 */
function expanderName(name: string): RegExp {
    return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

async function expandRow(name: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: expanderName(name) }));
    return user;
}

describe('ScriptRow', () => {
    beforeEach(() => {
        mockStartScriptExecutionAction.mockReset().mockResolvedValue(undefined);
        mockDeleteScript.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the script name and description', () => {
        render(
            <ScriptRow
                script={makeScript()}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: expanderName('Diagnostics') })).toBeInTheDocument();
        expect(screen.getByText('Runs full diagnostics')).toBeInTheDocument();
    });

    it('exposes managed status in the accessible name and the description via aria-describedby', () => {
        render(
            <ScriptRow
                script={makeScript({ managed: true })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        // The name stays short (script name + "managed") rather than folding
        // in the free-text description, which would risk colliding with
        // other buttons' names (e.g. a description containing "Runs" would
        // otherwise substring-match a "Run" button) - the description is
        // still reachable through aria-describedby instead.
        const expander = screen.getByRole('button', { name: 'Diagnostics managed' });
        const describedBy = expander.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy as string)).toHaveTextContent('Runs full diagnostics');
    });

    it('renders one form field per schema property and sends the entered values as parameters', async () => {
        const script = makeScript({
            parameters_schema: { type: 'object', properties: { verbose: { type: 'boolean' } } },
        });
        render(
            <ScriptRow script={script} entityId="ecu" entityType="components" executions={[]} onDeleted={vi.fn()} />
        );

        const user = await expandRow('Diagnostics');
        expect(screen.getByText('verbose')).toBeInTheDocument();
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();

        await user.click(checkbox);
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => {
            expect(mockStartScriptExecutionAction).toHaveBeenCalledWith(
                'components',
                'ecu',
                expect.objectContaining({ id: 'diag' }),
                { execution_type: 'now', parameters: { verbose: true } }
            );
        });
    });

    it('falls back to the raw JSON textarea when the script has no parameters schema', async () => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        await expandRow('Diagnostics');
        expect(screen.getByRole('textbox')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('falls back to the raw JSON textarea for a schema without properties', async () => {
        // Conversion returns {type: 'object'} unchanged - an object without fields
        // shaped as SchemaFieldType. Feeding it to SchemaForm would throw inside
        // getSchemaDefaults, so this must take the textarea path instead.
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: { type: 'object' } })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        await expandRow('Diagnostics');
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('omits parameters when the raw JSON textarea is empty', async () => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => {
            expect(mockStartScriptExecutionAction).toHaveBeenCalledWith(
                'components',
                'ecu',
                expect.objectContaining({ id: 'diag' }),
                { execution_type: 'now' }
            );
        });
    });

    it('blocks Run and shows an inline error for invalid JSON', async () => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        // userEvent.type() parses "{"/"}" as special-key syntax, so set the raw
        // invalid text directly instead.
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '{not valid json' } });
        await user.click(screen.getByRole('button', { name: 'Run' }));

        expect(await screen.findByText(/Invalid JSON/i)).toBeInTheDocument();
        expect(mockStartScriptExecutionAction).not.toHaveBeenCalled();
    });

    it.each([
        ['[1,2]', 'an array'],
        ['"hello"', 'a string'],
        ['42', 'a number'],
        ['null', 'null'],
    ])('blocks Run and shows an inline error when the JSON parses to %s (%s)', async (raw) => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        fireEvent.change(screen.getByRole('textbox'), { target: { value: raw } });
        await user.click(screen.getByRole('button', { name: 'Run' }));

        expect(await screen.findByText(/must be a JSON object/i)).toBeInTheDocument();
        expect(mockStartScriptExecutionAction).not.toHaveBeenCalled();
    });

    it('keeps typed values while the row re-renders', async () => {
        const script = makeScript({
            parameters_schema: { type: 'object', properties: { verbose: { type: 'boolean' } } },
        });
        const { rerender } = render(
            <ScriptRow script={script} entityId="ecu" entityType="components" executions={[]} onDeleted={vi.fn()} />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('checkbox'));
        expect(screen.getByRole('checkbox')).toBeChecked();

        // Simulate the store's once-per-second poll writing a new executions array
        // while the user is mid-edit. The script reference itself is unchanged.
        rerender(
            <ScriptRow
                script={script}
                entityId="ecu"
                entityType="components"
                executions={[makeRecord({ id: 'exec_1', status: 'running' })]}
                onDeleted={vi.fn()}
            />
        );

        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('sends proximity_response only when the field is filled', async () => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null, proximity_proof_required: true })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.type(screen.getByLabelText('Proximity response'), 'abc123');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => {
            expect(mockStartScriptExecutionAction).toHaveBeenCalledWith(
                'components',
                'ecu',
                expect.objectContaining({ id: 'diag' }),
                { execution_type: 'now', proximity_response: 'abc123' }
            );
        });
    });

    it('does not render the proximity field when the script does not require it', async () => {
        render(
            <ScriptRow
                script={makeScript({ proximity_proof_required: false })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        await expandRow('Diagnostics');
        expect(screen.queryByLabelText('Proximity response')).not.toBeInTheDocument();
    });

    it('always sends execution_type "now"', async () => {
        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => {
            const [, , , request] = mockStartScriptExecutionAction.mock.calls[0] as [
                unknown,
                unknown,
                unknown,
                { execution_type: string },
            ];
            expect(request.execution_type).toBe('now');
        });
    });

    it('hides Delete for managed scripts', async () => {
        const { rerender } = render(
            <ScriptRow
                script={makeScript({ managed: false })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        await expandRow('Diagnostics');
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

        rerender(
            <ScriptRow
                script={makeScript({ managed: true })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('calls deleteScript and onDeleted when Delete succeeds and the confirmation is accepted', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onDeleted = vi.fn();
        render(
            <ScriptRow
                script={makeScript()}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={onDeleted}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(window.confirm).toHaveBeenCalled();
            expect(mockDeleteScript).toHaveBeenCalledWith('components', 'ecu', 'diag');
            expect(onDeleted).toHaveBeenCalled();
        });
    });

    it('does not call deleteScript when the confirmation is declined', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onDeleted = vi.fn();
        render(
            <ScriptRow
                script={makeScript()}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={onDeleted}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        expect(window.confirm).toHaveBeenCalled();
        expect(mockDeleteScript).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
    });

    it('disables Run while the request is in flight', async () => {
        let resolveStart: (() => void) | undefined;
        mockStartScriptExecutionAction.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveStart = resolve;
                })
        );

        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        const runButton = screen.getByRole('button', { name: 'Run' });
        await user.click(runButton);

        await waitFor(() => {
            expect(runButton).toBeDisabled();
        });

        resolveStart?.();
        await waitFor(() => {
            expect(runButton).not.toBeDisabled();
        });
    });

    it('keeps the execution card mounted after the row is collapsed', async () => {
        render(
            <ScriptRow
                script={makeScript()}
                entityId="ecu"
                entityType="components"
                executions={[makeRecord({ id: 'exec_1', status: 'running' })]}
                onDeleted={vi.fn()}
            />
        );

        expect(screen.getByTestId('execution-card-exec_1')).toBeInTheDocument();

        const user = await expandRow('Diagnostics');
        expect(screen.getByTestId('execution-card-exec_1')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: expanderName('Diagnostics') }));
        expect(screen.getByTestId('execution-card-exec_1')).toBeInTheDocument();
    });

    it('shows the gateway message when Run is rejected with 429', async () => {
        const { ScriptsApiError } = await import('@/lib/scripts');
        mockStartScriptExecutionAction.mockRejectedValueOnce(
            new ScriptsApiError('Too many concurrent scripts', 429, 'x-medkit-concurrency-limit')
        );
        const { toast } = await import('react-toastify');

        render(
            <ScriptRow
                script={makeScript({ parameters_schema: null })}
                entityId="ecu"
                entityType="components"
                executions={[]}
                onDeleted={vi.fn()}
            />
        );

        const user = await expandRow('Diagnostics');
        await user.click(screen.getByRole('button', { name: 'Run' }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Too many concurrent scripts');
        });
    });
});
