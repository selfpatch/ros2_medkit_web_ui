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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from './clipboard';

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const realExecCommand = document.execCommand;

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('copyText', () => {
    afterEach(() => {
        if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard);
        else delete (navigator as { clipboard?: unknown }).clipboard;
        document.execCommand = realExecCommand;
        vi.restoreAllMocks();
    });

    it('writes through the Clipboard API where the page may use it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText });
        document.execCommand = vi.fn(() => true);

        await expect(copyText('{"id":"engine"}')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('{"id":"engine"}');
        expect(document.execCommand).not.toHaveBeenCalled();
    });

    it('copies on a plain-http page, where there is no Clipboard API, through a selected text field', async () => {
        setClipboard(undefined);
        let copied = '';
        document.execCommand = vi.fn((command: string) => {
            copied = command === 'copy' ? ((document.activeElement as HTMLTextAreaElement | null)?.value ?? '') : '';
            return true;
        });

        await expect(copyText('{"id":"engine"}')).resolves.toBe(true);
        expect(copied).toBe('{"id":"engine"}');
        // The field is gone again
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('falls back when the Clipboard API refuses', async () => {
        setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
        document.execCommand = vi.fn(() => true);

        await expect(copyText('x')).resolves.toBe(true);
        expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('says so when nothing could copy', async () => {
        setClipboard(undefined);
        document.execCommand = vi.fn(() => false);
        await expect(copyText('x')).resolves.toBe(false);

        document.execCommand = vi.fn(() => {
            throw new Error('not supported');
        });
        await expect(copyText('x')).resolves.toBe(false);
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('gives focus back to where it was', async () => {
        setClipboard(undefined);
        document.execCommand = vi.fn(() => true);
        const button = document.createElement('button');
        document.body.appendChild(button);
        button.focus();

        await copyText('x');

        expect(document.activeElement).toBe(button);
        button.remove();
    });
});
