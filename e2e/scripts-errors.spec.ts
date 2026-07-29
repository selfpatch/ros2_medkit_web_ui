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

import { test, expect, type Page } from '@playwright/test';
import { clickDeleteAndConfirm } from './dialog-helpers';

async function selectTestEcu(page: Page): Promise<void> {
    await page.goto('/');
    await page.getByText('Test ECU').click();
}

async function openScripts(page: Page): Promise<void> {
    await selectTestEcu(page);
    await page.getByRole('button', { name: /scripts/i }).click();
}

test('hides the Scripts tab when the gateway does not report the capability', async ({ page }) => {
    await page.route('**/api/v1/', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                api_base: '/api/v1',
                endpoints: [],
                name: 'ROS 2 Medkit Gateway',
                version: '0.6.0',
                capabilities: {
                    aggregation: false,
                    async_actions: true,
                    authentication: false,
                    bulk_data: true,
                    configurations: true,
                    cyclic_subscriptions: true,
                    data_access: true,
                    discovery: true,
                    faults: true,
                    locking: true,
                    logs: true,
                    operations: true,
                    scripts: false,
                    tls: false,
                    triggers: true,
                    updates: false,
                    vendor_extensions: false,
                },
            }),
        });
    });

    await selectTestEcu(page);
    await expect(page.getByRole('button', { name: /scripts/i })).toHaveCount(0);
});

test('shows the not-configured state when listing returns 501', async ({ page }) => {
    await page.route('**/api/v1/components/*/scripts', async (route) => {
        await route.fulfill({
            status: 501,
            contentType: 'application/json',
            body: JSON.stringify({ error_code: 'not-implemented', message: 'Scripts backend not configured' }),
        });
    });

    await openScripts(page);
    await expect(page.getByText('Scripts are not configured on this gateway')).toBeVisible({ timeout: 30_000 });
});

test('reports disabled uploads from the gateway message', async ({ page }) => {
    await page.route('**/api/v1/components/*/scripts', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
                error_code: 'invalid-request',
                message: 'Script uploads are disabled on this gateway',
            }),
        });
    });

    await openScripts(page);
    await page.getByRole('button', { name: 'Upload' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('File').setInputFiles({
        name: 'probe.sh',
        mimeType: 'text/x-shellscript',
        buffer: Buffer.from('#!/usr/bin/env bash\necho probe\n'),
    });
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Script uploads are disabled on this gateway', {
        timeout: 30_000,
    });
});

test('reports that a managed script cannot be deleted', async ({ page }) => {
    // The live gateway would never let a managed script's Delete button
    // render at all, so the only way to exercise the gateway's rejection
    // message is to mock a script that claims not to be managed and have the
    // delete call fail anyway - exactly what a stale client cache would see.
    await page.route('**/api/v1/components/*/scripts', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                items: [{ id: 'hello', name: 'Hello', description: 'Mocked managed script', managed: false }],
            }),
        });
    });
    await page.route('**/api/v1/components/*/scripts/*', async (route) => {
        if (route.request().method() !== 'DELETE') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
                error_code: 'x-medkit-managed-script',
                message: 'Cannot delete managed script: hello',
            }),
        });
    });

    await openScripts(page);
    await page.getByRole('button', { name: 'Hello' }).click();
    await clickDeleteAndConfirm(page, 'Hello');
    await expect(page.getByText('Cannot delete managed script: hello')).toBeVisible({ timeout: 30_000 });
});

test('reports the concurrency limit when starting an execution', async ({ page }) => {
    await page.route('**/api/v1/components/*/scripts/*/executions', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
                error_code: 'x-medkit-concurrency-limit',
                message: 'Maximum concurrent executions reached (5)',
            }),
        });
    });

    await openScripts(page);
    await page.getByRole('button', { name: 'Hello' }).click();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByText('Maximum concurrent executions reached (5)')).toBeVisible({ timeout: 30_000 });
});

test('marks an execution as no longer tracked when polling returns 404', async ({ page }) => {
    await page.route('**/api/v1/components/*/scripts/*/executions', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'exec_mocked_1', status: 'running', started_at: new Date().toISOString() }),
        });
    });
    await page.route('**/api/v1/components/*/scripts/*/executions/*', async (route) => {
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error_code: 'resource-not-found', message: 'Execution not found' }),
        });
    });

    await openScripts(page);
    await page.getByRole('button', { name: 'Hello' }).click();
    await page.getByRole('button', { name: 'Run' }).click();
    const status = page.getByTestId('execution-status');
    await expect(status).toBeVisible({ timeout: 30_000 });
    // Scope to the card that owns this status badge - other Refresh/Remove
    // buttons exist elsewhere on the page (the panel's list reload, other
    // execution cards). Do not click Refresh: the assertion below must be
    // satisfied by the store's own poll loop picking up the 404 on its next
    // tick, not by the manual rescue action.
    const card = page.locator('[data-slot="card"]', { has: status }).last();
    await expect(card.getByText('The gateway no longer tracks this execution')).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 30_000 });
});
