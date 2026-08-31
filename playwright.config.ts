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

import { defineConfig } from '@playwright/test';

// Read from the same E2E_APP_URL that e2e/global-setup.ts honours, and derive
// the dev server's port from it, so config and setup cannot end up visiting
// two different addresses if only one of them is overridden.
const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:5173';
const APP_PORT = new URL(BASE_URL).port || '5173';

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    // Fails the run in CI if a `test.only` was committed, instead of silently
    // running just that one test and reporting a spuriously green suite.
    forbidOnly: !!process.env.CI,
    timeout: 60_000,
    expect: { timeout: 30_000 },
    reporter: [['html', { open: 'never' }], ['list']],
    // Both projects below hit the same single containerised gateway for
    // everything they do not explicitly mock (entity discovery, health,
    // faults). Left to Playwright's default per-project parallelism, the
    // 'mocked' project's own worker runs concurrently with 'scripts-serial'
    // and the resulting burst of simultaneous full-app connections can push
    // the gateway's response time past the client's health-check timeout,
    // aborting an unrelated connect() and failing an unrelated test. A single
    // global worker keeps every test's gateway traffic strictly sequential.
    workers: 1,
    use: { baseURL: BASE_URL, storageState: 'e2e/.auth/state.json', trace: 'retain-on-failure' },
    webServer: {
        command: `npm run dev -- --port ${APP_PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        // These specs mutate shared gateway state (uploads, executions, the global
        // concurrency limit), so they must not run in parallel with each other.
        { name: 'scripts-serial', testMatch: /(scripts|smoke)\.spec\.ts/, fullyParallel: false, workers: 1 },
        { name: 'mocked', testMatch: /.*-errors\.spec\.ts/ },
        // Its own stack (e2e/docker-compose.rosbag.yml) on its own port, because
        // it needs a fault manager the scripts gateway does not run. Serial for
        // the same reason as scripts-serial: one shared gateway.
        { name: 'rosbag-serial', testMatch: /rosbag-.*\.spec\.ts/, fullyParallel: false, workers: 1 },
        // Reads the scripts gateway without changing it, but counts the requests the
        // app makes, so it must not share a run with specs driving the same app.
        { name: 'faults-serial', testMatch: /faults-.*\.spec\.ts/, fullyParallel: false, workers: 1 },
    ],
});
