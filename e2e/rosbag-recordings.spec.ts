// Copyright 2026 mfaferek93
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
 * A fault that owns several black-box recordings, end to end in a browser.
 *
 * An intermittent fault leaves one recording per occurrence. Until
 * ros2_medkit#620 the newest overwrote the previous one, so the occurrence an
 * engineer actually wanted to look at was already gone by the time they opened
 * the fault. These specs drive the real UI against a real gateway holding two
 * real bags and assert the technician can reach both of them.
 *
 * Runs against e2e/docker-compose.rosbag.yml, a separate stack from the scripts
 * one: it needs a fault manager, which that stack does not run.
 */

import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const GATEWAY_PORT = process.env.E2E_ROSBAG_GATEWAY_PORT ?? '8081';
const GATEWAY_URL = process.env.E2E_ROSBAG_GATEWAY_URL ?? `http://localhost:${GATEWAY_PORT}/api/v1`;
const STORAGE_KEY = 'ros2_medkit_web_ui_server_url';
const FAULT_CODE = process.env.E2E_ROSBAG_FAULT_CODE ?? 'E2E_FLAPPING_SENSOR';

interface Descriptor {
    id: string;
    'x-medkit'?: { fault_codes?: string[]; recording_id?: string };
}

/** fetch that answers null instead of throwing when nothing is listening. */
async function safeFetch(url: string): Promise<Response | null> {
    try {
        return await fetch(url);
    } catch {
        return null;
    }
}

/** Recording ids the gateway attributes to the seeded fault, via its own API. */
async function recordingsFromApi(appId: string): Promise<string[]> {
    // Network errors are swallowed here and in appHoldingTheFault so a stack that
    // is not up leaves expectedRecordings empty and the specs SKIP with a named
    // reason. Letting fetch throw out of beforeAll fails them instead, which says
    // nothing about this repo and turns CI red on a missing fixture.
    const response = await safeFetch(`${GATEWAY_URL}/apps/${appId}/bulk-data/rosbags`);
    if (!response?.ok) return [];
    const body = (await response.json()) as { items?: Descriptor[] };
    return (body.items ?? [])
        .filter((item) => item['x-medkit']?.fault_codes?.includes(FAULT_CODE))
        .map((item) => item.id);
}

/** The app the seeded fault is attributed to, whatever the gateway named it. */
async function appHoldingTheFault(): Promise<string | null> {
    const response = await safeFetch(`${GATEWAY_URL}/apps`);
    if (!response?.ok) return null;
    const body = (await response.json()) as { items?: Array<{ id: string }> };
    for (const app of body.items ?? []) {
        const faults = await safeFetch(`${GATEWAY_URL}/apps/${app.id}/faults`);
        if (!faults?.ok) continue;
        const listing = (await faults.json()) as { items?: Array<{ fault_code?: string }> };
        if ((listing.items ?? []).some((f) => f.fault_code === FAULT_CODE)) return app.id;
    }
    return null;
}

let appId: string | null = null;
let expectedRecordings: string[] = [];

test.beforeAll(async () => {
    appId = await appHoldingTheFault();
    if (appId) expectedRecordings = await recordingsFromApi(appId);
});

// Skipped rather than failed when the stack is not up or predates the
// recording-id contract: a red suite over a missing fixture says nothing about
// this repo, and these specs are the first to need a gateway new enough to keep
// more than one bag per fault.
test.beforeEach(async ({ page }) => {
    test.skip(
        appId === null || expectedRecordings.length < 2,
        `needs e2e/docker-compose.rosbag.yml up with ${FAULT_CODE} seeded and holding ` +
            `at least two recordings (found ${expectedRecordings.length} on ${GATEWAY_URL})`
    );
    // Point the app at the rosbag stack instead of the scripts one that global
    // setup seeded, before any application code runs. The stored value is a
    // zustand-persist envelope, not a bare URL - writing the raw string leaves
    // the app unable to parse it and sitting on the connection dialog.
    await page.addInitScript(
        ([key, url]) => window.localStorage.setItem(key, JSON.stringify({ state: { serverUrl: url }, version: 0 })),
        [STORAGE_KEY, GATEWAY_URL] as const
    );
});

