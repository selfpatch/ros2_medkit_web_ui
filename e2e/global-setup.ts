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

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// e2e/docker-compose.yml publishes the gateway container on E2E_GATEWAY_PORT,
// not E2E_GATEWAY_URL - deriving the URL's port from it here means overriding
// the one variable that actually changes (the port, e.g. because 8080 is
// already taken) is enough. Without this, setting only E2E_GATEWAY_PORT would
// leave global setup polling the old default port for the full two-minute
// deadline before failing. An explicit E2E_GATEWAY_URL still wins outright,
// for the rarer case where the host part needs to change too.
const GATEWAY_PORT = process.env.E2E_GATEWAY_PORT ?? '8080';
const GATEWAY_URL = process.env.E2E_GATEWAY_URL ?? `http://localhost:${GATEWAY_PORT}/api/v1`;
const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:5173';
const STORAGE_KEY = 'ros2_medkit_web_ui_server_url';

// Node's fetch has no default timeout, so a stalled TCP connect (as opposed
// to an outright refused one) would otherwise hang the await forever - the
// deadline below would never get re-checked and global setup would just sit
// there until Playwright's own timeout kills it, looking like a mysterious
// hang instead of "the gateway did not start". Each attempt gets its own
// short timeout so the loop always keeps making progress toward the deadline.
const ATTEMPT_TIMEOUT_MS = 5_000;

async function waitForGateway(): Promise<void> {
    const deadline = Date.now() + 120_000;
    let lastError = 'no attempt made';
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
            if (res.ok) return;
            lastError = `HTTP ${res.status}`;
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Gateway did not become healthy at ${GATEWAY_URL}: ${lastError}`);
}

export default async function globalSetup(): Promise<void> {
    await waitForGateway();

    const browser = await chromium.launch();
    const context = await browser.newContext();
    // The app auto-connects to the persisted URL on start, so seeding the store
    // is enough and we never have to drive the connection dialog.
    await context.addInitScript(
        ([key, url]) => {
            window.localStorage.setItem(key, JSON.stringify({ state: { serverUrl: url }, version: 0 }));
        },
        [STORAGE_KEY, GATEWAY_URL]
    );
    const page = await context.newPage();
    // goto() already waits for 'load'. Not 'networkidle': once connected, the
    // app opens a long-lived SSE fault stream that never completes, so the
    // network would never go idle and this would hang until the action timeout.
    await page.goto(APP_URL);

    mkdirSync('e2e/.auth', { recursive: true });
    await context.storageState({ path: 'e2e/.auth/state.json' });
    await browser.close();
}
