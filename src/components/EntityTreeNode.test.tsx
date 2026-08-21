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

    it('app node watches status on mount and renders a lamp from the cache', () => {
        const watchEntityStatus = vi.fn(() => () => {});
        useAppStore.setState({ statusByEntity: { 'apps:talker': 'ready' }, watchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/server/h/talker' } as never}
                depth={0}
            />
        );
        expect(watchEntityStatus).toHaveBeenCalledWith('apps', 'talker');
        expect(screen.getByLabelText(/status: ready/i)).toBeInTheDocument();
    });

    it('component node watches status on mount mapped to the plural resource type', () => {
        const watchEntityStatus = vi.fn(() => () => {});
        useAppStore.setState({ statusByEntity: { 'components:host1': 'notReady' }, watchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'host1', name: 'host1', type: 'component', path: '/server/host1' } as never}
                depth={0}
            />
        );
        expect(watchEntityStatus).toHaveBeenCalledWith('components', 'host1');
        expect(screen.getByLabelText(/status: notReady/i)).toBeInTheDocument();
    });

    it('exposes the lamp to the accessibility tree with a computed name', () => {
        // getByLabelText reads the attribute; getByRole computes the accessible
        // name the way a screen reader does, so it fails on an element whose
        // implicit role forbids aria-label.
        const watchEntityStatus = vi.fn(() => () => {});
        useAppStore.setState({ statusByEntity: { 'apps:talker': 'ready' }, watchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/server/h/talker' } as never}
                depth={0}
            />
        );
        expect(screen.getByRole('img', { name: /status: ready/i })).toBeInTheDocument();
    });

    it('separates ready from notReady by more than colour', () => {
        const watchEntityStatus = vi.fn(() => () => {});
        useAppStore.setState({ statusByEntity: { 'apps:talker': 'ready' }, watchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/a/talker' } as never}
                depth={0}
            />
        );
        const ready = screen.getByRole('img', { name: /status: ready/i }).className;
        cleanup();

        useAppStore.setState({ statusByEntity: { 'apps:talker': 'notReady' }, watchEntityStatus } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/a/talker' } as never}
                depth={0}
            />
        );
        const notReady = screen.getByRole('img', { name: /status: notReady/i }).className;

        // Drop every class carrying a colour token: what is left is the shape,
        // and it has to differ on its own for a colour-blind reader.
        const shapeOf = (cls: string) =>
            cls
                .split(/\s+/)
                .filter((c) => !/emerald|amber|muted-foreground|transparent/.test(c))
                .sort()
                .join(' ');
        expect(shapeOf(ready)).not.toBe(shapeOf(notReady));
    });

    it('area node renders no lamp and watches nothing', () => {
        const watchEntityStatus = vi.fn(() => () => {});
        useAppStore.setState({ watchEntityStatus } as never);
        render(<EntityTreeNode node={{ id: 'nav', name: 'nav', type: 'area', path: '/nav' } as never} depth={0} />);
        expect(watchEntityStatus).not.toHaveBeenCalled();
        expect(screen.queryByLabelText(/status:/i)).not.toBeInTheDocument();
    });
});

describe('EntityTreeNode label', () => {
    beforeEach(() => {
        useAppStore.setState({ statusByEntity: {}, expandedPaths: [], loadingPaths: [], selectedPath: null });
    });
    afterEach(() => cleanup());

    it('shows the entity description as the label when present', () => {
        useAppStore.setState({ fetchEntityStatus: vi.fn() } as never);
        render(
            <EntityTreeNode
                node={
                    {
                        id: 'a3d9',
                        name: 'a3d9',
                        type: 'component',
                        path: '/server/a3d9',
                        description: 'Ubuntu 24.04.4 LTS on x86_64',
                    } as never
                }
                depth={0}
            />
        );
        expect(screen.getByText('Ubuntu 24.04.4 LTS on x86_64')).toBeInTheDocument();
    });

    it('falls back to the name when there is no description', () => {
        useAppStore.setState({ fetchEntityStatus: vi.fn() } as never);
        render(
            <EntityTreeNode
                node={{ id: 'talker', name: 'talker', type: 'app', path: '/x/talker' } as never}
                depth={0}
            />
        );
        expect(screen.getByText('talker')).toBeInTheDocument();
    });
});
