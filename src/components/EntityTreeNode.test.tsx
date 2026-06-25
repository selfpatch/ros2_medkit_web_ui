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
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), warning: vi.fn() },
}));

import { useAppStore } from '@/lib/store';
import { EntityTreeNode } from './EntityTreeNode';

describe('EntityTreeNode lifecycle lamp', () => {
    beforeEach(() => {
        useAppStore.setState({
            statusByEntity: {},
            expandedPaths: [],
            loadingPaths: [],
            selectedPath: null,
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('app node fetches status on mount and renders a lamp from the cache', () => {
        const fetchEntityStatus = vi.fn();
        useAppStore.setState({ statusByEntity: { 'apps:talker': 'ready' }, fetchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/server/h/talker' } as never}
                depth={0}
            />
        );
        expect(fetchEntityStatus).toHaveBeenCalledWith('apps', 'talker');
        expect(screen.getByLabelText(/status: ready/i)).toBeInTheDocument();
    });

    it('component node fetches status on mount mapped to the plural resource type', () => {
        const fetchEntityStatus = vi.fn();
        useAppStore.setState({ statusByEntity: { 'components:host1': 'notReady' }, fetchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'host1', name: 'host1', type: 'component', path: '/server/host1' } as never}
                depth={0}
            />
        );
        expect(fetchEntityStatus).toHaveBeenCalledWith('components', 'host1');
        expect(screen.getByLabelText(/status: notReady/i)).toBeInTheDocument();
    });

    it('area node renders no lamp and triggers no status fetch', () => {
        const fetchEntityStatus = vi.fn();
        useAppStore.setState({ fetchEntityStatus } as never);
        render(<EntityTreeNode node={{ id: 'nav', name: 'nav', type: 'area', path: '/nav' } as never} depth={0} />);
        expect(fetchEntityStatus).not.toHaveBeenCalled();
        expect(screen.queryByLabelText(/status:/i)).not.toBeInTheDocument();
    });
});
