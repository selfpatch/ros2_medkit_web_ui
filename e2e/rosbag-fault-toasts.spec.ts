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
 * When a fault raises a toast, and what a list read does with the faults the stream
 * reported meanwhile, against a real gateway and a real fault manager.
 *
 * Faults are reported and cleared through the fault manager's services, which the
 * gateway serves as operations of the fault manager's app. Each test owns its fault codes
 * and clears them at the end.
 *
 * Runs against e2e/docker-compose.rosbag.yml.
 */

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const GATEWAY_PORT = process.env.E2E_ROSBAG_GATEWAY_PORT ?? '8081';
const GATEWAY_URL = process.env.E2E_ROSBAG_GATEWAY_URL ?? `http://localhost:${GATEWAY_PORT}/api/v1`;
const STORAGE_KEY = 'ros2_medkit_web_ui_server_url';
const FAULT_MANAGER_APP = 'fault_manager';
const SEEDED_FAULT = process.env.E2E_ROSBAG_FAULT_CODE ?? 'E2E_FLAPPING_SENSOR';
// The source of every fault below: a node that stays on the graph, so the gateway files
// the fault under an app.
const SOURCE_ID = '/e2e_rosbag_seeder';

const SEVERITY = { warning: 1, error: 2 } as const;
type Severity = keyof typeof SEVERITY;

// A stream opened without a Last-Event-ID replays the gateway's event buffer; an event
// older than this when the page opens is a replay.
const REPLAY_MARGIN_MS = 10_000;
// A toast that was going to be raised is raised as soon as the event is applied.
const SETTLE_MS = 1_500;
const HOUR_MS = 60 * 60 * 1000;

const runId = Date.now().toString(36).slice(-5).toUpperCase();

/** What the page saw come down its fault stream. */
interface SeenEvent {
    event: string;
    code: string;
    description: string;
}

interface PageProbe {
    __faultEvents: SeenEvent[];
}

/**
 * Runs in the page before the app. Points the app at the gateway, optionally moves the
 * page's clock by `offsetMs` (timers are not touched), and records every event of the
 * fault stream as it arrives.
 */
function prepareApp(args: { key: string; url: string; offsetMs: number }): void {
    window.localStorage.setItem(args.key, JSON.stringify({ state: { serverUrl: args.url }, version: 0 }));
    const seen: SeenEvent[] = [];
    (window as unknown as PageProbe).__faultEvents = seen;

    if (args.offsetMs !== 0) {
        const RealDate = Date;
        const offset = args.offsetMs;
        class ShiftedDate extends RealDate {
            constructor(...parts: unknown[]) {
                if (parts.length === 0) super(RealDate.now() + offset);
                else super(...(parts as [number]));
            }
            static override now(): number {
                return RealDate.now() + offset;
            }
        }
        window.Date = ShiftedDate as DateConstructor;
    }

    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const response = await realFetch(input, init);
        const url = input instanceof Request ? input.url : String(input);
        if (!response.body || !new URL(url, window.location.href).pathname.endsWith('/faults/stream')) {
            return response;
        }
        const [forApp, forProbe] = response.body.tee();
        void (async () => {
            const reader = forProbe.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) return;
                buffer += decoder.decode(value, { stream: true });
                const messages = buffer.split('\n\n');
                buffer = messages.pop() ?? '';
                for (const message of messages) {
                    const event = /^event: (.*)$/m.exec(message)?.[1];
                    const data = /^data: (.*)$/m.exec(message)?.[1];
                    if (!event || !data) continue;
                    const fault = (JSON.parse(data) as { fault?: { fault_code?: string; description?: string } }).fault;
                    seen.push({ event, code: fault?.fault_code ?? '', description: fault?.description ?? '' });
                }
            }
        })();
        return new Response(forApp, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    };
}

async function callFaultManager(service: 'report_fault' | 'clear_fault', parameters: Record<string, unknown>) {
    const url = `${GATEWAY_URL}/apps/${FAULT_MANAGER_APP}/operations/${service}/executions`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters }),
        });
    } catch (err) {
        throw new Error(
            `needs e2e/docker-compose.rosbag.yml up, with the gateway answering on ${GATEWAY_URL}: ` +
                (err instanceof Error ? err.message : String(err))
        );
    }
    if (!response.ok) throw new Error(`${service} answered HTTP ${response.status}: ${await response.text()}`);
}

/** The codes the running test reported, cleared when it ends. */
let reported: string[] = [];

function codeFor(name: string): string {
    const code = `E2E_TOAST_${name}_${runId}`;
    reported.push(code);
    return code;
}

async function fail(code: string, description: string, severity: Severity = 'error'): Promise<void> {
    await callFaultManager('report_fault', {
        fault_code: code,
        event_type: 0,
        severity: SEVERITY[severity],
        description,
        source_id: SOURCE_ID,
    });
}

