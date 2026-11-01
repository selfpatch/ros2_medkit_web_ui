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

/**
 * A data item shows the value the gateway reads for it.
 *
 * Runs against e2e/docker-compose.data.yml: a gateway with runtime discovery
 * and the node in e2e/gateway/data_source.py.
 */

import { expect, test, type Page } from '@playwright/test';

const GATEWAY_PORT = process.env.E2E_DATA_GATEWAY_PORT ?? '8082';
const GATEWAY_URL = process.env.E2E_DATA_GATEWAY_URL ?? `http://localhost:${GATEWAY_PORT}/api/v1`;
const STORAGE_KEY = 'ros2_medkit_web_ui_server_url';
const APP_ID = 'e2e_data_source';
const COUNTER_READ = /\/apps\/e2e_data_source\/data\/.+counter$/;
const COMPONENT_READ = /\/components\/[^/]+$/;
// The store applies an answer right after the response arrives; this leaves time to render it.
const SETTLE_MS = 500;

/** The counter value the gateway serves now. */
async function gatewayCounter(): Promise<number | undefined> {
    const res = await fetch(`${GATEWAY_URL}/apps/${APP_ID}/data/${encodeURIComponent('/e2e/counter')}`);
    const body = (await res.json()) as { data?: { data?: number } };
    return body.data?.data;
}

