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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EntityDetailPanel } from './EntityDetailPanel';

// Mock heavy child components - we only care about the top-level routing
// (header + tab bar + tab content selection) for these tests.
vi.mock('@/components/DataPanel', () => ({ DataPanel: () => <div data-testid="data-panel" /> }));
vi.mock('@/components/ConfigurationPanel', () => ({ ConfigurationPanel: () => <div data-testid="config-panel" /> }));
vi.mock('@/components/OperationsPanel', () => ({ OperationsPanel: () => <div data-testid="ops-panel" /> }));
vi.mock('@/components/AreasPanel', () => ({ AreasPanel: () => <div data-testid="areas-panel" /> }));
vi.mock('@/components/AppsPanel', () => ({ AppsPanel: () => <div data-testid="apps-panel" /> }));
vi.mock('@/components/FunctionsPanel', () => ({ FunctionsPanel: () => <div data-testid="functions-panel" /> }));
vi.mock('@/components/ServerInfoPanel', () => ({ ServerInfoPanel: () => <div data-testid="server-panel" /> }));
vi.mock('@/components/FaultsDashboard', () => ({ FaultsDashboard: () => <div data-testid="faults-dashboard" /> }));
vi.mock('@/components/UpdatesDashboard', () => ({ UpdatesDashboard: () => <div data-testid="updates-dashboard" /> }));
vi.mock('@/components/EmptyState', () => ({ EmptyState: () => <div data-testid="empty-state" /> }));
vi.mock('@/components/EntityDetailSkeleton', () => ({ EntityDetailSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ResourceTabs', async () => {
    const actual = await vi.importActual<typeof import('./ResourceTabs')>('@/components/ResourceTabs');
    return {
        ...actual,
        renderResourceTabContent: (tab: string) => <div data-testid={`tab-content-${tab}`} />,
    };
});

const mockPrefetchResourceCounts = vi.fn();
const mockFetchEntityData = vi.fn();
const mockSelectEntity = vi.fn();
const mockRefreshSelectedEntity = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => selector(storeState)),
}));

function setStore(overrides: Record<string, unknown>) {
    storeState = {
        selectedPath: null,
        selectedEntity: null,
        isLoadingDetails: false,
        isRefreshing: false,
        isConnected: true,
        selectEntity: mockSelectEntity,
        refreshSelectedEntity: mockRefreshSelectedEntity,
        prefetchResourceCounts: mockPrefetchResourceCounts,
        fetchEntityData: mockFetchEntityData,
        ...overrides,
    };
}

describe('EntityDetailPanel - subcomponent entity type', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrefetchResourceCounts.mockResolvedValue({ data: 0, operations: 0, configurations: 0, faults: 0, logs: 0 });
        mockFetchEntityData.mockResolvedValue([]);
    });

    it('renders resource tabs and fetches counts as components for subcomponent entity', async () => {
        setStore({
            selectedPath: '/server/area1/component1/planning-ecu',
            selectedEntity: {
                id: 'planning-ecu',
                name: 'planning-ecu',
                type: 'subcomponent',
            },
        });

        render(<EntityDetailPanel onConnectClick={() => {}} />);

        // Bug repro: subcomponent should fetch resource counts using the
        // 'components' entity type (gateway routes subcomponents through
        // /api/v1/components/{id}/...).
        await waitFor(() => {
            expect(mockPrefetchResourceCounts).toHaveBeenCalledWith('components', 'planning-ecu', expect.anything());
        });

        // Bug repro: subcomponent should render the resource tab bar
        // (Data / Operations / Config / Faults / Logs) just like a component.
        expect(screen.getByRole('button', { name: /Data/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Operations/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Config/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Faults/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Logs/ })).toBeInTheDocument();

        // The fallback "No detailed information available" must not appear.
        expect(screen.queryByText(/No detailed information available/i)).not.toBeInTheDocument();
    });
});
