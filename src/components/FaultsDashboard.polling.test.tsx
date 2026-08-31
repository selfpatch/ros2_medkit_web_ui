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
import { render, act } from '@testing-library/react';
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

async function settle() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function advance(ms: number) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        await Promise.resolve();
    });
    await settle();
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
    vi.useRealTimers();
    useAppStore.setState({ isConnected: false, client: null, faults: [], faultStreamCleanup: null } as never);
});

describe('FaultsDashboard refresh behaviour', () => {
    it('never falls back to the first-load skeleton once the empty list has loaded', async () => {
        connect(clientReturning([]), false);
        const { container } = render(<FaultsDashboard />);
        await settle();

        const frames = await framesDuring(container, () => advance(POLL_INTERVAL_MS));

        expect(frames).not.toContain('skeleton');
    });

    it('never falls back to the skeleton when the tab regains focus', async () => {
        connect(clientReturning([]), true);
        const { container } = render(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        await settle();

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
        render(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        await settle();
        expect(client.GET).toHaveBeenCalledTimes(1);

        await advance(POLL_INTERVAL_MS);
        expect(client.GET).toHaveBeenCalledTimes(2);

        await advance(POLL_INTERVAL_MS * 2);
        expect(client.GET).toHaveBeenCalledTimes(4);
    });

    it('does not poll while the fault stream delivers updates', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        render(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        await settle();
        const afterMount = client.GET.mock.calls.length;

        await advance(POLL_INTERVAL_MS * 3);

        expect(client.GET.mock.calls.length).toBe(afterMount);
    });

    it('stops polling when the last fault view unmounts', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        const { unmount } = render(<FaultsDashboard />);
        await settle();
        const afterMount = client.GET.mock.calls.length;

        unmount();
        await advance(POLL_INTERVAL_MS * 2);

        expect(client.GET.mock.calls.length).toBe(afterMount);
    });
});