async function pass(code: string): Promise<void> {
    await callFaultManager('report_fault', {
        fault_code: code,
        event_type: 1,
        severity: SEVERITY.error,
        description: 'passed',
        source_id: SOURCE_ID,
    });
}

test.beforeAll(async () => {
    // Fails, naming the stack, when it is not up: nothing below can say anything then.
    const response = await fetch(`${GATEWAY_URL}/apps/${FAULT_MANAGER_APP}/operations`).catch((err: unknown) => {
        throw new Error(
            `needs e2e/docker-compose.rosbag.yml up, with the gateway answering on ${GATEWAY_URL}: ` +
                (err instanceof Error ? err.message : String(err))
        );
    });
    const body = (await response.json()) as { items?: Array<{ id: string }> };
    const services = (body.items ?? []).map((item) => item.id);
    expect(services, `operations of app ${FAULT_MANAGER_APP} on ${GATEWAY_URL}`).toEqual(
        expect.arrayContaining(['report_fault', 'clear_fault'])
    );
});

test.beforeEach(() => {
    reported = [];
});

test.afterEach(async () => {
    for (const code of reported) await callFaultManager('clear_fault', { fault_code: code });
});

async function openApp(page: Page, offsetMs = 0): Promise<void> {
    await page.addInitScript(prepareApp, { key: STORAGE_KEY, url: GATEWAY_URL, offsetMs });
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: /Faults Dashboard/ })).toBeVisible();
}

async function openDashboard(page: Page): Promise<void> {
    await page.getByRole('button', { name: /Faults Dashboard/ }).click();
    await expect(nowList(page).getByText(SEEDED_FAULT, { exact: true }).first()).toBeVisible();
}

const nowList = (page: Page) => page.getByRole('navigation', { name: 'Faults now' });
const historyList = (page: Page) => page.getByRole('navigation', { name: 'Fault history' });

/** Absent right now. Not `toHaveCount(0)`: that retries, and passes once a toast closes. */
async function expectNone(locator: Locator): Promise<void> {
    expect(await locator.count()).toBe(0);
}

/** The toasts that carry `text`: every fault toast says its fault's description. */
const toasts = (page: Page, text: string) => page.locator('.Toastify__toast').filter({ hasText: text });

/** The page has seen the stream bring `event` about `code`; the description narrows it. */
async function streamBrought(page: Page, event: string, code: string, description = ''): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(
                    ([wanted, about, text]) =>
                        (window as unknown as PageProbe).__faultEvents.some(
                            (seen) => seen.event === wanted && seen.code === about && seen.description.includes(text!)
                        ),
                    [event, code, description]
                ),
            { message: `the stream brings ${event} about ${code} to the page` }
        )
        .toBe(true);
}

/** Past the margin, so that what the gateway buffered counts as a replay. */
async function ageIntoReplay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, REPLAY_MARGIN_MS + 2_000));
}

/**
 * Holds the answer of the next list read: the read is made to the gateway only after
 * `answer()`, and reaches the page only after `release()`.
 */
async function holdNextListRead(page: Page) {
    let answer!: () => void;
    let release!: () => void;
    let answered!: () => void;
    let markArrived!: () => void;
    const mayAnswer = new Promise<void>((resolve) => (answer = resolve));
    const mayRelease = new Promise<void>((resolve) => (release = resolve));
    const hasAnswered = new Promise<void>((resolve) => (answered = resolve));
    const arrived = new Promise<void>((resolve) => (markArrived = resolve));
    let held = false;
    await page.route(/\/api\/v1\/faults\?/, async (route: Route) => {
        if (held) return route.continue();
        held = true;
        markArrived();
        await mayAnswer;
        const response = await route.fetch();
        answered();
        await mayRelease;
        await route.fulfill({ response });
    });
    return {
        arrived,
        answer: async () => {
            answer();
            await hasAnswered;
        },
        release,
    };
}

/** Reads of the list that never answer: what is on the page comes from the stream. */
async function stallListReads(page: Page): Promise<void> {
    await page.route(/\/api\/v1\/faults\?/, () => new Promise<void>(() => undefined));
}

