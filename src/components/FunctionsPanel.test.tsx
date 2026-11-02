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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FunctionsPanel } from './FunctionsPanel';

vi.mock('@/components/ResourceTabs', async () => {
    const actual = await vi.importActual<typeof import('./ResourceTabs')>('@/components/ResourceTabs');
    return {
        ...actual,
        // The tabs' own panels read on their own; here only which one opens matters
        renderResourceTabContent: (tab: string) => <div data-testid={`tab-${tab}`} />,
    };
});

const mockState = {
    selectEntity: vi.fn(),
    getFunctionHosts: vi.fn(),
    fetchEntityData: vi.fn(),
    fetchEntityOperations: vi.fn(),
    listEntityFaults: vi.fn(),
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

function renderPanel(onNavigate = vi.fn()) {
    render(<FunctionsPanel functionId="navigation" path="/server/navigation" onNavigate={onNavigate} />);
    return onNavigate;
}

describe('FunctionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.getFunctionHosts.mockResolvedValue([
            { id: 'planner', name: 'Planner', href: '/api/v1/apps/planner' },
        ]);
        mockState.fetchEntityData.mockResolvedValue([{ topic: '/plan', type: 'nav_msgs/msg/Path' }]);
        mockState.fetchEntityOperations.mockResolvedValue([]);
        mockState.listEntityFaults.mockResolvedValue({ items: [], count: 0 });
    });

    it('opens a host app and a data item from the keyboard', async () => {
        const user = userEvent.setup();
        const onNavigate = renderPanel();

        await user.click(await screen.findByRole('button', { name: /^Hosts/ }));
        const host = await screen.findByRole('button', { name: /Planner/ });
        host.focus();
        await user.keyboard('{Enter}');
        expect(onNavigate).toHaveBeenLastCalledWith('/apps/planner');

        await user.click(screen.getByRole('button', { name: /^Data/ }));
        screen.getByRole('button', { name: /\/plan/ }).focus();
        await user.keyboard('{Enter}');
        expect(onNavigate).toHaveBeenLastCalledWith('/server/navigation/data/plan');
    });

    it('says the hosts could not be read instead of saying there are none, and reads again on Retry', async () => {
        mockState.getFunctionHosts.mockRejectedValueOnce(new Error('Failed to fetch'));
        const user = userEvent.setup();
        renderPanel();

        // The overview neither counts them as 0 nor says no app implements the function
        const tile = await screen.findByRole('button', { name: /Host Apps/ });
        await screen.findByText('Could not load hosts: Failed to fetch');
        expect(within(tile).getByText('-')).toBeInTheDocument();
        expect(screen.queryByText(/No host apps are implementing/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Hosts/ }));
        expect(screen.getByText('Could not load hosts: Failed to fetch')).toBeInTheDocument();
        expect(screen.queryByText(/No host apps found/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('button', { name: /Planner/ })).toBeInTheDocument();
        expect(mockState.getFunctionHosts).toHaveBeenCalledTimes(2);
    });

    it('says which other resources could not be read, each on its own tab', async () => {
        mockState.fetchEntityData.mockRejectedValue(new Error('Bad gateway'));
        mockState.fetchEntityOperations.mockRejectedValue(new Error('Gateway timeout'));
        mockState.listEntityFaults.mockRejectedValue('connection reset');
        const user = userEvent.setup();
        renderPanel();

        await user.click(await screen.findByRole('button', { name: /^Data/ }));
        expect(await screen.findByText('Could not load data items: Bad gateway')).toBeInTheDocument();
        expect(screen.queryByText(/No data items available/)).not.toBeInTheDocument();

        // Those tabs hold panels that read and report their own resource: one message, theirs
        await user.click(screen.getByRole('button', { name: /^Operations/ }));
        expect(screen.getByTestId('tab-operations')).toBeInTheDocument();
        expect(screen.queryByText(/Could not load operations/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Faults/ }));
        expect(screen.getByTestId('tab-faults')).toBeInTheDocument();
        expect(screen.queryByText(/Could not load faults/)).not.toBeInTheDocument();
    });
});
