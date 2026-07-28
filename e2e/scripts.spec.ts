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

import path from 'node:path';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

async function openScripts(page: Page, entity: 'Test ECU' | 'Talker'): Promise<void> {
    await page.goto('/');
    if (entity === 'Talker') {
        // Talker only appears in the tree once its parent component has been
        // selected and its children have loaded, so it must be expanded first.
        await page.getByText('Test ECU').click();
        await page.getByText('Talker').waitFor({ state: 'visible', timeout: 30_000 });
    }
    await page.getByText(entity).click();
    await page.getByRole('button', { name: /scripts/i }).click();
}

/**
 * A stable, unique-per-worker upload name. `testInfo` (rather than the
 * module-scope `test.info()`, which throws outside a running test) is what
 * lets the afterEach hook below compute the exact same name the upload test
 * used, since both run in the same worker with the same repeat index.
 */
function uploadedNameFor(testInfo: TestInfo): string {
    return `uploaded_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
}

function writtenNameFor(testInfo: TestInfo, language: 'bash' | 'python'): string {
    return `written_${language}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
}

test.afterEach(async ({ page }, testInfo) => {
    // Uploads persist in the gateway's volume between runs, so any script left
    // over from this test (including a previous, unfinished run of it) must be
    // removed - otherwise the next run would find a duplicate row and a
    // getByRole('button', { name: uploadedName }) lookup would no longer be unique.
    await openScripts(page, 'Test ECU');
    const names = [uploadedNameFor(testInfo), writtenNameFor(testInfo, 'bash'), writtenNameFor(testInfo, 'python')];
    for (const name of names) {
        const row = page.getByRole('button', { name });
        if (await row.isVisible().catch(() => false)) {
            await row.click();
            await page.getByRole('button', { name: 'Delete' }).click();
            await expect(row).toBeHidden({ timeout: 30_000 });
        }
    }
});

/**
 * CodeMirror's editable region is a `contenteditable` div, not a form
 * control, so it has to be driven with real key events rather than a
 * Locator.fill() - select-all, delete, then type the new content, the same
 * sequence a person at the keyboard would use to replace the starter
 * template. Takes the resolved editable locator rather than looking it up
 * itself, so callers can choose how they reach it (by test id or, in one
 * scenario below, by role and accessible name).
 */
async function writeInEditor(editable: Locator, content: string): Promise<void> {
    await editable.click();
    await editable.press('ControlOrMeta+a');
    await editable.press('Delete');
    await editable.pressSequentially(content);
}

test('lists manifest scripts and marks them managed', async ({ page }) => {
    await openScripts(page, 'Test ECU');
    for (const name of ['Hello', 'Failing', 'Sleeper']) {
        const row = page.getByRole('button', { name });
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row).toContainText('managed');
    }
});

test('runs a script and shows the parameters it received on stdin', async ({ page }) => {
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Hello' }).click();
    // Sending parameters is what makes the gateway open the stdin pipe at all;
    // hello.sh echoes whatever JSON it reads back on stdout.
    await page.getByPlaceholder('{}').fill('{"greeting":"e2e-hello"}');
    await page.getByRole('button', { name: 'Run' }).click();

    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('completed', { timeout: 30_000 });
    await expect(status).toHaveAttribute('data-tone', 'ok');
    await expect(page.locator('pre')).toContainText('"greeting":"e2e-hello"');
});

test('shows exit code and stderr for a failing script', async ({ page }) => {
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Failing' }).click();
    await page.getByRole('button', { name: 'Run' }).click();

    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('failed', { timeout: 30_000 });
    await expect(status).toHaveAttribute('data-tone', 'error');
    // The gateway discards stdout on a non-zero exit: only the stderr message
    // and the exit code are ever available to assert on.
    await expect(page.getByText(/sensor unreachable/)).toBeVisible();
    await expect(page.getByText(/exit code 3/)).toBeVisible();
});

