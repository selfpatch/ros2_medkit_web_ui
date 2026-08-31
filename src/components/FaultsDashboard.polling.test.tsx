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
const FAULT_STREAM_SAFETY_NET_MS = 30000;

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
function renderedCodes(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.font-mono.text-sm')).map((el) => el.textContent);
}

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

function connect(client: { GET: unknown }, sseActive: boolean) {
    useAppStore.setState({
        isConnected: true,
        client,
        faults: [],
        isLoadingFaults: false,
        faultsLoaded: false,
        faultsError: null,
        // Now a store value, so it outlives a test the way it outlives a page: reset it.
        faultsAutoRefresh: true,
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
        // disconnect, not setState: a read still on the wire is held in module state and
        // would answer for the next test, whose own reads would then never leave.
        useAppStore.getState().disconnect();
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

    it('takes its updates from the stream instead of polling for them', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        const { container } = await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        const afterMount = client.GET.mock.calls.length;

        await act(async () => {
            useAppStore.getState().applyFaultStreamEvent('fault_confirmed', {
                code: 'RAISED_OVER_THE_STREAM',
                message: 'reported without a read',
                severity: 'error',
                status: 'active',
                timestamp: '2026-08-31T10:00:00.000Z',
                entity_id: 'motor',
                entity_type: 'app',
            });
            await vi.advanceTimersByTimeAsync(0);
        });
        // The event alone put it on screen, and it took no request to do so.
        expect(container.textContent).toContain('RAISED_OVER_THE_STREAM');
        expect(client.GET.mock.calls.length).toBe(afterMount);

        // The 5 s poll stays off right up to the safety net.
        await advance(FAULT_STREAM_SAFETY_NET_MS - POLL_INTERVAL_MS);

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

    it('says the gateway could not read faults instead of reporting none', async () => {
        connect(clientReturning([]), true);
        const { container } = await mount(<FaultsDashboard />);
        await act(async () => {
            useAppStore.setState({
                faultsError: 'Failed to get faults: ListFaults service not available',
            } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(container.textContent).toContain('ListFaults service not available');
        expect(container.textContent).not.toContain('System is operating normally');
        expect(container.textContent).not.toContain('No faults detected');
        // "All Clear" is a statement about the system, and the page cannot make it here.
        expect(container.textContent).not.toContain('All Clear');
    });

    it('stops refreshing while Auto-refresh is off, badge included', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );

        const autoRefresh = document.getElementById('auto-refresh') as HTMLElement;
        await act(async () => {
            autoRefresh.click();
            await vi.advanceTimersByTimeAsync(0);
        });
        const afterSwitchOff = client.GET.mock.calls.length;

        await advance(POLL_INTERVAL_MS * 3);

        expect(client.GET.mock.calls.length).toBe(afterSwitchOff);
    });

    it('still checks now and then while the stream is up, in case it delivers nothing', async () => {
        // A gateway can hold the stream open and never send an event - an aggregator
        // that does not fan the stream out to its peers does exactly this. The page
        // would otherwise sit unchanged for the whole session.
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        await mount(<FaultsDashboard />);
        const afterMount = client.GET.mock.calls.length;

        await advance(FAULT_STREAM_SAFETY_NET_MS);

        expect(client.GET.mock.calls.length).toBe(afterMount + 1);
    });

    it('does not let the sidebar badge report a count it could not check', async () => {
        connect(clientReturning([RAW_FAULT]), true);
        const { container } = await mount(<FaultsCountBadge />);
        await act(async () => {
            useAppStore.setState({
                faultsError: 'Failed to get faults: ListFaults service not available',
            } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        // The count it already has is worth keeping - marked as unchecked, not thrown away.
        expect(container.textContent).toBe('1');
        expect(container.querySelector('[title]')?.getAttribute('title')).toContain('could not be checked');
    });

    it('does not refresh twice when the tab is restored just before a tick', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(<FaultsDashboard />);

        await advance(POLL_INTERVAL_MS - 100);
        const beforeFocus = client.GET.mock.calls.length;
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(client.GET.mock.calls.length).toBe(beforeFocus + 1);

        await advance(200);

        expect(client.GET.mock.calls.length).toBe(beforeFocus + 1);
    });

    it('reads the new gateway even if the old one never answered', async () => {
        const silent = { GET: vi.fn(() => new Promise(() => {})) };
        connect(silent, true);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );

        // Connecting elsewhere goes nowhere near disconnect(), and the read left on the
        // wire belongs to a gateway nobody is looking at any more.
        const gatewayB = clientReturning([RAW_FAULT]);
        await act(async () => {
            useAppStore.setState({
                client: gatewayB,
                faults: [],
                faultsLoaded: false,
                faultsError: null,
            } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(gatewayB.GET).toHaveBeenCalledTimes(1);
    });

    it('does not bring the skeleton back while the gateway keeps failing', async () => {
        const refusing = {
            GET: vi.fn(async () => ({
                data: undefined,
                error: { message: 'Failed to get faults', parameters: { details: 'ListFaults service not available' } },
            })),
        };
        connect(refusing, false);
        const { container } = await mount(<FaultsDashboard />);
        expect(container.textContent).toContain('Fault list unavailable');

        const frames = await framesDuring(container, () => advance(POLL_INTERVAL_MS * 2));

        expect(frames).not.toContain('skeleton');
    });

    it('says a list on screen could not be refreshed, and keeps it', async () => {
        let answered = false;
        const failsAfterFirst = {
            GET: vi.fn(async () => {
                if (answered) {
                    return {
                        data: undefined,
                        error: {
                            message: 'Failed to get faults',
                            parameters: { details: 'ListFaults service not available' },
                        },
                    };
                }
                answered = true;
                return { data: { items: [RAW_FAULT] }, error: undefined };
            }),
        };
        connect(failsAfterFirst, false);
        const { container } = await mount(<FaultsDashboard />);
        expect(container.textContent).toContain('LIDAR_RANGE_INVALID');

        await advance(POLL_INTERVAL_MS);

        expect(container.textContent).toContain('Last refresh failed');
        expect(container.textContent).toContain('ListFaults service not available');
        expect(container.textContent).toContain('LIDAR_RANGE_INVALID');
    });

    it('leaves a hidden tab alone', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(<FaultsDashboard />);
        const whileVisible = client.GET.mock.calls.length;

        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        await advance(POLL_INTERVAL_MS * 3);
        hidden.mockRestore();

        expect(client.GET.mock.calls.length).toBe(whileVisible);
    });

    it('shows a question mark only when it knows nothing at all', async () => {
        connect(clientReturning([]), true);
        const { container } = await mount(<FaultsCountBadge />);
        await act(async () => {
            useAppStore.setState({ faultsError: 'Failed to get faults' } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(container.textContent).toBe('?');
    });

    it('keeps Auto-refresh off after leaving the dashboard and coming back', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(<FaultsCountBadge />);
        const dashboard = await mount(<FaultsDashboard />);

        await act(async () => {
            (document.getElementById('auto-refresh') as HTMLElement).click();
            await vi.advanceTimersByTimeAsync(0);
        });
        const afterSwitchOff = client.GET.mock.calls.length;

        // Leaving the dashboard must not quietly start refreshing again.
        await act(async () => {
            dashboard.unmount();
        });
        await advance(POLL_INTERVAL_MS * 2);
        expect(client.GET.mock.calls.length).toBe(afterSwitchOff);

        const reopened = await mount(<FaultsDashboard />);
        expect(reopened.container.querySelector('#auto-refresh')?.getAttribute('data-state')).toBe('unchecked');
    });

    it('does not read the list again when a paused dashboard is reopened', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        await mount(<FaultsCountBadge />);
        const dashboard = await mount(<FaultsDashboard />);
        await act(async () => {
            (document.getElementById('auto-refresh') as HTMLElement).click();
            await vi.advanceTimersByTimeAsync(0);
        });
        const whilePaused = client.GET.mock.calls.length;

        await act(async () => {
            dashboard.unmount();
        });
        await mount(<FaultsDashboard />);

        // Reopening a page the user froze must not move it.
        expect(client.GET.mock.calls.length).toBe(whilePaused);
    });

    it('still reads on mount when nothing has been loaded yet, even paused', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, true);
        useAppStore.setState({ faultsAutoRefresh: false } as never);

        await mount(<FaultsDashboard />);

        // Otherwise a switch left off means an empty page for the rest of the session.
        expect(client.GET).toHaveBeenCalledTimes(1);
    });

    it('does not refresh a paused list when the tab comes back', async () => {
        const client = clientReturning([RAW_FAULT]);
        connect(client, false);
        await mount(
            <>
                <FaultsCountBadge />
                <FaultsDashboard />
            </>
        );
        await act(async () => {
            (document.getElementById('auto-refresh') as HTMLElement).click();
            await vi.advanceTimersByTimeAsync(0);
        });
        const afterSwitchOff = client.GET.mock.calls.length;

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(client.GET.mock.calls.length).toBe(afterSwitchOff);
    });

    it('puts the rows in the same order whichever way they arrived', async () => {
        connect(clientReturning([]), true);
        const older = { ...RAW_FAULT, fault_code: 'A_EARLIER', first_occurred: 1756636800 };
        const newer = { ...RAW_FAULT, fault_code: 'B_LATER', first_occurred: 1756640000 };

        const { container } = await mount(<FaultsDashboard />);
        await act(async () => {
            useAppStore.setState({ client: clientReturning([older, newer]), faultsLoaded: false } as never);
            await useAppStore.getState().fetchFaults({ force: true });
            await vi.advanceTimersByTimeAsync(0);
        });
        const arrivalOrder = renderedCodes(container);

        await act(async () => {
            useAppStore.setState({ client: clientReturning([newer, older]) } as never);
            await useAppStore.getState().fetchFaults({ force: true });
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(renderedCodes(container)).toEqual(arrivalOrder);
    });

    it('keeps an app and a component of the same name in separate groups', async () => {
        connect(clientReturning([]), true);
        const { container } = await mount(<FaultsDashboard />);
        await act(async () => {
            useAppStore.setState({
                faults: [
                    {
                        code: 'OVERHEAT',
                        message: 'app fault',
                        severity: 'error',
                        status: 'active',
                        timestamp: '2026-08-31T10:00:00.000Z',
                        entity_id: 'motor',
                        entity_type: 'app',
                    },
                    {
                        code: 'OVERHEAT',
                        message: 'component fault',
                        severity: 'error',
                        status: 'active',
                        timestamp: '2026-08-31T10:00:00.000Z',
                        entity_id: 'motor',
                        entity_type: 'component',
                    },
                ],
            } as never);
            await vi.advanceTimersByTimeAsync(0);
        });

        // One name, two entities: two groups, each labelled with its own type.
        const groupLabels = Array.from(container.querySelectorAll('.font-medium.text-sm')).map((el) => el.textContent);
        expect(groupLabels.filter((label) => label === 'motor')).toHaveLength(2);
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
