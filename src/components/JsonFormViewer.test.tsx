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
import userEvent from '@testing-library/user-event';
import { JsonFormViewer } from './JsonFormViewer';

describe('JsonFormViewer', () => {
    it('reads each kind of value in the form view: missing ones quiet, strings quoted', () => {
        render(<JsonFormViewer data={{ gone: null, armed: true, rpm: 0, mode: 'auto' }} />);

        expect(screen.getByText('null')).toHaveClass('italic');
        expect(screen.getByText('true')).toHaveClass('text-foreground');
        expect(screen.getByText('0')).toHaveClass('text-foreground');
        expect(screen.getByText('"auto"')).toHaveClass('text-foreground');
    });

    it('switches to the JSON text and back', async () => {
        const user = userEvent.setup();
        const { container } = render(<JsonFormViewer data={{ rpm: 1200 }} />);

        await user.click(screen.getByRole('button', { name: 'JSON' }));
        expect(container.querySelector('pre')).toHaveTextContent('"rpm": 1200');

        await user.click(screen.getByRole('button', { name: 'Form' }));
        expect(container.querySelector('pre')).toBeNull();
        expect(screen.getByText('1200')).toBeInTheDocument();
    });
});
