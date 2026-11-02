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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Operation } from '@/lib/types';
import { OperationsPanel } from './OperationsPanel';

const CALIBRATE: Operation = {
    name: 'calibrate',
    path: '/powertrain/engine/calibrate',
    type: 'std_srvs/srv/Trigger',
    kind: 'service',
};

const mockState = {
    operations: new Map<string, Operation[]>([['engine', [CALIBRATE]]]),
    isLoadingOperations: false,
    operationsErrors: new Map<string, string>(),
    fetchOperations: vi.fn(),
    createExecution: vi.fn(),
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

describe('OperationsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.operationsErrors = new Map();
    });

    it('says the operations could not be read, never that the entity has none, and reads again on Retry', async () => {
        const user = userEvent.setup();
        mockState.operationsErrors = new Map([['lidar', 'Service unavailable']]);
        render(<OperationsPanel entityId="lidar" entityType="apps" />);

        expect(screen.getByRole('alert')).toHaveTextContent('Could not load operations: Service unavailable');
        expect(screen.queryByText('No operations available')).not.toBeInTheDocument();

        mockState.fetchOperations.mockClear();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(mockState.fetchOperations).toHaveBeenCalledWith('lidar', 'apps');
    });

    it('opens an operation from the keyboard: its row is a button that says whether it is open', async () => {
        const user = userEvent.setup();
        render(<OperationsPanel entityId="engine" entityType="apps" />);

        const row = screen.getByRole('button', { name: /calibrate/ });
        expect(row).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', { name: /Call Service/ })).not.toBeInTheDocument();

        // Reached with Tab like any control: Refresh first, then the row
        for (let presses = 0; presses < 5 && document.activeElement !== row; presses++) await user.tab();
        expect(row).toHaveFocus();
        await user.keyboard('{Enter}');

        expect(row).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: /Call Service/ })).toBeInTheDocument();

        await user.keyboard(' ');
        expect(row).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens the operation the page is about', () => {
        render(<OperationsPanel entityId="engine" entityType="apps" highlightOperation="calibrate" />);

        expect(screen.getByRole('button', { name: /calibrate/ })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: /Call Service/ })).toBeInTheDocument();
    });
});
