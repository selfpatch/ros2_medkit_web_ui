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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { restoreWindowWidth, stubWindowWidth } from '@/test/window-width';
import App from './App';

// The shell around the views is what is under test: the views stand in with the fold buttons
// they really carry (the sidebar's Hide beside the wordmark, a view's Show on its top line).
vi.mock('@/components/EntityTreeSidebar', async () => {
    const { SidebarToggle } = await import('@/components/SidebarToggle');
    return {
        EntityTreeSidebar: () => (
            <aside>
                <SidebarToggle />
                <button type="button">Faults Dashboard</button>
            </aside>
        ),
    };
});
vi.mock('@/components/EntityDetailPanel', async () => {
    const { SidebarLine } = await import('@/components/SidebarToggle');
    return {
        EntityDetailPanel: () => (
            <main>
                <SidebarLine />
                <button type="button">A control in the view</button>
            </main>
        ),
    };
});
vi.mock('@/components/ServerConnectionDialog', () => ({ ServerConnectionDialog: () => null }));
vi.mock('@/components/SearchCommand', () => ({ SearchCommand: () => null }));

const storeState = {
    isConnected: true,
    serverUrl: null,
    connect: vi.fn(),
    clearSelection: vi.fn(),
    selectedPath: null,
};

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (state: typeof storeState) => unknown) => selector(storeState)),
}));

function pressFoldShortcut() {
    act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash', key: '\\', ctrlKey: true }));
    });
}

describe('App - folding the sidebar keeps keyboard focus', () => {
    beforeEach(() => {
        localStorage.clear();
        stubWindowWidth(true);
    });

    afterEach(() => restoreWindowWidth());

    it('hands focus from Hide to Show and back when the buttons are pressed', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
        expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
        expect(screen.getByRole('button', { name: 'Hide sidebar' })).toHaveFocus();
    });

    it('takes focus out of the sidebar when the shortcut folds it away from inside', () => {
        render(<App />);
        screen.getByRole('button', { name: 'Faults Dashboard' }).focus();

        pressFoldShortcut();

        expect(screen.getByRole('button', { name: 'Show sidebar' })).toHaveFocus();
    });

    it('leaves focus in the view where the shortcut was pressed, both ways', () => {
        render(<App />);
        const control = screen.getByRole('button', { name: 'A control in the view' });
        control.focus();

        pressFoldShortcut();
        expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeInTheDocument();
        expect(control).toHaveFocus();

        pressFoldShortcut();
        expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();
        expect(control).toHaveFocus();
    });

    it('puts focus on the sidebar when it comes back with nothing focused', () => {
        render(<App />);
        pressFoldShortcut();
        (document.activeElement as HTMLElement | null)?.blur();

        pressFoldShortcut();

        expect(screen.getByRole('button', { name: 'Hide sidebar' })).toHaveFocus();
    });
});
