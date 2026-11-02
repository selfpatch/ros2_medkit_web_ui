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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RowGrid } from './RowGrid';

describe('RowGrid', () => {
    it('fits as many columns as the room holds, none narrower than minColumn', () => {
        render(
            <RowGrid data-testid="grid" minColumn="20rem">
                <div>row</div>
            </RowGrid>
        );

        const grid = screen.getByTestId('grid');
        expect(grid).toHaveClass('grid-cols-[repeat(auto-fit,minmax(min(100%,var(--row-grid-min)),1fr))]');
        expect(grid.style.getPropertyValue('--row-grid-min')).toBe('20rem');
    });

    it('keeps one column when asked, with no automatic template', () => {
        render(
            <RowGrid data-testid="grid" columns={1}>
                <div>row</div>
            </RowGrid>
        );

        const grid = screen.getByTestId('grid');
        expect(grid).toHaveClass('grid-cols-1');
        expect(grid.style.getPropertyValue('--row-grid-min')).toBe('');
    });

    it('renders facts as a description list and keeps a caller style', () => {
        render(
            <RowGrid as="dl" data-testid="grid" style={{ maxWidth: '40rem' }}>
                <div>
                    <dt>Node</dt>
                    <dd>talker</dd>
                </div>
            </RowGrid>
        );

        const grid = screen.getByTestId('grid');
        expect(grid.tagName).toBe('DL');
        expect(grid.style.maxWidth).toBe('40rem');
        expect(grid.style.getPropertyValue('--row-grid-min')).toBe('17rem');
    });

    it('accepts minColumn only for automatic columns', () => {
        // @ts-expect-error a single column has no narrowest automatic column
        const element = <RowGrid columns={1} minColumn="20rem" />;
        expect(element).toBeTruthy();
    });
});