/** What a tab regaining focus does: the page reads the list again. */
async function askForListRead(page: Page): Promise<void> {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test.describe('fault toasts', () => {
    test('U1 a reload that replays buffered events raises no toast and keeps the list', async ({ page }) => {
        const open = codeFor('U1_OPEN');
        const ended = codeFor('U1_ENDED');
        await fail(open, `${open} buffered`);
        await fail(ended, `${ended} buffered`);
        await pass(ended);
        await ageIntoReplay();

        await openApp(page);
        await page.reload({ waitUntil: 'load' });
        await streamBrought(page, 'fault_cleared', ended);
        await page.waitForTimeout(SETTLE_MS);
        await expectNone(toasts(page, 'buffered'));

        // The store applies events in order: once a fresh fault's toast is up, the
        // replayed ones before it have been applied too.
        const fresh = codeFor('U1_NEW');
        await fail(fresh, `${fresh} arrives`);
        await expect(toasts(page, `${fresh} arrives`)).toHaveCount(1);
        await expectNone(toasts(page, 'buffered'));
        await openDashboard(page);
        await expect(nowList(page).getByText(open, { exact: true })).toBeVisible();
    });

    for (const [name, offsetMs] of [
        ['U2 a browser clock an hour ahead of the robot', HOUR_MS],
        ['U3 a browser clock an hour behind the robot', -HOUR_MS],
    ] as const) {
        test(`${name}: a replay raises no toast, a new fault raises one`, async ({ page }) => {
            const tag = name.slice(0, 2);
            const buffered = codeFor(`${tag}_OLD`);
            const fresh = codeFor(`${tag}_NEW`);
            const bufferedNote = `${buffered} buffered`;
            const freshNote = `${fresh} arrives`;
            // A fault that ended: its replayed confirm finds it ended, which a toast would announce.
            await fail(buffered, bufferedNote);
            await pass(buffered);
            await ageIntoReplay();

            await openApp(page, offsetMs);
            await streamBrought(page, 'fault_cleared', buffered);
            await page.waitForTimeout(SETTLE_MS);
            await expectNone(toasts(page, bufferedNote));

            await fail(fresh, freshNote);
            await streamBrought(page, 'fault_confirmed', fresh);
            await expect(toasts(page, freshNote)).toHaveCount(1);
            // Applied in order: the replayed events before the fresh one are applied by now.
            await expectNone(toasts(page, bufferedNote));
            await page.waitForTimeout(SETTLE_MS);
            await expect(toasts(page, freshNote)).toHaveCount(1);
        });
    }

    test('U4a a new fault raises no toast while the Now list shows it, with a fault open or not', async ({ page }) => {
        const first = codeFor('U4A_ONE');
        const second = codeFor('U4A_TWO');
        await openApp(page);
        await openDashboard(page);
        // No read answers from here on, so only the stream can bring a row.
        await stallListReads(page);

        await fail(first, `${first} arrives`);
        await streamBrought(page, 'fault_confirmed', first);
        await expect(nowList(page).getByText(first, { exact: true })).toBeVisible();
        await page.waitForTimeout(SETTLE_MS);
        await expectNone(toasts(page, `${first} arrives`));

        // A fault open beside the list: on a wide screen the list stays.
        await nowList(page).getByText(SEEDED_FAULT, { exact: true }).first().click();
        await expect(page.locator('#fault-title')).toBeVisible();
        await expect(nowList(page)).toBeVisible();
        await fail(second, `${second} arrives`);
        await streamBrought(page, 'fault_confirmed', second);
        await expect(nowList(page).getByText(second, { exact: true })).toBeVisible();
        await page.waitForTimeout(SETTLE_MS);
        await expectNone(toasts(page, `${second} arrives`));
    });

    test('U4b a new fault raises a toast on the History tab', async ({ page }) => {
        const code = codeFor('U4B');
        await openApp(page);
        await openDashboard(page);
        await page.getByRole('button', { name: 'History' }).click();
        await expect(historyList(page)).toBeVisible();

        await fail(code, `${code} arrives`);
        await streamBrought(page, 'fault_confirmed', code);

        await expect(toasts(page, `${code} arrives`)).toHaveCount(1);
    });

    test('U4c a new fault raises a toast when its severity is filtered off', async ({ page }) => {
        const code = codeFor('U4C');
        await openApp(page);
        await openDashboard(page);
        await nowList(page).getByRole('button', { name: 'Severity' }).click();
        await page.getByRole('menuitemcheckbox', { name: 'Error' }).click();
        await page.keyboard.press('Escape');
        await expect(nowList(page).getByText(SEEDED_FAULT, { exact: true })).toBeHidden();

        await fail(code, `${code} arrives`);
        await streamBrought(page, 'fault_confirmed', code);

        await expect(toasts(page, `${code} arrives`)).toHaveCount(1);
    });

    test('U4e a new fault raises a toast when its status is filtered off', async ({ page }) => {
        const code = codeFor('U4E');
        await openApp(page);
        await openDashboard(page);
        await nowList(page).getByRole('button', { name: 'Status' }).click();
        await page.getByRole('menuitemcheckbox', { name: 'Active' }).click();
        await page.keyboard.press('Escape');
        await expect(nowList(page).getByText(SEEDED_FAULT, { exact: true })).toBeHidden();

        await fail(code, `${code} arrives`);
        await streamBrought(page, 'fault_confirmed', code);

        await expect(toasts(page, `${code} arrives`)).toHaveCount(1);
        await page.waitForTimeout(SETTLE_MS);
        await expect(toasts(page, `${code} arrives`)).toHaveCount(1);
        await expectNone(nowList(page).getByText(code, { exact: true }));
    });

    test('U4d a new fault raises a toast on a narrow screen with a fault open', async ({ page }) => {
        const code = codeFor('U4D');
        await page.setViewportSize({ width: 560, height: 900 });
        await openApp(page);
        await openDashboard(page);
        await nowList(page).getByText(SEEDED_FAULT, { exact: true }).first().click();
        await expect(page.locator('#fault-title')).toBeVisible();
        await expect(nowList(page)).toBeHidden();

        await fail(code, `${code} arrives`);
        await streamBrought(page, 'fault_confirmed', code);

        await expect(toasts(page, `${code} arrives`)).toHaveCount(1);
    });

    test('U5 a fault reported again at a higher severity raises a second toast while the first shows', async ({
        page,
    }) => {
        const code = codeFor('U5');
        const marker = `${code} severity`;
        await openApp(page);

        await fail(code, `${marker} first`, 'warning');
        await expect(toasts(page, marker)).toHaveCount(1);
        await fail(code, `${marker} second`, 'error');
        await streamBrought(page, 'fault_updated', code, 'second');

        await expect(toasts(page, marker)).toHaveCount(2);
    });

    test('U6 an open fault reported again with a new description raises no second toast', async ({ page }) => {
        const code = codeFor('U6');
        await openApp(page);

        await fail(code, `${code} first words`);
        const first = toasts(page, `${code} first words`);
        await expect(first).toHaveCount(1);
        // A toast still up under the same id would drop a second one whatever the app does.
        await first.locator('.Toastify__close-button').click();
        await expect(first).toHaveCount(0);
        await fail(code, `${code} second words`);
        await streamBrought(page, 'fault_updated', code, 'second words');
        await page.waitForTimeout(SETTLE_MS);

        await expectNone(toasts(page, `${code} second words`));
    });
});

test.describe('a list read while the stream reports', () => {
    test('U7 a new description of an open fault does not drop a read that knows a healed one', async ({ page }) => {
        const open = codeFor('U7_OPEN');
        const healed = codeFor('U7_HEALED');
        await fail(open, `${open} first words`);
        await openApp(page);
        await openDashboard(page);
        await expect(nowList(page).getByText(open, { exact: true })).toBeVisible();

        // The stream tells a healed fault by dropping its row, so the page does not hold it
        // until a read brings it.
        await fail(healed, `${healed} fails`);
        await pass(healed);
        await streamBrought(page, 'fault_cleared', healed);
        await page.getByRole('button', { name: 'History' }).click();
        await expect(historyList(page)).toBeVisible();
        await expectNone(historyList(page).getByText(healed, { exact: true }));

        const read = await holdNextListRead(page);
        await askForListRead(page);
        await read.arrived;
        await read.answer();
        await fail(open, `${open} second words`);
        await streamBrought(page, 'fault_updated', open, 'second words');
        read.release();

        await expect(historyList(page).getByText(healed, { exact: true })).toBeVisible({ timeout: 10_000 });
    });

    test('U8 a fault cleared while a read that knows it is out does not come back', async ({ page }) => {
        const code = codeFor('U8');
        await openApp(page);
        await openDashboard(page);

        const read = await holdNextListRead(page);
        await askForListRead(page);
        await read.arrived;
        await fail(code, `${code} appears`);
        await expect(nowList(page).getByText(code, { exact: true })).toBeVisible();
        await read.answer();
        await callFaultManager('clear_fault', { fault_code: code });
        await streamBrought(page, 'fault_cleared', code);
        await expect(nowList(page).getByText(code, { exact: true })).toBeHidden();
        read.release();
        await page.waitForTimeout(SETTLE_MS);

        await expectNone(nowList(page).getByText(code, { exact: true }));
    });
});

test.describe('the page of a healed fault', () => {
    test('U9 says Healed, with no duration, of a fault reported once', async ({ page }) => {
        const code = codeFor('U9');
        await fail(code, `${code} once`);
        await pass(code);
        await openApp(page);
        await page.getByRole('button', { name: /Faults Dashboard/ }).click();
        await page.getByRole('button', { name: 'History' }).click();
        // The replayed heal dropped the row; a read brings it back.
        await askForListRead(page);

        await historyList(page).getByText(code, { exact: true }).click();

        const heading = page.locator('header', { has: page.locator('#fault-title') });
        await expect(heading.getByText('Healed', { exact: true })).toBeVisible();
        await expect(heading).not.toContainText('Healed after');
    });
});
