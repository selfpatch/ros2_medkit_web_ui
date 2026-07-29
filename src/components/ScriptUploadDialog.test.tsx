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
import { ScriptUploadDialog } from './ScriptUploadDialog';
import { templateFor } from '@/lib/script-language';

const mockUploadScript = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            uploadScript: mockUploadScript,
        })
    ),
}));

// CodeMirror uses contenteditable and measures layout, neither of which jsdom
// supports, so the lazily-loaded editor is replaced with a plain textarea
// that forwards the same value/onChange contract.
vi.mock('@/components/ScriptEditor', () => ({
    default: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
        <textarea
            data-testid="script-editor"
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

function makeFile(content: string[], name = 'script.sh'): File {
    return new File(content, name, { type: 'text/x-shellscript' });
}

describe('ScriptUploadDialog', () => {
    beforeEach(() => {
        mockUploadScript.mockReset().mockResolvedValue({ id: 'script-1' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('disables submit until a file is selected', async () => {
        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        const submit = screen.getByRole('button', { name: /^upload$/i });
        expect(submit).toBeDisabled();

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        expect(submit).not.toBeDisabled();
    });

    it('rejects a zero-byte file inline and does not call the store', async () => {
        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile([], 'empty.sh'));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        expect(await screen.findByText(/empty/i)).toBeInTheDocument();
        expect(mockUploadScript).not.toHaveBeenCalled();
    });

    it('omits the metadata argument when name and description are empty', async () => {
        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        await waitFor(() => {
            expect(mockUploadScript).toHaveBeenCalledWith('components', 'ecu', expect.any(File));
        });
    });

    it('passes name and description as metadata', async () => {
        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.type(screen.getByLabelText(/^name$/i), 'Diagnostics');
        await user.type(screen.getByLabelText(/^description$/i), 'Checks sensors');
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        await waitFor(() => {
            expect(mockUploadScript).toHaveBeenCalledWith('components', 'ecu', expect.any(File), {
                name: 'Diagnostics',
                description: 'Checks sensors',
            });
        });
    });

    it('disables submit while the upload is in flight and calls the store once', async () => {
        let resolveUpload: ((value: { id: string }) => void) | undefined;
        mockUploadScript.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveUpload = resolve;
                })
        );

        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        const submit = screen.getByRole('button', { name: /^upload$/i });
        await user.click(submit);

        await waitFor(() => {
            expect(submit).toBeDisabled();
        });
        expect(mockUploadScript).toHaveBeenCalledTimes(1);

        resolveUpload?.({ id: 'script-1' });
        await waitFor(() => {
            expect(submit).not.toBeDisabled();
        });
        expect(mockUploadScript).toHaveBeenCalledTimes(1);
    });

    it('keeps the dialog open and shows the gateway message on 413', async () => {
        const { ScriptsApiError } = await import('@/lib/scripts');
        mockUploadScript.mockRejectedValueOnce(new ScriptsApiError('Script exceeds the size limit', 413, ''));
        const onOpenChange = vi.fn();

        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={onOpenChange}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/script exceeds the size limit/i);
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('shows the gateway message when uploads are disabled', async () => {
        const { ScriptsApiError } = await import('@/lib/scripts');
        mockUploadScript.mockRejectedValueOnce(
            new ScriptsApiError('Script uploads are disabled', 400, 'invalid-request')
        );

        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/script uploads are disabled/i);
    });

    it('falls back to a default message when the error carries none', async () => {
        mockUploadScript.mockRejectedValueOnce(new Error());

        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/upload failed/i);
    });

    it('calls onUploaded and closes on success', async () => {
        const onUploaded = vi.fn();
        const onOpenChange = vi.fn();

        const user = userEvent.setup();
        render(
            <ScriptUploadDialog
                open
                onOpenChange={onOpenChange}
                entityId="ecu"
                entityType="components"
                onUploaded={onUploaded}
            />
        );

        await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));
        await user.click(screen.getByRole('button', { name: /^upload$/i }));

        await waitFor(() => {
            expect(onUploaded).toHaveBeenCalled();
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });

    it('opens in upload-file mode and behaves exactly as before', async () => {
        render(
            <ScriptUploadDialog
                open
                onOpenChange={vi.fn()}
                entityId="ecu"
                entityType="components"
                onUploaded={vi.fn()}
            />
        );

        expect(screen.getByLabelText(/^file$/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/file name/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('script-editor')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled();
    });

    describe('write mode', () => {
        async function openInWriteMode(): Promise<ReturnType<typeof userEvent.setup>> {
            const user = userEvent.setup();
            render(
                <ScriptUploadDialog
                    open
                    onOpenChange={vi.fn()}
                    entityId="ecu"
                    entityType="components"
                    onUploaded={vi.fn()}
                />
            );
            await user.click(screen.getByRole('button', { name: /write script/i }));
            return user;
        }

        it('shows the editor and the file name field in write mode', async () => {
            await openInWriteMode();

            expect(await screen.findByTestId('script-editor')).toBeInTheDocument();
            expect(screen.getByLabelText(/file name/i)).toBeInTheDocument();
            expect(screen.queryByLabelText(/^file$/i)).not.toBeInTheDocument();
        });

        it('gives the editor an accessible name so it is reachable as a textbox', async () => {
            await openInWriteMode();

            // Regression guard: the visible "Script" caption is not
            // htmlFor-associated (CodeMirror's contenteditable, not a native
            // form control, is what actually needs the name), so this must
            // come from the editor's own ariaLabel prop. "Script content"
            // rather than just "Script": that would be a substring of
            // "Description" ("de-script-ion") and collide with it.
            expect(await screen.findByRole('textbox', { name: 'Script content' })).toBe(
                screen.getByTestId('script-editor')
            );
        });

        it('inserts the bash template when entering write mode with an empty editor', async () => {
            await openInWriteMode();

            const editor = await screen.findByTestId('script-editor');
            await waitFor(() => {
                expect(editor).toHaveValue(templateFor(''));
            });
        });

        it('inserts the python template when the file name ends in .py', async () => {
            const user = await openInWriteMode();

            await user.type(screen.getByLabelText(/file name/i), 'check.py');

            const editor = await screen.findByTestId('script-editor');
            await waitFor(() => {
                expect(editor).toHaveValue(templateFor('check.py'));
            });
        });

        it('does not overwrite content the user already typed when the file name changes', async () => {
            const user = await openInWriteMode();

            const editor = await screen.findByTestId('script-editor');
            await user.clear(editor);
            await user.type(editor, 'echo custom-content');

            await user.type(screen.getByLabelText(/file name/i), 'check.py');

            expect(editor).toHaveValue('echo custom-content');
        });

        it('keeps submit disabled until both a file name and content are present', async () => {
            const user = await openInWriteMode();
            const editor = await screen.findByTestId('script-editor');

            const submit = screen.getByRole('button', { name: /^upload$/i });
            expect(submit).toBeDisabled();

            await user.type(screen.getByLabelText(/file name/i), 'check.sh');
            expect(submit).not.toBeDisabled();

            // The file name alone is not enough either: clearing the
            // auto-inserted template back down to zero length must re-disable
            // submit even though a valid file name is already in place.
            await user.clear(editor);
            expect(submit).toBeDisabled();
        });

        it('rejects whitespace-only content inline and does not call the store', async () => {
            const user = await openInWriteMode();
            await user.type(screen.getByLabelText(/file name/i), 'check.sh');

            const editor = await screen.findByTestId('script-editor');
            await user.clear(editor);
            await user.type(editor, '   ');

            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            expect(await screen.findByText(/content is empty/i)).toBeInTheDocument();
            expect(mockUploadScript).not.toHaveBeenCalled();
        });

        it('rejects a file name without an extension inline and does not call the store', async () => {
            const user = await openInWriteMode();
            await screen.findByTestId('script-editor');

            await user.type(screen.getByLabelText(/file name/i), 'checkscript');
            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            expect(await screen.findByRole('alert')).toHaveTextContent(/needs an extension/i);
            expect(mockUploadScript).not.toHaveBeenCalled();
        });

        it('rejects a path traversal file name inline and does not call the store', async () => {
            const user = await openInWriteMode();
            await screen.findByTestId('script-editor');

            await user.type(screen.getByLabelText(/file name/i), '../../etc/cron.d/evil.sh');
            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            expect(await screen.findByRole('alert')).toHaveTextContent(/plain file name/i);
            expect(mockUploadScript).not.toHaveBeenCalled();
        });

        it('rejects a name with a dot in an earlier path segment, since it has no real extension', async () => {
            // extensionOf must read the last path segment only: my.dir/check
            // has a dot before the separator but no extension on `check`
            // itself, so this must fail basename validation, not slip
            // through as if it had a usable extension.
            const user = await openInWriteMode();
            await screen.findByTestId('script-editor');

            await user.type(screen.getByLabelText(/file name/i), 'my.dir/check');
            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            expect(await screen.findByRole('alert')).toHaveTextContent(/plain file name/i);
            expect(mockUploadScript).not.toHaveBeenCalled();
        });

        it('clears the inline error as soon as the file name is edited', async () => {
            const user = await openInWriteMode();
            await screen.findByTestId('script-editor');
            const fileName = screen.getByLabelText(/file name/i);

            await user.type(fileName, 'checkscript');
            await user.click(screen.getByRole('button', { name: /^upload$/i }));
            expect(await screen.findByRole('alert')).toHaveTextContent(/needs an extension/i);

            // Still has no extension, so this could only pass if the error
            // clears on edit rather than on the next submit.
            await user.type(fileName, 'x');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('clears the inline error as soon as the editor content is edited', async () => {
            const user = await openInWriteMode();
            const editor = await screen.findByTestId('script-editor');
            await user.type(screen.getByLabelText(/file name/i), 'check.sh');

            await user.clear(editor);
            await user.type(editor, '   ');
            await user.click(screen.getByRole('button', { name: /^upload$/i }));
            expect(await screen.findByRole('alert')).toHaveTextContent(/content is empty/i);

            await user.type(editor, 'echo hi');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('uploads a File built from the typed content and file name', async () => {
            const user = await openInWriteMode();
            await user.type(screen.getByLabelText(/file name/i), 'my-check.sh');

            const editor = await screen.findByTestId('script-editor');
            await user.clear(editor);
            await user.type(editor, 'echo custom-content');

            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            await waitFor(() => {
                expect(mockUploadScript).toHaveBeenCalledTimes(1);
            });
            const call = mockUploadScript.mock.calls[0];
            if (!call) throw new Error('uploadScript was not called');
            const uploadedFile = call[2] as File;
            expect(uploadedFile.name).toBe('my-check.sh');
            await expect(uploadedFile.text()).resolves.toBe('echo custom-content');
        });

        it('trims surrounding whitespace from the file name before uploading', async () => {
            const user = await openInWriteMode();
            await user.type(screen.getByLabelText(/file name/i), '  my-check.sh  ');
            await screen.findByTestId('script-editor');

            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            await waitFor(() => {
                expect(mockUploadScript).toHaveBeenCalledTimes(1);
            });
            const call = mockUploadScript.mock.calls[0];
            if (!call) throw new Error('uploadScript was not called');
            const uploadedFile = call[2] as File;
            expect(uploadedFile.name).toBe('my-check.sh');
        });

        it('omits metadata when display name and description are empty', async () => {
            const user = await openInWriteMode();
            await user.type(screen.getByLabelText(/file name/i), 'my-check.sh');
            await screen.findByTestId('script-editor');

            await user.click(screen.getByRole('button', { name: /^upload$/i }));

            await waitFor(() => {
                expect(mockUploadScript).toHaveBeenCalledWith('components', 'ecu', expect.any(File));
            });
        });

        it('keeps display name and description when switching modes', async () => {
            const user = userEvent.setup();
            render(
                <ScriptUploadDialog
                    open
                    onOpenChange={vi.fn()}
                    entityId="ecu"
                    entityType="components"
                    onUploaded={vi.fn()}
                />
            );

            await user.type(screen.getByLabelText(/^name$/i), 'Diagnostics');
            await user.type(screen.getByLabelText(/^description$/i), 'Checks sensors');

            await user.click(screen.getByRole('button', { name: /write script/i }));
            expect(screen.getByLabelText(/^name$/i)).toHaveValue('Diagnostics');
            expect(screen.getByLabelText(/^description$/i)).toHaveValue('Checks sensors');

            await user.click(screen.getByRole('button', { name: /from file/i }));
            expect(screen.getByLabelText(/^name$/i)).toHaveValue('Diagnostics');
            expect(screen.getByLabelText(/^description$/i)).toHaveValue('Checks sensors');
        });
    });

    describe('dismissing with unsaved write-mode content', () => {
        async function openInWriteModeWith(
            onOpenChange: (open: boolean) => void
        ): Promise<ReturnType<typeof userEvent.setup>> {
            const user = userEvent.setup();
            render(
                <ScriptUploadDialog
                    open
                    onOpenChange={onOpenChange}
                    entityId="ecu"
                    entityType="components"
                    onUploaded={vi.fn()}
                />
            );
            await user.click(screen.getByRole('button', { name: /write script/i }));
            return user;
        }

        async function typeCustomContent(): Promise<{
            user: ReturnType<typeof userEvent.setup>;
            editor: HTMLElement;
        }> {
            const user = userEvent.setup();
            const editor = await screen.findByTestId('script-editor');
            await user.clear(editor);
            await user.type(editor, 'echo custom-content');
            return { user, editor };
        }

        it('keeps the dialog open on Escape when the user declines to discard typed content', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const onOpenChange = vi.fn();
            const user = await openInWriteModeWith(onOpenChange);
            const { editor } = await typeCustomContent();

            await user.keyboard('{Escape}');

            expect(confirmSpy).toHaveBeenCalled();
            expect(onOpenChange).not.toHaveBeenCalledWith(false);
            expect(editor).toHaveValue('echo custom-content');
        });

        it('closes on Escape once the user confirms discarding typed content', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onOpenChange = vi.fn();
            const user = await openInWriteModeWith(onOpenChange);
            await typeCustomContent();

            await user.keyboard('{Escape}');

            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('closes on Escape without prompting while the editor still holds only the auto-inserted template', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm');
            const onOpenChange = vi.fn();
            const user = await openInWriteModeWith(onOpenChange);
            await screen.findByTestId('script-editor');

            await user.keyboard('{Escape}');

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('prompts before discarding when Cancel is clicked with typed content, and stays open when declined', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const onOpenChange = vi.fn();
            const user = await openInWriteModeWith(onOpenChange);
            await typeCustomContent();

            await user.click(screen.getByRole('button', { name: /^cancel$/i }));

            expect(confirmSpy).toHaveBeenCalled();
            expect(onOpenChange).not.toHaveBeenCalledWith(false);
        });

        it('does not prompt when Cancel is clicked in upload-file mode with a file selected', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm');
            const onOpenChange = vi.fn();
            const user = userEvent.setup();
            render(
                <ScriptUploadDialog
                    open
                    onOpenChange={onOpenChange}
                    entityId="ecu"
                    entityType="components"
                    onUploaded={vi.fn()}
                />
            );
            await user.upload(screen.getByLabelText(/^file$/i), makeFile(['#!/bin/sh\necho hi']));

            await user.click(screen.getByRole('button', { name: /^cancel$/i }));

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });
});
