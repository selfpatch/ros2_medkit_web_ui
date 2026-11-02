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
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FaultsPanel } from './FaultsPanel';
import type { Fault, ListFaultsResponse } from '@/lib/types';

// ---- store mock ----

const mockListEntityFaults = vi.fn();
const mockClearFault = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            listEntityFaults: mockListEntityFaults,
            getFaultWithEnvironmentData: vi.fn(),
            clearFault: mockClearFault,
        })
    ),
}));

// ---- helpers ----

function fault(code: string, entityId: string): Fault {
    return {
        code,
        message: `${code} reported`,
        severity: 'error',
        status: 'active',
        timestamp: '2026-08-31T10:00:00.000Z',
        entity_id: entityId,
        entity_type: 'app',
    };
}

function listOf(...faults: Fault[]): ListFaultsResponse {
    return { items: faults, count: faults.length };
}

/** The first answer for `app-a` waits for the test; every other read answers `others`. */
function slowFirstEntity(others: ListFaultsResponse) {
    let answerA!: (response: ListFaultsResponse) => void;
    let failA!: (error: Error) => void;
    mockListEntityFaults.mockImplementation((_type: string, entityId: string) =>
        entityId === 'app-a'
            ? new Promise<ListFaultsResponse>((resolve, reject) => {
                  answerA = resolve;
                  failA = reject;
              })
            : Promise.resolve(others)
    );
    return {
        answerA: (response: ListFaultsResponse) => answerA(response),
        failA: (error: Error) => failA(error),
    };
}

/**
 * Every read waits until the test answers it, with `lists[entityId]`. A clear waits for
 * `finishClear`.
 */
function heldReadsAndClear(lists: Record<string, ListFaultsResponse>) {
    const pending: { entityId: string; resolve: (response: ListFaultsResponse) => void }[] = [];
    mockListEntityFaults.mockImplementation(
        (_type: string, entityId: string) =>
            new Promise<ListFaultsResponse>((resolve) => {
                pending.push({ entityId, resolve });
            })
    );
    let clearDone!: () => void;
    mockClearFault.mockImplementation(
        () =>
            new Promise<boolean>((resolve) => {
                clearDone = () => resolve(true);
            })
    );
    const answer = async (read: { entityId: string; resolve: (response: ListFaultsResponse) => void }) => {
        await act(async () => {
            read.resolve(lists[read.entityId]!);
        });
    };
    return {
        /** Answers the oldest read still out. */
        answerOldest: () => answer(pending.shift()!),
        /** Answers the newest read still out. */
        answerNewest: () => answer(pending.pop()!),
        finishClear: () =>
            act(async () => {
                clearDone();
            }),
    };
}

// ---- tests ----