/** Waits until the gateway has a sample for the counter, so a failure below is about the UI. */
async function waitForCounterSample(): Promise<void> {
    const url = `${GATEWAY_URL}/apps/${APP_ID}/data/${encodeURIComponent('/e2e/counter')}`;
    const deadline = Date.now() + 90_000;
    let last = 'no attempt made';
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
            const body = (await res.json()) as { 'x-medkit'?: { status?: string } };
            if (res.ok && body['x-medkit']?.status === 'data') return;
            last = `HTTP ${res.status}, status ${body['x-medkit']?.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`No counter sample on ${url} (start e2e/docker-compose.data.yml): ${last}`);
}

test.beforeAll(async () => {
    await waitForCounterSample();
});

test.beforeEach(async ({ page }) => {
    // Points the app at the data stack instead of the one global setup seeded.
    await page.addInitScript(
        ([key, url]) => window.localStorage.setItem(key, JSON.stringify({ state: { serverUrl: url }, version: 0 })),
        [STORAGE_KEY, GATEWAY_URL] as const
    );
});

/** The tree row of the host component, whose id is the container hostname. */
function componentRow(page: Page) {
    return page.getByRole('treeitem').filter({ hasText: 'component' }).first();
}

/** The Refresh buttons of the selected entity; the tree has its own "Refresh entities". */
function refreshButtons(page: Page) {
    return page.getByRole('button', { name: 'Refresh', exact: true });
}

/** Opens the data source app from the tree. */
async function openApp(page: Page): Promise<void> {
    await page.goto('/', { waitUntil: 'load' });
    await componentRow(page).getByRole('button', { name: 'Expand' }).click();
    await page.getByRole('treeitem', { name: new RegExp(APP_ID) }).click();
    await expect(page.getByText('Node Information')).toBeVisible();
}

/** Opens the host component, the entity view that has a Refresh button. */
async function openComponent(page: Page): Promise<void> {
    await page.goto('/', { waitUntil: 'load' });
    await componentRow(page).click();
    await expect(refreshButtons(page)).toHaveCount(1);
}

/** Opens a data item of the data source app the way a user does: tree, app, Data tab, row. */
async function openDataItem(page: Page, topic: string): Promise<void> {
    await openApp(page);
    await page.getByRole('button', { name: /^Data\b/ }).click();
    await page.getByText(topic, { exact: true }).click();
    await expect(page.getByText('Data diagnostics and access')).toBeVisible();
}

/** The last received value as the JSON view prints it, or null when the panel shows none. */
async function shownValue(page: Page): Promise<unknown> {
    const region = page.getByRole('region', { name: 'Last received value' });
    await expect(region).toBeVisible();
    const json = region.getByRole('button', { name: 'JSON' });
    if ((await json.count()) === 0) return null;
    await json.click();
    return JSON.parse(await region.locator('pre').innerText());
}

test('shows the value of a published topic', async ({ page }) => {
    await openDataItem(page, '/e2e/counter');

    const value = (await shownValue(page)) as { data?: unknown } | null;
    expect(value).not.toBeNull();
    expect(typeof value?.data).toBe('number');
    await expect(page.getByText('No data received yet')).toHaveCount(0);
    // The gateway stamps the sample in nanoseconds; a unit mix-up lands in 1970.
    const year = String(new Date().getFullYear());
    await expect(page.getByRole('region', { name: 'Last received value' }).getByText(/^Received:/)).toContainText(year);
});

test('shows a value whose only field is zero', async ({ page }) => {
    await openDataItem(page, '/e2e/zero');

    expect(await shownValue(page)).toEqual({ data: 0 });
});

test('shows the publisher count the gateway reports', async ({ page }) => {
    await openDataItem(page, '/e2e/counter');

    await expect(page.getByText('1 pub', { exact: true })).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('says a topic without a sample has no data, without printing an empty object', async ({ page }) => {
    await openDataItem(page, '/e2e/silent');

    const region = page.getByRole('region', { name: 'Last received value' });
    await expect(region.getByText('No data received yet')).toBeVisible();
    await expect(region.locator('pre')).toHaveCount(0);
});

test('Refresh reads the item again and shows the new value', async ({ page }) => {
    await openDataItem(page, '/e2e/counter');
    const before = (await shownValue(page)) as { data: number };
    // Refresh can only show a newer counter once the gateway serves one.
    await expect.poll(gatewayCounter).toBeGreaterThan(before.data);

    const reads: string[] = [];
    page.on('request', (request) => {
        if (request.method() === 'GET' && COUNTER_READ.test(request.url())) reads.push(request.url());
    });
    // The data panel's own Refresh comes after the one in the page header.
    await refreshButtons(page).last().click();

    await expect.poll(() => reads.length).toBeGreaterThan(0);
    await expect
        .poll(async () => ((await shownValue(page)) as { data: number } | null)?.data)
        .toBeGreaterThan(before.data);
});

test('Refresh of a data item says when the gateway answers with an error', async ({ page }) => {
    await openDataItem(page, '/e2e/counter');
    await page.route(COUNTER_READ, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error_code: 'service-unavailable', message: 'Sampling failed' }),
        })
    );

    await refreshButtons(page).last().click();

    await expect(page.getByText('Failed to refresh data: Sampling failed')).toBeVisible();
});

test('Refresh of a data item that answers after the user moved on keeps the new selection', async ({ page }) => {
    await openDataItem(page, '/e2e/counter');
    // Holds the read back so the user can select something else before it answers.
    await page.route(COUNTER_READ, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue();
    });
    const answered = page.waitForResponse(COUNTER_READ);

    await refreshButtons(page).last().click();
    await page.getByRole('treeitem', { name: new RegExp(APP_ID) }).click();
    await expect(page.getByText('Node Information')).toBeVisible();
    await answered;
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.getByText('Data diagnostics and access')).toHaveCount(0);
    await expect(page.getByText('Node Information')).toBeVisible();
});

test('Refresh of a component says when the gateway answers with an error', async ({ page }) => {
    await openComponent(page);
    await page.route(COMPONENT_READ, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error_code: 'service-unavailable', message: 'Discovery is busy' }),
        })
    );

    await refreshButtons(page).click();

    await expect(page.getByText('Failed to refresh data: Discovery is busy')).toBeVisible();
});

test('Refresh of a component that answers after the user moved on keeps the new selection', async ({ page }) => {
    await openComponent(page);
    await page.route(COMPONENT_READ, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue();
    });
    const answered = page.waitForResponse(COMPONENT_READ);

    await refreshButtons(page).click();
    // Selecting the component expanded it, so its apps are listed.
    await page.getByRole('treeitem', { name: new RegExp(APP_ID) }).click();
    await expect(page.getByText('Node Information')).toBeVisible();
    await answered;
    await page.waitForTimeout(SETTLE_MS);

    await expect(page.getByText('Node Information')).toBeVisible();
});
