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
import { SegmentedSwitch, segmentClass } from './SegmentedSwitch';

describe('SegmentedSwitch', () => {
    const options = [
        { value: 'form' as const, label: 'Form' },
        { value: 'json' as const, label: 'JSON' },
    ];

    it('marks only the picked way as pressed', () => {
        render(<SegmentedSwitch options={options} value="json" onChange={() => {}} />);

        expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Form' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('reports the way pressed, by mouse or keyboard', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<SegmentedSwitch options={options} value="form" onChange={onChange} />);

        await user.click(screen.getByRole('button', { name: 'JSON' }));
        expect(onChange).toHaveBeenLastCalledWith('json');

        screen.getByRole('button', { name: 'Form' }).focus();
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenLastCalledWith('form');
    });
});

describe('segmentClass', () => {
    it('raises the picked segment and keeps the others quiet', () => {
        expect(segmentClass(true, 'sm')).toContain('raised');
        expect(segmentClass(false, 'sm')).not.toContain('raised');
        expect(segmentClass(false, 'sm')).toContain('text-muted-foreground');
    });

    it('gives each size its own height', () => {
        expect(segmentClass(false, 'sm')).toContain('h-6');
        expect(segmentClass(false, 'md')).toContain('h-7');
        expect(segmentClass(false, 'lg')).toContain('h-8');
    });

    it('draws a visible focus ring: outline-none needs outline-solid on focus in Tailwind 4', () => {
        for (const size of ['sm', 'md', 'lg'] as const) {
            expect(segmentClass(false, size)).toContain('focus-visible:outline-solid');
        }
    });
});
