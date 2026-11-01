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
 * the list opens its page (and reads it again), and Clear sits on that page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

beforeEach(() => {
    vi.clearAllMocks();
    mockGetFaultWithEnvironmentData.mockResolvedValue({ environment_data: { snapshots: [] } });
    mockReadFaultTopic.mockResolvedValue(null);
    storeState = {
        faults: [fault('app_a'), fault('app_b')],
        isLoadingFaults: false,
        faultsError: null,
        fetchFaults: mockFetchFaults,
        clearFault: mockClearFault,
        getFaultWithEnvironmentData: mockGetFaultWithEnvironmentData,
        readFaultTopic: mockReadFaultTopic,
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
        expect(screen.getAllByRole('region', { name: 'Lidar range invalid' })).toHaveLength(1);
    });

    it("clears the picked fault's entity, not the first entity with that code", async () => {
        render(<FaultsDashboard />);

        fireEvent.click(screen.getAllByText('LIDAR_RANGE_INVALID')[1]!);
        fireEvent.click(await screen.findByTitle('Clear fault'));

        await waitFor(() => expect(mockClearFault).toHaveBeenCalledTimes(1));
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app_b', 'LIDAR_RANGE_INVALID');
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
});

describe('FaultsDashboard list', () => {
    it('lists each fault under its entity name, and groups them on request', () => {
        render(<FaultsDashboard />);
        expect(screen.getByText('app_a').tagName).toBe('B');

        fireEvent.click(screen.getByRole('switch', { name: /group by entity/i }));

        // Under a heading the entity goes without saying: once a group.
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['app_a', 'app_b']);
        expect(screen.getAllByText('LIDAR_RANGE_INVALID')).toHaveLength(2);
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
});
