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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarContext } from '@/hooks/useSidebarFold';
import { EntityToolbar } from './EntityToolbar';

const CRUMBS = [
    { label: 'server', path: '/server' },
    { label: 'powertrain', path: '/server/powertrain' },
    { label: 'engine', path: '/server/powertrain/engine' },
];

describe('EntityToolbar', () => {
    afterEach(() => {
        // Drop the layout stand-ins some tests put on the prototype
        delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
        delete (HTMLElement.prototype as { scrollLeft?: number }).scrollLeft;
    });

    it('titles the view with its full name, readable on hover where it is cut', () => {
        render(<EntityToolbar title="/powertrain/engine/temperature_sensor_front_left" kind="topic" />);

        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toHaveTextContent('/powertrain/engine/temperature_sensor_front_left');
        expect(heading).toHaveAttribute('title', '/powertrain/engine/temperature_sensor_front_left');
        expect(screen.getByText('topic')).toBeInTheDocument();
    });

    it('leads through the entities above, each one a way back to it', async () => {
        const onNavigate = vi.fn();
        render(<EntityToolbar crumbs={CRUMBS} onNavigate={onNavigate} title="temperature" />);

        const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
        expect(trail).toHaveTextContent(/server.*powertrain.*engine/);

        await userEvent.click(screen.getByRole('button', { name: 'powertrain' }));
        expect(onNavigate).toHaveBeenCalledWith('/server/powertrain');
    });

    it('scrolls the trail to its end, so the nearest entity shows, and again when it changes', () => {
        const scrolledTo: number[] = [];
        Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 640 });
        Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
            configurable: true,
            get: () => 0,
            set: (value: number) => scrolledTo.push(value),
        });

        const { rerender } = render(<EntityToolbar crumbs={CRUMBS} onNavigate={() => {}} title="temperature" />);
        expect(scrolledTo).toEqual([640]);

        rerender(<EntityToolbar crumbs={[...CRUMBS]} onNavigate={() => {}} title="temperature" />);
        expect(scrolledTo).toEqual([640]);

        rerender(<EntityToolbar crumbs={CRUMBS.slice(0, 2)} onNavigate={() => {}} title="engine" />);
        expect(scrolledTo).toEqual([640, 640]);
    });

    it('offers the way back to a folded sidebar, and nothing while it is open', () => {
        const { rerender } = render(
            <SidebarContext.Provider value={{ folded: false, toggle: () => {} }}>
                <EntityToolbar title="Faults Dashboard" />
            </SidebarContext.Provider>
        );
        expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();

        rerender(
            <SidebarContext.Provider value={{ folded: true, toggle: () => {} }}>
                <EntityToolbar title="Faults Dashboard" />
            </SidebarContext.Provider>
        );
        expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeInTheDocument();
    });

    it('shows the lead and the actions it is given', () => {
        render(
            <EntityToolbar
                title="Faults Dashboard"
                lead={<span>No faults detected</span>}
                actions={<button type="button">Refresh faults</button>}
            />
        );

        expect(screen.getByText('No faults detected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Refresh faults' })).toBeInTheDocument();
    });

    it('takes crumbs only together with the way to follow them', () => {
        // @ts-expect-error crumbs that cannot be followed are not accepted
        const element = <EntityToolbar crumbs={CRUMBS} title="temperature" />;
        expect(element).toBeTruthy();
    });
});
