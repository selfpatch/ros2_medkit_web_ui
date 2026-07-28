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
import { AppsPanel } from './AppsPanel';

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
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector) => selector(mockState)),
}));

function renderAppsPanel(overrides: Partial<typeof mockState> = {}) {
    Object.assign(mockState, { scriptsSupported: false }, overrides);
    return render(<AppsPanel appId="talker" appName="Talker" path="/server/ecu/talker" />);
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