describe('FaultsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows only the entity it was switched to when the previous one's faults answer late", async () => {
        // The panel stays mounted when the selected entity changes.
        const slow = slowFirstEntity(listOf(fault('B_FAULT', 'app-b')));
        const { rerender } = render(<FaultsPanel entityId="app-a" entityType="apps" />);
        rerender(<FaultsPanel entityId="app-b" entityType="apps" />);
        await screen.findByText('B_FAULT');

        await act(async () => {
            slow.answerA(listOf(fault('A_FAULT', 'app-a')));
        });

        expect(screen.queryByText('A_FAULT')).toBeNull();
        expect(screen.getByText('B_FAULT')).toBeInTheDocument();
        // Loaded, not left on the spinner: the panel's own Refresh shows only once it is
        expect(screen.getByTitle('Refresh faults')).toBeInTheDocument();
    });

    it("does not show the previous entity's late failure", async () => {
        const slow = slowFirstEntity(listOf(fault('B_FAULT', 'app-b')));
        const { rerender } = render(<FaultsPanel entityId="app-a" entityType="apps" />);
        rerender(<FaultsPanel entityId="app-b" entityType="apps" />);
        await screen.findByText('B_FAULT');

        await act(async () => {
            slow.failA(new Error('gateway did not answer'));
        });

        expect(screen.queryByText('gateway did not answer')).toBeNull();
        expect(screen.getByText('B_FAULT')).toBeInTheDocument();
    });

    /**
     * Opens app A, clicks Clear on its fault and moves the panel to app B while the clear
     * is out. Returns the held reads and clear, with B's first read still out.
     */
    async function clearThenSwitch() {
        const held = heldReadsAndClear({
            'app-a': listOf(fault('A_REMAINING', 'app-a')),
            'app-b': listOf(fault('B_FAULT', 'app-b')),
        });
        mockListEntityFaults.mockImplementationOnce(() => Promise.resolve(listOf(fault('A_FAULT', 'app-a'))));
        const { rerender } = render(<FaultsPanel entityId="app-a" entityType="apps" />);
        await screen.findByText('A_FAULT');
        // The row's own button; the first is Refresh.
        fireEvent.click(screen.getAllByRole('button')[1]!);
        rerender(<FaultsPanel entityId="app-b" entityType="apps" />);
        return held;
    }

    it('reloads the entity it shows when a clear started on another one answers', async () => {
        const held = await clearThenSwitch();
        await held.answerOldest(); // B's own read, before the clear answers
        await held.finishClear();
        await held.answerOldest(); // the reload after the clear

        expect(screen.queryByText('A_REMAINING')).toBeNull();
        expect(screen.getByText('B_FAULT')).toBeInTheDocument();
        // Loaded, not left on the spinner: the panel's own Refresh shows only once it is
        expect(screen.getByTitle('Refresh faults')).toBeInTheDocument();
    });

    it("keeps the entity it shows when its own read answers after a clear's reload started", async () => {
        const held = await clearThenSwitch();
        await held.finishClear();
        await held.answerNewest(); // the reload after the clear
        await held.answerOldest(); // B's own read, started before the clear answered

        expect(screen.queryByText('A_REMAINING')).toBeNull();
        expect(screen.getByText('B_FAULT')).toBeInTheDocument();
        // Loaded, not left on the spinner: the panel's own Refresh shows only once it is
        expect(screen.getByTitle('Refresh faults')).toBeInTheDocument();
    });

    it('shows the row being cleared as clearing until the delete answers', async () => {
        const held = heldReadsAndClear({ 'app-a': listOf(fault('SHARED_CODE', 'app-a')) });
        render(<FaultsPanel entityId="app-a" entityType="apps" />);
        await held.answerOldest();

        // The row's own button; the first is Refresh.
        fireEvent.click(screen.getAllByRole('button')[1]!);

        expect(screen.getAllByRole('button')[1]).toBeDisabled();

        // The reload still lists it (raised again): the row can be cleared again.
        await held.finishClear();
        await held.answerOldest();
        expect(screen.getAllByRole('button')[1]).toBeEnabled();
    });

    it("does not show another entity's row with the same code as clearing", async () => {
        const held = heldReadsAndClear({
            'app-a': listOf(fault('SHARED_CODE', 'app-a')),
            'app-b': listOf(fault('SHARED_CODE', 'app-b')),
        });
        const { rerender } = render(<FaultsPanel entityId="app-a" entityType="apps" />);
        await held.answerOldest();
        fireEvent.click(screen.getAllByRole('button')[1]!);

        rerender(<FaultsPanel entityId="app-b" entityType="apps" />);
        await held.answerOldest();
        expect(screen.getByText('app: app-b')).toBeInTheDocument();
        expect(screen.getAllByRole('button')[1]).toBeEnabled();

        await held.finishClear();
        await held.answerOldest(); // the reload after the clear
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app-a', 'SHARED_CODE');
        expect(screen.getByText('app: app-b')).toBeInTheDocument();
        expect(screen.getAllByRole('button')[1]).toBeEnabled();
    });

    it('reads the list again on Refresh', async () => {
        mockListEntityFaults
            .mockResolvedValueOnce(listOf())
            .mockResolvedValueOnce(listOf(fault('RAISED_SINCE', 'app-a')));
        render(<FaultsPanel entityId="app-a" entityType="apps" />);
        await screen.findByText('No faults detected');

        fireEvent.click(screen.getByRole('button'));

        expect(await screen.findByText('RAISED_SINCE')).toBeInTheDocument();
    });

    it('reads the list again after a fault is cleared', async () => {
        mockListEntityFaults
            .mockResolvedValueOnce(listOf(fault('LANE_BLOCKED', 'app-a')))
            .mockResolvedValueOnce(listOf());
        mockClearFault.mockResolvedValue(true);
        render(<FaultsPanel entityId="app-a" entityType="apps" />);
        await screen.findByText('LANE_BLOCKED');

        // The row's own button; the first is Refresh.
        fireEvent.click(screen.getAllByRole('button')[1]!);

        expect(await screen.findByText('No faults detected')).toBeInTheDocument();
        expect(mockClearFault).toHaveBeenCalledWith('apps', 'app-a', 'LANE_BLOCKED');
    });

    it('lists one code reported by two apps of a component as two rows', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockListEntityFaults.mockResolvedValue(listOf(fault('LANE_BLOCKED', 'app-a'), fault('LANE_BLOCKED', 'app-b')));
        render(<FaultsPanel entityId="amr-07" entityType="components" />);

        await screen.findByText('app: app-b');
        expect(screen.getByText('app: app-a')).toBeInTheDocument();
        expect(consoleError.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
        consoleError.mockRestore();
    });

    it('says the faults could not be read, never that the entity is fine, when the read fails', async () => {
        mockListEntityFaults.mockRejectedValue(new Error('Fault manager unavailable'));
        render(<FaultsPanel entityId="app-a" entityType="apps" />);

        expect(await screen.findByText('Fault manager unavailable')).toBeInTheDocument();
        expect(screen.queryByText('No faults detected')).toBeNull();
        expect(screen.queryByText('Component is operating normally')).toBeNull();
    });
});
