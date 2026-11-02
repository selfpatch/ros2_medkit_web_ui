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
 * Two entities reporting the SAME fault code, which is legal - a code is only
 * unique within one entity. Everything here failed while the dashboard's caches
 * were keyed by code alone: opening one fault opened both, and clearing the
 * second entity's fault cleared the first entity's.
 *
 * The dashboard is a list beside the picked fault's page: a press on a fault in
 * the list opens its page (and reads it again), and Clear sits on an open fault's
 * line and on its page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaultsDashboard } from './FaultsDashboard';
import type { Fault } from '@/lib/types';

const mockFetchFaults = vi.fn();
const mockClearFault = vi.fn();
const mockGetFaultWithEnvironmentData = vi.fn();
const mockReadFaultTopic = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock('@/lib/store', () => ({
    useAppStore: Object.assign(
        vi.fn((selector?: (s: Record<string, unknown>) => unknown) => (selector ? selector(storeState) : storeState)),
        { getState: () => storeState }
    ),
}));

function fault(entityId: string): Fault {
    return {
        code: 'LIDAR_RANGE_INVALID',
        message: `range invalid on ${entityId}`,
        severity: 'error',
        status: 'active',
        timestamp: '2026-08-20T10:00:00Z',
        entity_id: entityId,
        entity_type: 'app',
    };
}

/** The codes the list shows, in its order */
function listedCodes(): string[] {
    return Array.from(document.querySelectorAll('nav li button code')).map((code) => code.textContent ?? '');
}

/** The faults of one entity, under its heading */
function groupOf(entityId: string) {
    return within(screen.getByRole('group', { name: entityId }));
}

/**
 * Lays the fault's pane out, as a wide screen does: the pane is measured once it is
 * observed, and it has a box (or, with `laidOut` false, the layout hides it).
 */
function layOutPanes(laidOut: boolean) {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            callback: ResizeObserverCallback;
            constructor(callback: ResizeObserverCallback) {
                this.callback = callback;
            }
            observe() {
                this.callback([], this as unknown as ResizeObserver);
            }
            unobserve() {}
            disconnect() {}
        }
    );
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: laidOut ? 1 : 0 } as DOMRectList);
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

beforeEach(() => {
    vi.clearAllMocks();
    mockGetFaultWithEnvironmentData.mockResolvedValue({ environment_data: { snapshots: [] } });
    mockReadFaultTopic.mockResolvedValue({ failed: 'not read in these tests' });
    storeState = {
        faults: [fault('app_a'), fault('app_b')],
        isLoadingFaults: false,
        faultsError: null,
        fetchFaults: mockFetchFaults,
        clearFault: mockClearFault,
        getFaultWithEnvironmentData: mockGetFaultWithEnvironmentData,
        readFaultTopic: mockReadFaultTopic,
        showingFaults: () => () => {},
        isConnected: true,
    };
});

describe('FaultsDashboard with colliding fault codes', () => {
    it('opens only the picked fault and reads only its entity', async () => {
        render(<FaultsDashboard />);

        const rows = screen.getAllByText('LIDAR_RANGE_INVALID');
        expect(rows).toHaveLength(2);
        fireEvent.click(rows[0]!);

        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1));
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledWith('apps', 'app_a', 'LIDAR_RANGE_INVALID');
        // One page opens, and it is app_a's: the sibling with the same code stays a line in the list.
        const page = await screen.findByRole('region', { name: 'Lidar range invalid' });
        expect(within(page).getByText('app_a')).toBeInTheDocument();
        expect(within(page).queryByText('app_b')).not.toBeInTheDocument();
        const picked = (entityId: string) =>
            groupOf(entityId)
                .getAllByRole('button')
                .find((button) => button.textContent?.includes('LIDAR_RANGE_INVALID'));
        expect(picked('app_a')).toHaveAttribute('aria-current', 'true');
        expect(picked('app_b')).not.toHaveAttribute('aria-current');
    });

    it("clears the picked fault's entity, not the first entity with that code", async () => {
        render(<FaultsDashboard />);

        fireEvent.click(screen.getAllByText('LIDAR_RANGE_INVALID')[1]!);
        const page = await screen.findByRole('region', { name: 'Lidar range invalid' });
        fireEvent.click(within(page).getByRole('button', { name: 'Clear' }));

        await waitFor(() => expect(mockClearFault).toHaveBeenCalledTimes(1));
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app_b', 'LIDAR_RANGE_INVALID');
    });

    it("clears from a line the fault of that line's entity", async () => {
        render(<FaultsDashboard />);

        fireEvent.click(groupOf('app_b').getByRole('button', { name: 'Clear fault LIDAR_RANGE_INVALID' }));

        await waitFor(() => expect(mockClearFault).toHaveBeenCalledTimes(1));
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app_b', 'LIDAR_RANGE_INVALID');
        // Clearing is not picking: no page opens for it.
        expect(screen.queryByRole('region', { name: 'Lidar range invalid' })).not.toBeInTheDocument();
    });

    it('offers Clear on the line of an open fault only', () => {
        storeState.faults = [fault('app_a'), { ...fault('app_b'), status: 'healed' }];
        render(<FaultsDashboard />);
        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        expect(screen.queryByRole('button', { name: /Clear fault/ })).not.toBeInTheDocument();
    });

    it('keeps evidence on screen when reading the fault again answers 404 (null)', async () => {
        mockGetFaultWithEnvironmentData
            .mockResolvedValueOnce({
                environment_data: { snapshots: [{ type: 'freeze_frame', name: 'ff', data: { level: 82 } }] },
            })
            .mockResolvedValueOnce(null);
        render(<FaultsDashboard />);

        const row = screen.getAllByText('LIDAR_RANGE_INVALID')[0]!;
        fireEvent.click(row);
        // The snapshot's reading, in its table.
        await waitFor(() => expect(screen.getByRole('rowheader', { name: 'Level' })).toBeInTheDocument());

        // A second press reads the fault again, and that read resolves null (the store's
        // documented 404 shape). The evidence already on screen must survive it.
        fireEvent.click(row);
        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(2));
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByRole('rowheader', { name: 'Level' })).toBeInTheDocument();
        expect(screen.getByText('82')).toBeInTheDocument();
    });
});

