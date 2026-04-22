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
import { UpdateCard } from './UpdateCard';
import type { UpdateEntry, UpdatePhase } from '@/lib/types';

describe('UpdateCard', () => {
    it('renders update ID', () => {
        const entry: UpdateEntry = {
            id: 'update-abc-123',
            status: { status: 'pending' },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText(/update-abc-123/)).toBeInTheDocument();
    });

    it('shows status unavailable when status is null', () => {
        const entry: UpdateEntry = {
            id: 'update-failed-status',
            status: null,
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('Status unavailable')).toBeInTheDocument();
    });

    it('shows pending badge', () => {
        const entry: UpdateEntry = {
            id: 'update-pending',
            status: { status: 'pending' },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('shows inProgress badge with progress bar', () => {
        const entry: UpdateEntry = {
            id: 'update-inprogress',
            status: { status: 'inProgress', progress: 42 },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('inProgress')).toBeInTheDocument();
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toBeInTheDocument();
        expect(progressBar).toHaveAttribute('aria-valuenow', '42');
        expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('shows completed badge', () => {
        const entry: UpdateEntry = {
            id: 'update-done',
            status: { status: 'completed' },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('completed')).toBeInTheDocument();
    });

    it('only offers Delete when an update completed with no x-medkit-phase', () => {
        const entry: UpdateEntry = {
            id: 'update-done',
            status: { status: 'completed' },
        };

        render(<UpdateCard entry={entry} onAction={vi.fn()} />);

        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^execute$/i })).not.toBeInTheDocument();
    });

    it('surfaces Execute alongside Delete when completed maps to phase=prepared', () => {
        // Plugins that split prepare/execute expose both terminal states as
        // SOVD status=completed. The phase disambiguates: completed +
        // prepared means the install still needs to run.
        const entry: UpdateEntry = {
            id: 'update-prepared',
            status: { status: 'completed', 'x-medkit-phase': 'prepared' },
        };

        render(<UpdateCard entry={entry} onAction={vi.fn()} />);

        expect(screen.getByRole('button', { name: /^execute$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('drops Execute once phase advances past prepared', () => {
        const entry: UpdateEntry = {
            id: 'update-executed',
            status: { status: 'completed', 'x-medkit-phase': 'executed' },
        };

        render(<UpdateCard entry={entry} onAction={vi.fn()} />);

        expect(screen.queryByRole('button', { name: /^execute$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('falls back to Delete-only when completed carries an unknown phase', () => {
        // Contract: only `prepared` surfaces Execute. Any other (or
        // out-of-enum) phase on `completed` is treated as terminal.
        const entry: UpdateEntry = {
            id: 'update-unknown-phase',
            status: {
                status: 'completed',
                'x-medkit-phase': 'installing' as UpdatePhase,
            },
        };

        render(<UpdateCard entry={entry} onAction={vi.fn()} />);

        expect(screen.queryByRole('button', { name: /^execute$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('ignores phase on failed updates and offers the retry actions', () => {
        const entry: UpdateEntry = {
            id: 'update-failed-after-prepare',
            status: { status: 'failed', 'x-medkit-phase': 'prepared' },
        };

        render(<UpdateCard entry={entry} onAction={vi.fn()} />);

        expect(screen.getByRole('button', { name: /prepare/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^execute$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('shows failed badge with error message text', () => {
        const entry: UpdateEntry = {
            id: 'update-failed',
            status: { status: 'failed', error: 'Checksum verification failed' },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('failed')).toBeInTheDocument();
        expect(screen.getByText('Checksum verification failed')).toBeInTheDocument();
    });

    it('shows sub-progress list when present', () => {
        const entry: UpdateEntry = {
            id: 'update-sub',
            status: {
                status: 'inProgress',
                progress: 60,
                sub_progress: [
                    { name: 'Download', progress: 100 },
                    { name: 'Verify', progress: 20 },
                ],
            },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByText('Download')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('Verify')).toBeInTheDocument();
        expect(screen.getByText('20%')).toBeInTheDocument();
    });

    it('does not show progress bar when progress is undefined', () => {
        const entry: UpdateEntry = {
            id: 'update-no-progress',
            status: { status: 'pending' },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows full 100% bar when status is completed, even without progress field', () => {
        const entry: UpdateEntry = {
            id: 'update-done-no-progress',
            status: { status: 'completed' },
        };

        render(<UpdateCard entry={entry} />);

        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });

    it('snaps main + sub progress to 100% when status flips to completed below 100', () => {
        const entry: UpdateEntry = {
            id: 'update-stuck-at-87',
            status: {
                status: 'completed',
                progress: 87,
                sub_progress: [
                    { name: 'Download', progress: 87 },
                    { name: 'Verify', progress: 50 },
                ],
            },
        };

        render(<UpdateCard entry={entry} />);

        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
        expect(screen.getAllByText('100%')).toHaveLength(2);
    });

    it('calls onAction with correct id and action when action button clicked', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn();
        const entry: UpdateEntry = {
            id: 'update-act',
            status: { status: 'pending' },
        };

        render(<UpdateCard entry={entry} onAction={onAction} />);

        const prepareButton = screen.getByRole('button', { name: /prepare/i });
        await user.click(prepareButton);

        expect(onAction).toHaveBeenCalledWith('update-act', 'prepare');
    });
});
