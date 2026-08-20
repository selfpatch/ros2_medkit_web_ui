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
 * were keyed by code alone: expanding one row opened both, and clearing the
 * second row cleared the first entity's fault.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FaultsDashboard } from './FaultsDashboard';
import type { Fault } from '@/lib/types';

const mockFetchFaults = vi.fn();
const mockClearFault = vi.fn();
const mockGetFaultWithEnvironmentData = vi.fn();

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
    storeState = {
        faults: [fault('app_a'), fault('app_b')],
        isLoadingFaults: false,
        faultsError: null,
        fetchFaults: mockFetchFaults,
        clearFault: mockClearFault,
        getFaultWithEnvironmentData: mockGetFaultWithEnvironmentData,
        isConnected: true,
    };
});

describe('FaultsDashboard with colliding fault codes', () => {
    it('expands only the clicked row and fetches only its entity', async () => {
        render(<FaultsDashboard />);
        // Flat list view: the grouped default splits by entity, which would
        // hide the collision the caches must survive.
        fireEvent.click(screen.getByRole('switch', { name: /group by entity/i }));

        const rows = screen.getAllByText('LIDAR_RANGE_INVALID');
        expect(rows).toHaveLength(2);
        fireEvent.click(rows[0]!);

        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(1));
        expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledWith('apps', 'app_a', 'LIDAR_RANGE_INVALID');
        // The sibling with the same code stays collapsed: exactly one row shows
        // the expanded empty-environment marker.
        await waitFor(() => expect(screen.getAllByText(/no environment data available/i)).toHaveLength(1));
    });

    it("clears the clicked row's entity, not the first entity with that code", async () => {
        render(<FaultsDashboard />);
        fireEvent.click(screen.getByRole('switch', { name: /group by entity/i }));

        const clearButtons = screen.getAllByTitle('Clear fault');
        expect(clearButtons).toHaveLength(2);
        fireEvent.click(clearButtons[1]!);

        await waitFor(() => expect(mockClearFault).toHaveBeenCalledTimes(1));
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app_b', 'LIDAR_RANGE_INVALID');
    });

    it('keeps evidence on screen when a refetch answers 404 (null)', async () => {
        mockGetFaultWithEnvironmentData
            .mockResolvedValueOnce({
                environment_data: { snapshots: [{ type: 'freeze_frame', name: 'ff', data: { level: 82 } }] },
            })
            .mockResolvedValueOnce(null);
        render(<FaultsDashboard />);
        fireEvent.click(screen.getByRole('switch', { name: /group by entity/i }));

        const row = screen.getAllByText('LIDAR_RANGE_INVALID')[0]!;
        fireEvent.click(row);
        await waitFor(() => expect(screen.getByText(/snapshots \(1\)/i)).toBeInTheDocument());

        // Collapse, re-expand: the second fetch resolves null (the store's
        // documented 404 shape). The cached evidence must survive it.
        fireEvent.click(row);
        fireEvent.click(row);
        await waitFor(() => expect(mockGetFaultWithEnvironmentData).toHaveBeenCalledTimes(2));
        expect(screen.getByText(/snapshots \(1\)/i)).toBeInTheDocument();
    });
});