describe('FaultsDashboard while a fault ends', () => {
    it('keeps the fault on its page when the stream drops it, and reads the list once to say how it ended', async () => {
        let answer!: () => void;
        mockFetchFaults.mockImplementation((options?: { force?: boolean }) =>
            options?.force ? new Promise<void>((resolve) => (answer = resolve)) : Promise.resolve()
        );
        const forcedReads = () => mockFetchFaults.mock.calls.filter(([options]) => options?.force).length;
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(screen.getAllByText('LIDAR_RANGE_INVALID')[0]!);
        await screen.findByRole('region', { name: 'Lidar range invalid' });

        // The gateway's stream says "cleared" for a fault that healed too, and the list drops it.
        storeState = { ...storeState, faults: [fault('app_b')] };
        rerender(<FaultsDashboard />);

        await waitFor(() => expect(forcedReads()).toBe(1));
        expect(within(screen.getByRole('region', { name: 'Lidar range invalid' })).getByText('app_a')).toBeVisible();

        // The read says it healed: it stays on Now, and its page says so.
        storeState = { ...storeState, faults: [{ ...fault('app_a'), status: 'healed' }, fault('app_b')] };
        await act(async () => answer());
        rerender(<FaultsDashboard />);

        const page = screen.getByRole('region', { name: 'Lidar range invalid' });
        expect(within(page).getByText('Healed')).toBeInTheDocument();
        expect(forcedReads()).toBe(1);
    });

    it('lets the fault go, list and page, when the read says it is gone', async () => {
        let answer!: () => void;
        mockFetchFaults.mockImplementation((options?: { force?: boolean }) =>
            options?.force ? new Promise<void>((resolve) => (answer = resolve)) : Promise.resolve()
        );
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));
        await screen.findByRole('region', { name: 'Lidar range invalid' });

        storeState = { ...storeState, faults: [fault('app_b')] };
        rerender(<FaultsDashboard />);
        await waitFor(() => expect(mockFetchFaults).toHaveBeenCalledWith({ force: true }));
        // The read says what the stream said: it is gone.
        await act(async () => answer());
        rerender(<FaultsDashboard />);

        expect(screen.queryByRole('group', { name: 'app_a' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Lidar range invalid' })).not.toBeInTheDocument();
    });

    it('reads nothing to find out why a fault it cleared is gone', async () => {
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));
        const page = await screen.findByRole('region', { name: 'Lidar range invalid' });

        await act(async () => {
            fireEvent.click(within(page).getByRole('button', { name: 'Clear' }));
        });
        // The list after the clear, without it.
        storeState = { ...storeState, faults: [fault('app_b')] };
        rerender(<FaultsDashboard />);
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockFetchFaults).not.toHaveBeenCalledWith({ force: true });
        expect(screen.queryByRole('group', { name: 'app_a' })).not.toBeInTheDocument();
    });
});

