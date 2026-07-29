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

import { expect, type Dialog, type Page } from '@playwright/test';

/**
 * Clicks the (already-visible, uniquely-matched) Delete button for
 * `scriptName` and accepts the native `confirm()` dialog that ScriptRow's
 * handleDelete requires before it calls deleteScript.
 *
 * The listener is registered before the click and accepts inline as soon as
 * the dialog opens, rather than after awaiting the click: `window.confirm`
 * blocks the page's JS (and, with it, the click action itself) until the
 * dialog is resolved, so anything that awaits the click before calling
 * `dialog.accept()` would deadlock - the click can never settle first.
 *
 * Asserts the dialog actually appeared, with the expected message, instead
 * of accepting whatever dialog (if any) shows up - a bare accept-everything
 * handler would still pass the day someone removes the confirmation guard by
 * accident.
 */
export async function clickDeleteAndConfirm(page: Page, scriptName: string): Promise<void> {
    let seenDialog: Dialog | undefined;
    page.once('dialog', async (dialog) => {
        seenDialog = dialog;
        await dialog.accept();
    });

    await page.getByRole('button', { name: 'Delete' }).click();

    expect(seenDialog?.type()).toBe('confirm');
    expect(seenDialog?.message()).toBe(`Delete script "${scriptName}"? This cannot be undone.`);
}
