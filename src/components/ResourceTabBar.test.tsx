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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertTriangle, Database, Zap } from 'lucide-react';
import { ResourceTabBar, type ResourceTabBarTab } from './ResourceTabBar';

type Tab = 'data' | 'operations' | 'faults';

const TABS: ResourceTabBarTab<Tab>[] = [
    { id: 'data', label: 'Data', icon: Database },
    { id: 'operations', label: 'Operations', icon: Zap },
    { id: 'faults', label: 'Faults', icon: AlertTriangle },
];

describe('ResourceTabBar', () => {
    it('marks the open tab as pressed and reports the tab pressed', async () => {
        const onTabChange = vi.fn();
        render(<ResourceTabBar tabs={TABS} activeTab="operations" onTabChange={onTabChange} />);

        expect(screen.getByRole('button', { name: 'Operations' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-pressed', 'false');

        await userEvent.click(screen.getByRole('button', { name: 'Faults' }));
        expect(onTabChange).toHaveBeenCalledWith('faults');
    });

    it('shows a count only above zero', () => {
        render(
            <ResourceTabBar
                tabs={TABS}
                activeTab="data"
                onTabChange={() => {}}
                counts={{ data: 3, operations: 0 }}
                alarmTab="faults"
            />
        );

        expect(screen.getByRole('button', { name: /^Data\s*3$/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Operations' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Faults' })).toBeInTheDocument();
    });

    it('reads the alarm tab count in the fault colour and the others quiet', () => {
        render(
            <ResourceTabBar
                tabs={TABS}
                activeTab="data"
                onTabChange={() => {}}
                counts={{ data: 2, faults: 1 }}
                alarmTab="faults"
            />
        );

        expect(screen.getByText('1')).toHaveClass('text-state-fault-text');
        expect(screen.getByText('2')).not.toHaveClass('text-state-fault-text');
    });

    it('shows the first tab as open when the open tab is not among the tabs', () => {
        render(<ResourceTabBar tabs={TABS} activeTab={'scripts' as Tab} onTabChange={() => {}} />);

        expect(screen.getByRole('button', { name: 'Data' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    });
});
