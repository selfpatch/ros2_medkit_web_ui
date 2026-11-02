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
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppsPanel } from './AppsPanel';

vi.mock('@/components/ResourceTabs', async () => {
    const actual = await vi.importActual<typeof import('./ResourceTabs')>('@/components/ResourceTabs');
    return {
        ...actual,
        // The tabs' own panels read on their own; here only which one opens matters
        renderResourceTabContent: (tab: string) =>
            tab === 'scripts' ? (
                actual.renderResourceTabContent(tab, 'talker', 'apps')
            ) : (
                <div data-testid={`tab-${tab}`} />
            ),
    };
});

vi.mock('@/components/ScriptsPanel', () => ({
    ScriptsPanel: ({ entityId, entityType }: { entityId: string; entityType: string }) => (
        <div data-testid="scripts-panel">{`${entityType}:${entityId}`}</div>
    ),
}));

const mockState = {
    selectEntity: vi.fn(),
    configurations: new Map<string, unknown[]>(),
    fetchEntityData: vi.fn().mockResolvedValue([]),
    fetchEntityOperations: vi.fn().mockResolvedValue([]),
    listEntityFaults: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    scriptsSupported: false,
    // EntityStatusControl reads these from the store; inert values keep the
    // control mounted without reaching the network.
    client: null,
    statusByEntity: {},
    actuationByEntity: {},
    watchEntityStatus: vi.fn(() => () => {}),
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector) => selector(mockState)),
    entityStatusKey: (entityType: string, entityId: string) => `${entityType}:${entityId}`,
}));

function renderAppsPanel(overrides: Partial<typeof mockState> = {}) {
    Object.assign(mockState, { scriptsSupported: false }, overrides);
    // App.tsx wraps the tree in a TooltipProvider, and the panel renders a
    // tooltip for any lifecycle action the current status does not allow.
    return render(
        <TooltipProvider>
            <AppsPanel appId="talker" path="/server/ecu/talker" />
        </TooltipProvider>
    );
}

describe('AppsPanel scripts tab', () => {
    beforeEach(() => vi.clearAllMocks());

    it('hides the Scripts tab when the gateway does not report the capability', async () => {
        renderAppsPanel({ scriptsSupported: false });
        // Let the mount-time loadAppData effect settle before asserting, so its
        // state updates don't land after the test body returns (act() warning).
        await waitFor(() => {
            expect(screen.queryByText(/Loading app resources/i)).not.toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /scripts/i })).not.toBeInTheDocument();
    });

    it('shows the Scripts tab and renders its content when the capability is reported', async () => {
        renderAppsPanel({ scriptsSupported: true });
        await userEvent.click(screen.getByRole('button', { name: /scripts/i }));
        expect(screen.getByTestId('scripts-panel')).toHaveTextContent('apps:talker');
    });
});

describe('AppsPanel resources that cannot be read', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.fetchEntityData.mockResolvedValue([]);
        mockState.fetchEntityOperations.mockResolvedValue([]);
        mockState.listEntityFaults.mockResolvedValue({ items: [], count: 0 });
    });

    it('says the topics could not be read, not that there are none, and reads them again on Retry', async () => {
        mockState.fetchEntityData
            .mockRejectedValueOnce(new Error('Failed to fetch'))
            .mockResolvedValueOnce([{ topic: '/chatter', type: 'std_msgs/msg/String', isPublisher: true }]);
        const user = userEvent.setup();
        renderAppsPanel();

        await user.click(screen.getByRole('button', { name: /^Data/ }));
        expect(await screen.findByText('Could not load topics: Failed to fetch')).toBeInTheDocument();
        expect(screen.queryByText(/No topics available/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByRole('button', { name: /\/chatter/ })).toBeInTheDocument();
        expect(screen.queryByText(/Could not load topics/)).not.toBeInTheDocument();
        expect(mockState.fetchEntityData).toHaveBeenCalledTimes(2);
    });

    it('keeps one failed resource apart from the ones that answered', async () => {
        mockState.fetchEntityData.mockResolvedValue([{ topic: '/chatter', isPublisher: true }]);
        mockState.fetchEntityOperations.mockRejectedValue(new Error('Gateway timeout'));
        mockState.listEntityFaults.mockRejectedValue('connection reset');
        const user = userEvent.setup();
        renderAppsPanel();

        // The topics still count on their tab; the failed ones show no count at all, not 0
        expect(await screen.findByRole('button', { name: /^Data\s*1$/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Operations$/ })).toBeInTheDocument();

        // Those tabs hold panels that read and report their own resource: one message, theirs
        await user.click(screen.getByRole('button', { name: /^Operations/ }));
        expect(screen.getByTestId('tab-operations')).toBeInTheDocument();
        expect(screen.queryByText(/Could not load operations/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Faults/ }));
        expect(screen.getByTestId('tab-faults')).toBeInTheDocument();
        expect(screen.queryByText(/Could not load faults/)).not.toBeInTheDocument();
    });

    it('does not claim there are no topics while they are still being read', async () => {
        mockState.fetchEntityData.mockReturnValue(new Promise(() => {}));
        const user = userEvent.setup();
        renderAppsPanel();

        await user.click(screen.getByRole('button', { name: /^Data/ }));

        expect(screen.getByText(/Loading app resources/)).toBeInTheDocument();
        expect(screen.queryByText(/No topics available/)).not.toBeInTheDocument();
    });
});