describe('FaultsDashboard on a wide screen', () => {
    it('opens the first fault on its own when the pane shows', async () => {
        layOutPanes(true);
        render(<FaultsDashboard />);

        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1));
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledWith('apps', 'app_a', 'LIDAR_RANGE_INVALID');
        expect(await screen.findByRole('region', { name: 'Lidar range invalid' })).toBeInTheDocument();
    });

    it('reads nothing while the layout hides the pane', async () => {
        layOutPanes(false);
        render(<FaultsDashboard />);
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockGetFaultWithEnvironmentData).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: 'Lidar range invalid' })).not.toBeInTheDocument();
    });

    it('reads an open fault once, not on every pass its node reports while it stays confirmed', async () => {
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));
        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1));

        // Every PASSED report moves last_passed; a confirmed fault stays confirmed through it.
        for (const at of [1755684060, 1755684061, 1755684062]) {
            const passed = { ...fault('app_a'), parameters: { last_passed: at, last_occurred: at - 5 } };
            storeState = { ...storeState, faults: [passed, fault('app_b')] };
            rerender(<FaultsDashboard />);
            await act(async () => {});
        }

        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1);
    });

    it('reads an open fault again every 30 s, and not for a new copy of the same list', async () => {
        vi.useFakeTimers();
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(2);

        // A refresh that changed nothing hands over a new array of the same faults.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        storeState = { ...storeState, faults: [fault('app_a'), fault('app_b')] };
        rerender(<FaultsDashboard />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000);
        });

        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(3);
    });

    it("drops what it read of one gateway's faults when it connects to another", async () => {
        storeState.serverUrl = 'http://robot-a:8080';
        mockGetFaultWithEnvironmentData.mockResolvedValueOnce({
            environment_data: { snapshots: [{ type: 'freeze_frame', name: 'ff', data: { level: 82 } }] },
        });
        const { rerender } = render(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));
        await screen.findByRole('rowheader', { name: 'Level' });

        // The same fault key on the next gateway, whose read is still out.
        mockGetFaultWithEnvironmentData.mockReturnValue(new Promise(() => {}));
        storeState = { ...storeState, serverUrl: 'http://robot-b:8080' };
        rerender(<FaultsDashboard />);
        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));

        expect(await screen.findByText('Reading the fault…')).toBeInTheDocument();
        expect(screen.queryByRole('rowheader', { name: 'Level' })).not.toBeInTheDocument();
    });
});

