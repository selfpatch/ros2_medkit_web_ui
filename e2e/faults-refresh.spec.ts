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
 * The fault dashboard against a real gateway that reports no faults - the case
 * where "loaded" and "empty" look alike. A refresh must leave the page as it is
 * and must cost one request, however many fault views are on screen.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Reports whether the first-load skeleton appears at any point from now on,
 * including for a single frame that polling a locator would step over.
 */
async function watchForSkeleton(page: Page): Promise<() => Promise<boolean>> {
    await page.evaluate(() => {
        const w = window as unknown as { __skeletonSeen?: boolean; __skeletonObserver?: MutationObserver };
        w.__skeletonSeen = false;
        const observer = new MutationObserver(() => {
            if (document.querySelector('main .animate-pulse')) {
                w.__skeletonSeen = true;
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        w.__skeletonObserver = observer;
    });

    return async () =>
        page.evaluate(() => {
            const w = window as unknown as { __skeletonSeen?: boolean; __skeletonObserver?: MutationObserver };
            w.__skeletonObserver?.disconnect();
            return w.__skeletonSeen === true;
        });
}

/**
 * The dashboard reads the gateway-wide fault list. Entity pages read their own
 * `/apps/<id>/faults`, which ends the same way, so the match has to be exact or a
 * detour through an entity inflates the count.
 */
function isFaultListRequest(url: string): boolean {
    return new URL(url).pathname === '/api/v1/faults';
}

/**
 * Serves the fault list from here rather than from the gateway. These tests are about
 * when the page refreshes, not about what the gateway holds, and the e2e gateway runs
 * without a fault manager - it answers `/faults` with 503 after five seconds, which
 * would decide both what is on screen and how the ticks line up.
 */
async function serveEmptyFaultList(page: Page): Promise<void> {
    await page.route('**/api/v1/faults?**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' })
    );
}

/** Opens the dashboard and waits for the gateway's (empty) fault list to be on screen. */
async function openDashboard(page: Page): Promise<void> {
    await page.goto('/');
    await page.getByRole('button', { name: 'Faults Dashboard' }).click();
    await expect(page.getByText('No faults to display')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No faults detected')).toBeVisible();
}

const POLL_INTERVAL_MS = 5_000;
const OBSERVED_WINDOW_MS = 11_000;

test.describe('faults dashboard refresh', () => {
    test('a refresh of an empty fault list leaves the page as it is', async ({ page }) => {
        await serveEmptyFaultList(page);
        await openDashboard(page);
        const skeletonSeen = await watchForSkeleton(page);

        // The refresh a tab regaining focus triggers.
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(2_000);

        expect(await skeletonSeen()).toBe(false);
        await expect(page.getByText('No faults to display')).toBeVisible();
    });

    test('opening the dashboard reads the fault list', async ({ page }) => {
        await serveEmptyFaultList(page);
        await openDashboard(page);

        const faultRequests: string[] = [];
        page.on('request', (request) => {
            if (isFaultListRequest(request.url())) {
                faultRequests.push(request.url());
            }
        });

        // Leave the dashboard for an entity and come back. The sidebar badge stays
        // mounted the whole time, so the dashboard is never the session's first fault view.
        await page.getByText('Test ECU').first().click();
        await expect(page.getByText('No faults to display')).toBeHidden();
        await page.getByRole('button', { name: 'Faults Dashboard' }).click();
        await expect(page.getByText('No faults to display')).toBeVisible();

        expect(faultRequests.length).toBeGreaterThan(0);
    });

    test('says the fault list could not be read, rather than showing none', async ({ page }) => {
        // Verbatim what the gateway answers when its fault manager is not running.
        await page.route('**/api/v1/faults?**', (route) =>
            route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({
                    error_code: 'service-unavailable',
                    message: 'Failed to get faults',
                    parameters: { details: 'ListFaults service not available' },
                }),
            })
        );

        await page.goto('/');
        await page.getByRole('button', { name: 'Faults Dashboard' }).click();

        const dashboard = page.locator('main');
        await expect(dashboard.getByText('Fault list unavailable')).toBeVisible({ timeout: 30_000 });
        await expect(dashboard.getByText('ListFaults service not available')).toBeVisible();
        await expect(dashboard.getByText('System is operating normally')).toBeHidden();
        await expect(dashboard.getByText('No faults detected')).toBeHidden();
    });

    test('a gateway that cannot read faults says so, and keeps saying it', async ({ page }) => {
        // No stubbing here. The e2e gateway runs without a fault manager, so `/faults`
        // is a real 503 arriving five seconds late - a first load that fails slowly.
        await page.goto('/');
        await page.getByRole('button', { name: 'Faults Dashboard' }).click();

        const dashboard = page.locator('main');
        await expect(dashboard.getByText('Fault list unavailable')).toBeVisible({ timeout: 30_000 });
        await expect(dashboard.getByText('ListFaults service not available')).toBeVisible();

        // The skeleton belongs to the first load. Every retry after it keeps the page as
        // it is, and nothing on the page claims the system is fine.
        const skeletonSeen = await watchForSkeleton(page);
        await page.waitForTimeout(11_000);

        expect(await skeletonSeen()).toBe(false);
        await expect(dashboard.getByText('Fault list unavailable')).toBeVisible();
        await expect(dashboard.getByText('All Clear')).toBeHidden();
    });

    test('the fallback poll asks once per interval, not once per mounted view', async ({ page }) => {
        // With no fault stream the app falls back to polling. The dashboard and the
        // sidebar badge are both on screen and read the same list. An HTTP status is
        // what makes the client give up at once - a dropped connection it retries.
        await page.route('**/faults/stream**', (route) =>
            route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        );
        await serveEmptyFaultList(page);
        await openDashboard(page);

        const faultRequests: string[] = [];
        page.on('request', (request) => {
            if (isFaultListRequest(request.url())) {
                faultRequests.push(request.url());
            }
        });
        await page.waitForTimeout(OBSERVED_WINDOW_MS);

        const intervals = Math.floor(OBSERVED_WINDOW_MS / POLL_INTERVAL_MS);
        expect(faultRequests.length).toBeGreaterThanOrEqual(intervals);
        expect(faultRequests.length).toBeLessThanOrEqual(intervals + 1);
    });
});