async function openTheFault(page: import('@playwright/test').Page) {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: /Faults Dashboard/i }).click();
    await expect(page.getByText(FAULT_CODE).first()).toBeVisible();
    await page.getByText(FAULT_CODE).first().click();
}

/** The fault's rosbag download buttons, in the order the detail lists them. */
function downloadButtons(page: import('@playwright/test').Page) {
    return page.locator('button:has(svg.lucide-download)');
}

test('the fault detail shows every recording, not just the newest', async ({ page }) => {
    await openTheFault(page);

    // One download button per recording. Before #620 the gateway could only ever
    // report one, so this is the assertion the whole change exists for.
    await expect(downloadButtons(page)).toHaveCount(expectedRecordings.length);

    // Each button names the recording it will fetch. Without that the icon
    // buttons are indistinguishable - to a screen reader they were nameless, and
    // sighted users saw N identical download icons with nothing to tell them
    // apart.
    const names = await downloadButtons(page).evaluateAll((els) =>
        els.map((el) => el.getAttribute('aria-label') ?? '')
    );
    expect(new Set(names).size).toBe(expectedRecordings.length);
    for (const recordingId of expectedRecordings) {
        expect(names.some((name) => name.includes(recordingId))).toBe(true);
    }
});

test('every recording downloads as its own bag', async ({ page }) => {
    await openTheFault(page);
    const buttons = downloadButtons(page);
    await expect(buttons).toHaveCount(expectedRecordings.length);

    const filenames: string[] = [];
    const payloads: Buffer[] = [];
    for (let i = 0; i < expectedRecordings.length; i += 1) {
        const [download] = await Promise.all([page.waitForEvent('download'), buttons.nth(i).click()]);
        const name = download.suggestedFilename();
        filenames.push(name);

        // The gateway names the file and is the only party that knows the
        // storage format. Saving under the descriptor's display label instead
        // dropped the extension, landing a bag on disk that neither the OS nor
        // `ros2 bag play` could open without a manual rename.
        expect(name).toMatch(/\.(mcap|db3)$/);

        const path = await download.path();
        expect(path).toBeTruthy();
        payloads.push(readFileSync(path!));
    }

    // Distinct files, not the same bag served twice under different buttons.
    expect(new Set(filenames).size).toBe(expectedRecordings.length);

    // And distinct BYTES. Names alone would still pass on a build that resolved
    // both ids to one recording but labelled the responses differently; this is
    // what proves each button fetched its own occurrence.
    expect(new Set(payloads.map((b) => b.toString('base64'))).size).toBe(expectedRecordings.length);
    for (const payload of payloads) {
        expect(payload.length).toBeGreaterThan(0);
        // Every bag the fixture records is mcap; the magic is the cheapest proof
        // that what arrived is a bag and not an error page.
        expect(payload.subarray(0, 5)).toEqual(Buffer.from([0x89, 0x4d, 0x43, 0x41, 0x50]));
    }
});

test('re-expanding the fault asks the gateway again instead of replaying a cache', async ({ page }) => {
    // The detail used to be fetched once per fault and cached forever, so a
    // recording written after the first expand stayed invisible until the
    // component remounted. This drives the collapse/re-expand path and pins
    // that the second expand goes back to the gateway with a 2xx; seeding a
    // THIRD recording mid-test would need a second seeder pass, so the
    // count-grows half lives in the jsdom tests that stub the store.
    await openTheFault(page);
    await expect(downloadButtons(page)).toHaveCount(expectedRecordings.length);

    // Collapse.
    await page.getByText(FAULT_CODE).first().click();

    // Re-expand, armed BEFORE the click and only satisfied by a 2xx: an error
    // response must not count as "refetched".
    const refetch = page.waitForResponse(
        (response) => response.url().includes(`/faults/${FAULT_CODE}`) && response.ok()
    );
    await page.getByText(FAULT_CODE).first().click();
    await refetch;
    await expect(downloadButtons(page)).toHaveCount(expectedRecordings.length);
});