describe('FaultsDashboard list', () => {
    it('groups the faults under their entity from the start, and lists them flat on request', () => {
        render(<FaultsDashboard />);

        // Under a heading the entity goes without saying: once a group.
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['app_a', 'app_b']);
        expect(groupOf('app_a').getByText('LIDAR_RANGE_INVALID')).toBeInTheDocument();
        expect(groupOf('app_b').getByText('LIDAR_RANGE_INVALID')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('switch', { name: /group by entity/i }));

        // Flat, each line says whose fault it is.
        expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
        const lines = screen.getAllByRole('listitem');
        expect(lines.map((line) => within(line).getByText(/^app_/).textContent)).toEqual(['app_a', 'app_b']);
    });

    it('shows on each line how bad it is, what it says, and when it came', () => {
        render(<FaultsDashboard />);

        const line = groupOf('app_a').getByRole('listitem');
        expect(within(line).getByText('error')).toBeInTheDocument();
        expect(within(line).getByText('range invalid on app_a')).toBeInTheDocument();
        expect(line.querySelector('time')?.getAttribute('datetime')).toBe(
            new Date('2026-08-20T10:00:00Z').toISOString()
        );
        expect(line.querySelector('time')?.textContent).not.toBe('');
    });

    it('dates a fault that came back the way its page does once its details are in', async () => {
        // First reported on the 20th; medkit captured its newest coming on the 21st.
        mockGetFaultWithEnvironmentData.mockResolvedValue({
            environment_data: {
                snapshots: [
                    {
                        type: 'freeze_frame',
                        name: '/scan',
                        data: {},
                        'x-medkit': { topic: '/scan', captured_at: '2026-08-21T09:30:00Z' },
                    },
                ],
            },
        });
        render(<FaultsDashboard />);

        fireEvent.click(groupOf('app_a').getByText('LIDAR_RANGE_INVALID'));

        await waitFor(() =>
            expect(groupOf('app_a').getByRole('listitem').querySelector('time')?.getAttribute('datetime')).toBe(
                new Date('2026-08-21T09:30:00Z').toISOString()
            )
        );
        // A fault whose details are not read keeps its first report.
        expect(groupOf('app_b').getByRole('listitem').querySelector('time')?.getAttribute('datetime')).toBe(
            new Date('2026-08-20T10:00:00Z').toISOString()
        );
    });

    it('counts the open faults by severity beside the tabs, and none it could not check', () => {
        storeState.faults = [
            fault('app_a'),
            fault('app_b'),
            { ...fault('app_c'), severity: 'warning', status: 'pending' },
            { ...fault('app_d'), severity: 'critical', status: 'healed' },
        ];
        const { rerender } = render(<FaultsDashboard />);

        expect(screen.getByText('2 errors')).toBeInTheDocument();
        expect(screen.getByText('1 warning')).toBeInTheDocument();
        // A healed fault is not open, and a severity nothing has is not shown.
        expect(screen.queryByText(/critical/)).not.toBeInTheDocument();
        expect(screen.queryByText(/info/)).not.toBeInTheDocument();

        storeState = { ...storeState, faultsError: 'Failed to get faults' };
        rerender(<FaultsDashboard />);
        expect(screen.queryByText('2 errors')).not.toBeInTheDocument();
    });

    it('filters by severity, and says so when the filters hide every fault', async () => {
        const user = userEvent.setup();
        storeState.faults = [fault('app_a'), { ...fault('app_b'), severity: 'warning' }];
        render(<FaultsDashboard />);

        // The open menu hides the page from assistive tech: each check comes after it closes.
        await user.click(screen.getByRole('button', { name: /Severity/ }));
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Warning' }));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('group', { name: 'app_b' })).not.toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'app_a' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Severity/ })).toHaveTextContent('3/4');

        await user.click(screen.getByRole('button', { name: /Severity/ }));
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Error' }));
        await user.keyboard('{Escape}');

        expect(listedCodes()).toEqual([]);
        expect(screen.getByText('Adjust filters to see more faults')).toBeInTheDocument();
        expect(screen.queryByText('System is operating normally')).not.toBeInTheDocument();
    });

    it('filters by the statuses of the tab it is on', async () => {
        const user = userEvent.setup();
        storeState.faults = [
            fault('app_a'),
            { ...fault('app_b'), status: 'pending' },
            { ...fault('app_c'), status: 'healed' },
            { ...fault('app_d'), status: 'cleared' },
        ];
        render(<FaultsDashboard />);

        await user.click(screen.getByRole('button', { name: /Status/ }));
        expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual(['Active', 'Pending']);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Pending' }));
        await user.keyboard('{Escape}');
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['app_a']);

        await user.click(screen.getByRole('button', { name: 'History' }));
        await user.click(screen.getByRole('button', { name: /Status/ }));
        expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual(['Healed', 'Cleared']);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Cleared' }));
        await user.keyboard('{Escape}');
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['app_c']);
    });

    it('never says the system is fine while the list could not be refreshed', () => {
        storeState.faults = [{ ...fault('app_a'), status: 'healed' }];
        storeState.faultsError = 'Failed to get faults: ListFaults service not available';
        render(<FaultsDashboard />);

        expect(screen.queryByText('System is operating normally')).not.toBeInTheDocument();
        expect(screen.getAllByText('Fault status unknown').length).toBeGreaterThan(0);
    });

    it('says the system is operating normally with no fault at all', () => {
        storeState.faults = [];
        render(<FaultsDashboard />);
        expect(screen.getByText('System is operating normally')).toBeInTheDocument();
    });

    it('keeps ended faults out of Now and lists them in History', () => {
        storeState.faults = [fault('app_a'), { ...fault('app_b'), status: 'healed' }];
        render(<FaultsDashboard />);
        expect(screen.getAllByText('LIDAR_RANGE_INVALID')).toHaveLength(1);
        expect(screen.getByRole('button', { name: /now/i })).toHaveTextContent('1');

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        expect(screen.getAllByText('LIDAR_RANGE_INVALID')).toHaveLength(1);
        expect(screen.getByText('app_b')).toBeInTheDocument();
        expect(screen.queryByText('app_a')).not.toBeInTheDocument();
    });

    it("reads an ended fault's details again on Refresh when they could not be read", async () => {
        storeState.faults = [{ ...fault('app_a'), status: 'healed' }];
        mockGetFaultWithEnvironmentData.mockResolvedValue(null);
        render(<FaultsDashboard />);
        fireEvent.click(screen.getByRole('button', { name: 'History' }));
        fireEvent.click(screen.getByText('LIDAR_RANGE_INVALID'));
        expect(await screen.findByText("This fault's details could not be read.")).toBeInTheDocument();
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTitle('Refresh faults'));

        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(2));
        expect(mockFetchFaults).toHaveBeenCalledWith({ force: true });
    });

    it('lists History by newest report first, and finds faults by entity, code or words', () => {
        const ended = (entityId: string, code: string, lastOccurred: number): Fault => ({
            ...fault(entityId),
            code,
            status: 'healed',
            parameters: { last_occurred: lastOccurred, occurrence_count: 1 },
        });
        storeState.faults = [
            ended('app_a', 'OLDER', 1756636800),
            ended('app_b', 'NEWEST', 1756640000),
            ended('app_c', 'MIDDLE', 1756638000),
        ];
        render(<FaultsDashboard />);
        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        expect(listedCodes()).toEqual(['NEWEST', 'MIDDLE', 'OLDER']);

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search faults' }), { target: { value: 'app_c' } });
        expect(listedCodes()).toEqual(['MIDDLE']);
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search faults' }), { target: { value: 'older' } });
        expect(listedCodes()).toEqual(['OLDER']);
    });
});
