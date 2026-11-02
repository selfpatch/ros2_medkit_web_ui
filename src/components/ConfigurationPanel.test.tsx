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
import { ConfigurationPanel } from './ConfigurationPanel';
import type { Parameter } from '@/lib/types';

const mockState = {
    configurations: new Map<string, Parameter[]>(),
    isLoadingConfigurations: false,
    configurationsErrors: new Map<string, string>(),
    fetchConfigurations: vi.fn(),
    setParameter: vi.fn(),
    resetParameter: vi.fn(),
    resetAllConfigurations: vi.fn(),
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (state: typeof mockState) => unknown) => selector(mockState)),
}));

describe('ConfigurationPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.configurationsErrors = new Map();
    });

    it('says the parameters could not be read, never that there are none, and reads again on Retry', async () => {
        const user = userEvent.setup();
        mockState.configurationsErrors = new Map([['lidar', 'Service unavailable']]);
        render(<ConfigurationPanel entityId="lidar" entityType="apps" />);

        expect(screen.getByRole('alert')).toHaveTextContent('Could not load parameters: Service unavailable');
        expect(screen.queryByText(/No parameters available/)).not.toBeInTheDocument();

        mockState.fetchConfigurations.mockClear();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(mockState.fetchConfigurations).toHaveBeenCalledWith('lidar', 'apps');
    });

    it('says there are no parameters when the read succeeded with none', () => {
        render(<ConfigurationPanel entityId="lidar" entityType="apps" />);

        expect(screen.getByText(/No parameters available/)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