test('stops a running script and reports it as stopped, not failed', async ({ page }) => {
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Sleeper' }).click();
    await page.getByRole('button', { name: 'Run' }).click();
    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('running', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(status).toHaveText('terminated', { timeout: 30_000 });
    // A successful stop must render as stopped, never as an error tone.
    await expect(status).toHaveAttribute('data-tone', 'stopped');
});

test('uploads, runs and deletes a script', async ({ page }, testInfo) => {
    const uploadedName = uploadedNameFor(testInfo);
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Upload' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('File').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'uploaded-script.sh'));
    await dialog.getByLabel('Name').fill(uploadedName);
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const row = page.getByRole('button', { name: uploadedName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    // An uploaded script is not managed, so it must expose the Delete control.
    await expect(row).not.toContainText('managed');
    await row.click();

    await page.getByRole('button', { name: 'Run' }).click();
    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('completed', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden({ timeout: 30_000 });
});

test('writes a bash script in the UI, runs it and shows its output', async ({ page }, testInfo) => {
    const scriptName = writtenNameFor(testInfo, 'bash');
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Upload' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Write script' }).click();
    await dialog.getByLabel('File name').fill(`${scriptName}.sh`);
    // Reachable by role and accessible name against the real CodeMirror
    // instance, not just the mocked editor the unit tests exercise - this is
    // the only place that would catch ScriptEditor's aria-label regressing.
    const editor = dialog.getByRole('textbox', { name: 'Script content' });
    await expect(editor).toBeVisible();
    // Reads stdin and prints a recognisable, greppable line - the same
    // contract the starter template teaches, just without the placeholder text.
    await writeInEditor(editor, ['read -r params', 'echo e2e-write-bash-ok $params'].join('\n'));
    // Exact match: "File name" also contains the substring "Name", and
    // Playwright's getByLabel matches substrings by default.
    await dialog.getByLabel('Name', { exact: true }).fill(scriptName);
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const row = page.getByRole('button', { name: scriptName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await page.getByPlaceholder('{}').fill('{"greeting":"e2e-write-bash"}');
    await page.getByRole('button', { name: 'Run' }).click();

    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('completed', { timeout: 30_000 });
    await expect(page.locator('pre')).toContainText('e2e-write-bash-ok');
    await expect(page.locator('pre')).toContainText('"greeting":"e2e-write-bash"');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden({ timeout: 30_000 });
});

test('writes a python script in the UI, runs it and shows its output', async ({ page }, testInfo) => {
    const scriptName = writtenNameFor(testInfo, 'python');
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Upload' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Write script' }).click();
    await dialog.getByLabel('File name').fill(`${scriptName}.py`);
    // The only coverage in this repository for the python3 interpreter path:
    // the gateway only picks python3 when the uploaded file's name ends in .py.
    await writeInEditor(
        dialog.locator('[data-testid="script-editor"] .cm-content'),
        [
            'import sys',
            'import json',
            '',
            'raw = sys.stdin.read()',
            'params = json.loads(raw) if raw.strip() else {}',
            'print("e2e-write-python-ok:", json.dumps(params, separators=(",", ":")))',
        ].join('\n')
    );
    // Exact match: "File name" also contains the substring "Name", and
    // Playwright's getByLabel matches substrings by default.
    await dialog.getByLabel('Name', { exact: true }).fill(scriptName);
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const row = page.getByRole('button', { name: scriptName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await page.getByPlaceholder('{}').fill('{"greeting":"e2e-write-python"}');
    await page.getByRole('button', { name: 'Run' }).click();

    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('completed', { timeout: 30_000 });
    await expect(page.locator('pre')).toContainText('e2e-write-python-ok');
    await expect(page.locator('pre')).toContainText('"greeting":"e2e-write-python"');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden({ timeout: 30_000 });
});

test('removes a finished execution record', async ({ page }) => {
    await openScripts(page, 'Test ECU');
    await page.getByRole('button', { name: 'Hello' }).click();
    await page.getByRole('button', { name: 'Run' }).click();

    const status = page.getByTestId('execution-status');
    await expect(status).toHaveText('completed', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(status).toHaveCount(0, { timeout: 30_000 });
});

test('shows the Scripts tab and the shared script on an app as well', async ({ page }) => {
    await openScripts(page, 'Talker');
    const row = page.getByRole('button', { name: 'Hello' });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('managed');
});
