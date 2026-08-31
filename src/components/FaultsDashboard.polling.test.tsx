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
 * The dashboard and the sidebar badge read the same fault list. These tests pin
 * what the user sees while that list refreshes: the page must not fall back to
 * its first-load skeleton, and the two views must not each ask the gateway
 * separately.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { FaultsDashboard, FaultsCountBadge } from './FaultsDashboard';
import { useAppStore } from '@/lib/store';

const POLL_INTERVAL_MS = 5000;

const RAW_FAULT = {
    fault_code: 'LIDAR_RANGE_INVALID',
    description: 'range invalid',
    severity: 2,
    severity_label: 'ERROR',
    status: 'CONFIRMED',
    first_occurred: 1756636800,
    last_occurred: 1756636800,
    occurrence_count: 1,
    reporting_sources: ['/lidar_driver'],
};

function clientReturning(items: unknown[]) {
    return {
        GET: vi.fn(async () => {
            await Promise.resolve();
            return { data: { items }, error: undefined };
        }),
    };
}

/** Records every DOM state the user could have seen while `run` executed. */
async function framesDuring(container: HTMLElement, run: () => Promise<void>): Promise<string[]> {
    const frames: string[] = [];
    const record = () => frames.push(container.querySelectorAll('.animate-pulse').length > 0 ? 'skeleton' : 'content');
    const observer = new MutationObserver(record);
    observer.observe(container, { childList: true, subtree: true });
    await run();
    if (observer.takeRecords().length > 0) {
        record();
    }
    observer.disconnect();
    return frames;
}

/** Renders and lets the refresh the mount starts finish, so nothing settles outside act. */
async function mount(ui: ReactElement): Promise<RenderResult> {
    let result!: RenderResult;
    await act(async () => {
        result = render(ui);
        await vi.advanceTimersByTimeAsync(0);
    });
    return result;
}

/** Lets everything already scheduled run: timers due now, and the promises they start. */
async function settle() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

/** Moves time forward, letting each tick's request settle before the next one fires. */
async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function connect(client: ReturnType<typeof clientReturning>, sseActive: boolean) {
    useAppStore.setState({
        isConnected: true,
        client,
        faults: [],
        isLoadingFaults: false,
        faultsLoaded: false,
        faultStreamCleanup: sseActive ? () => {} : null,
    } as never);
}

beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
    // Wrapped: this hook runs while the views are still mounted (Testing Library's
    // own cleanup is registered earlier and so runs after this one), and an
    // unwrapped store write would land on them outside act.
    act(() => {
        useAppStore.setState({ isConnected: false, client: null, faults: [], faultStreamCleanup: null } as never);
    });
    vi.useRealTimers();
});

describe('FaultsDashboard refresh behaviour', () => {
    it('never falls back to the first-load skeleton once the empty list has loaded', async () => {
        connect(clientReturning([]), false);
        const { container } = await mount(<FaultsDashboard />);

        const frames = await framesDuring(container, () => advance(POLL_INTERVAL_MS));

        expect(frames).not.toContain('skeleton');
    });

    it('never falls back to the skeleton when the tab regains focus', async () => {
        connect(clientReturning([]), true);
        const { container } = await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );

        const frames = await framesDuring(container, async () => {
            await act(async () => {
                document.dispatchEvent(new Event('visibilitychange'));
                await Promise.resolve();
            });
            await settle();
        });

        expect(frames).not.toContain('skeleton');
    });

    it('still shows the skeleton for the very first load', async () => {
        connect(clientReturning([RAW_FAULT]), false);
        const { container } = render(<FaultsDashboard />);

        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

        await settle();
        expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    });

    it('asks the gateway once per interval even with the badge and the dashboard mounted', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        expect(client.GET).toHaveBeenCalledTimes(1);

        await advance(POLL_INTERVAL_MS);
        expect(client.GET).toHaveBeenCalledTimes(2);

        await advance(POLL_INTERVAL_MS * 2);
        expect(client.GET).toHaveBeenCalledTimes(4);
    });

    it('does not poll while the fault stream delivers updates', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        const afterMount = client.GET.mock.calls.length;

        await advance(POLL_INTERVAL_MS * 3);

        expect(client.GET.mock.calls.length).toBe(afterMount);
    });

    it('reads the list when a second view opens on top of one already mounted', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        await mount(<FaultsCountBadge />);
        expect(client.GET).toHaveBeenCalledTimes(1);

        // The badge lives in the sidebar for the whole session, so the dashboard is
        // always the second view. Opening it has to show the list as it is now.
        await mount(<FaultsDashboard />);

        expect(client.GET).toHaveBeenCalledTimes(2);
    });

    it('reads the list as soon as the fault stream stops delivering', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        const whileStreaming = client.GET.mock.calls.length;

        // The stream dying is the one moment the client knows it has missed events.
        await act(async () => {
            useAppStore.setState({ faultStreamCleanup: null } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(client.GET.mock.calls.length).toBe(whileStreaming + 1);
    });

    it('reads from the gateway it is now connected to', async () => {
        const gatewayA = clientReturning([RAW_FAULT]);
        connect(gatewayA, true);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );

        // Connecting elsewhere never clears isConnected, so nothing else re-reads.
        const gatewayB = clientReturning([]);
        await act(async () => {
            useAppStore.setState({ client: gatewayB } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(gatewayB.GET).toHaveBeenCalledTimes(1);
    });

    it('re-reads the list once when a fault is cleared, not twice', async () => {
        const client = {
            ...clientReturning([RAW_FAULT]),
            DELETE: vi.fn(async () => ({ data: undefined, error: undefined })),
        };
        connect(client, true);
        const { container } = await mount(<FaultsDashboard />);
        const readsBeforeClear = client.GET.mock.calls.length;

        const clearButton = container.querySelector('button[title="Clear fault"]') as HTMLElement;
        await act(async () => {
            clearButton.click();
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(client.DELETE).toHaveBeenCalledTimes(1);
        expect(client.GET.mock.calls.length).toBe(readsBeforeClear + 1);
    });

    it('stops polling when the last fault view unmounts', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        const { unmount } = await mount(<FaultsDashboard />);
        const afterMount = client.GET.mock.calls.length;

        await act(async () => {
            unmount();
        });
        await advance(POLL_INTERVAL_MS * 2);

        expect(client.GET.mock.calls.length).toBe(afterMount);
    });
});
