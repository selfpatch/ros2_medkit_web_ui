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

/**
 * One fault's page: its downloads, its Clear, its readings then and now, and its story.
 * The live reads are stubbed here (useLiveFaultReadings has tests of its own): these
 * tests pin what the page makes of what they answer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { FaultDetail } from './FaultDetail';
import type { LiveFaultReadings } from '@/hooks/useLiveFaultReadings';
import type { Fault, FaultResponse, FreezeFrameSnapshot, RosbagSnapshot, Snapshot } from '@/lib/types';

const mockDownloadBulkData = vi.fn();
let live: LiveFaultReadings;

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
        selector({ downloadBulkData: mockDownloadBulkData })
    ),
}));

vi.mock('@/hooks/useLiveFaultReadings', () => ({
    useLiveFaultReadings: vi.fn(() => live),
}));

const MINUTE = 60_000;

function laneBlocked(overrides: Partial<Fault> = {}): Fault {
    return {
        code: 'LANE_BLOCKED',
        message: 'Lane blocked by a forklift',
        severity: 'error',
        status: 'active',
        timestamp: new Date(Date.now() - 5 * MINUTE - 10_000).toISOString(),
        entity_id: 'lane-navigator',
        entity_type: 'app',
        parameters: { occurrence_count: 1 },
        ...overrides,
    };
}

function recording(id: string, capturedAt?: string): RosbagSnapshot {
    return {
        type: 'rosbag',
        name: `recording ${id}`,
        bulk_data_uri: `/apps/lane-navigator/bulk-data/rosbags/${id}`,
        size_bytes: 2048,
        duration_sec: 10,
        format: 'mcap',
        ...(capturedAt ? { 'x-medkit': { captured_at: capturedAt } } : {}),
    };
}

function frame(
    topic: string,
    type: string,
    message: unknown,
    extra: Record<string, unknown> = {}
): FreezeFrameSnapshot {
    return {
        type: 'freeze_frame',
        name: topic.split('/').pop() || topic,
        data: message,
        'x-medkit': {
            topic,
            message_type: type,
            full_data: message,
            captured_at: new Date(Date.now() - 5 * MINUTE).toISOString(),
            ...extra,
        },
    };
}

function details(snapshots: Snapshot[]): FaultResponse {
    return {
        item: {
            code: 'LANE_BLOCKED',
            fault_name: 'Lane blocked by a forklift',
            severity: 2,
            status: { aggregatedStatus: 'active', testFailed: '1', confirmedDTC: '1', pendingDTC: '0' },
        },
        environment_data: { extended_data_records: { first_occurrence: '', last_occurrence: '' }, snapshots },
    };
}

function page(fault: Fault, kept: FaultResponse | null | undefined, onClear = vi.fn()) {
    render(<FaultDetail fault={fault} details={kept} onBack={vi.fn()} onClear={onClear} isClearing={false} />);
    return { onClear };
}

beforeEach(() => {
    vi.clearAllMocks();
    live = { values: new Map(), answeredAt: new Map(), readAt: null, stale: new Set(), failing: false, asked: false };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/1');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('FaultDetail downloads', () => {
    it('downloads each recording from its own address: the newest from the head, an earlier one from its line', async () => {
        mockDownloadBulkData.mockResolvedValue({ blob: new Blob(['bag']), filename: 'bag.mcap' });
        page(
            laneBlocked(),
            details([
                recording('rb-old', new Date(Date.now() - 3 * MINUTE).toISOString()),
                recording('rb-new', new Date(Date.now() - MINUTE).toISOString()),
            ])
        );

        fireEvent.click(screen.getByRole('button', { name: 'Download data - recording rb-new' }));
        await waitFor(() =>
            expect(mockDownloadBulkData).toHaveBeenCalledWith('apps', 'lane-navigator', 'rosbags', 'rb-new')
        );

        fireEvent.click(screen.getByRole('button', { name: 'Download recording - recording rb-old' }));
        await waitFor(() =>
            expect(mockDownloadBulkData).toHaveBeenLastCalledWith('apps', 'lane-navigator', 'rosbags', 'rb-old')
        );
        expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    });

    it('says in words beside the button that a download failed', async () => {
        mockDownloadBulkData.mockResolvedValue(null);
        page(laneBlocked(), details([recording('rb-1', new Date().toISOString())]));

        fireEvent.click(screen.getByRole('button', { name: 'Download data - recording rb-1' }));

        const said = await screen.findByText(/The gateway did not hand over this recording/);
        expect(said.closest('[role="status"]')).not.toBeNull();
        expect(said).toBeVisible();
    });

    it('says a recording it cannot address could not be read, and asks the gateway for nothing', async () => {
        page(laneBlocked(), details([{ ...recording('rb-1'), bulk_data_uri: '/robots/lane-navigator/rb-1' }]));

        fireEvent.click(screen.getByRole('button', { name: 'Download data - recording rb-1' }));

        expect(await screen.findByText(/This recording's address could not be read/)).toBeVisible();
        expect(mockDownloadBulkData).not.toHaveBeenCalled();
    });

    it('puts no epoch date on a recording that carries no time', () => {
        page(laneBlocked(), details([recording('rb-1')]));

        // Its time is not 1970: the page counts from when the fault was first reported.
        expect(screen.getByText('Open 5 min')).toBeInTheDocument();
        const head = screen.getByRole('button', { name: 'Download data - recording rb-1' });
        expect(head.getAttribute('title')).not.toMatch(/Recorded/);
        expect(document.body.textContent).not.toMatch(/1970|Jan 1\b/);
    });
});

describe('FaultDetail head', () => {
    it('offers Clear on an open fault, and Clear clears it', () => {
        const { onClear } = page(laneBlocked(), details([]));

        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('offers no Clear on a fault that ended', () => {
        page(laneBlocked({ status: 'healed' }), details([]));
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

        page(laneBlocked({ status: 'cleared' }), details([]));
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    });

    it('says when it could not read what the gateway keeps of the fault', () => {
        page(laneBlocked(), null);
        expect(screen.getByText("This fault's details could not be read.")).toBeInTheDocument();
    });
});

describe('FaultDetail readings', () => {
    const scan = frame('/scan', 'sensor_msgs/msg/LaserScan', { ranges: [0.96] });
    const status = frame('/navigation/status', 'std_msgs/msg/String', { data: '{"mode": "held"}' });

    it("keeps a topic's last answer once it stops answering, muted and marked with how old it is", () => {
        live = {
            values: new Map([['/scan', { ranges: [0.5] }]]),
            answeredAt: new Map([['/scan', Date.now() - 20_000]]),
            readAt: Date.now() - 20_000,
            stale: new Set(['/scan']),
            failing: true,
            asked: true,
        };
        page(laneBlocked(), details([scan, status]));

        const closest = screen.getByRole('row', { name: /Closest obstacle/ });
        const cells = within(closest).getAllByRole('cell');
        expect(cells[1]).toHaveTextContent('0.5 m');
        expect(cells[1]).toHaveTextContent('not answering now, last answer 20 s ago');
        expect(cells[1]).toHaveAttribute('title', expect.stringMatching(/Not answering now/));
    });

    it('shows a dash for a topic that never answered, and says so on it', () => {
        live = { ...live, asked: true };
        page(laneBlocked(), details([scan, status]));

        const mode = within(screen.getByRole('row', { name: /Mode/ })).getAllByRole('cell');
        expect(mode[1]).toHaveTextContent('-');
        expect(mode[1]).toHaveAttribute('title', 'Not answering');
    });

    it('does not say a topic is not answering before the first round of reads has asked it', () => {
        page(laneBlocked(), details([scan, status]));

        const mode = within(screen.getByRole('row', { name: /Mode/ })).getAllByRole('cell');
        expect(mode[1]).toHaveTextContent('-');
        expect(mode[1]).not.toHaveAttribute('title');
    });

    it('says its topics do not answer, in the story, until one does', () => {
        live = { ...live, failing: true };
        page(laneBlocked(), details([scan]));
        expect(screen.getByText("lane-navigator's topics do not answer.")).toBeInTheDocument();
    });

    it('heads the readings "At gateway start" when every frame was read when the gateway started', () => {
        const plc: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'plc',
            data: '{"pressure": 4.2}',
            'x-medkit': {
                topic: '',
                message_type: '',
                full_data: { pressure: 4.2 },
                captured_at: '2026-11-01T09:00:00Z',
                capture_origin: 'startup',
            },
        };
        page(laneBlocked(), details([plc]));

        expect(screen.getByRole('columnheader', { name: 'At gateway start' })).toBeInTheDocument();
        // Read at gateway start, not when the fault came: it does not date the fault either.
        expect(screen.getByText('Open 5 min')).toBeInTheDocument();
    });

    it('marks the value of a disconnected entity as last known', () => {
        const plc: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'plc',
            data: '{"pressure": 4.2}',
            'x-medkit': {
                topic: '',
                message_type: '',
                full_data: { pressure: 4.2 },
                captured_at: new Date().toISOString(),
                connected: false,
            },
        };
        page(laneBlocked(), details([plc]));

        const marker = screen.getByText('last known');
        expect(marker).toHaveAttribute('title', expect.stringMatching(/disconnected/));
    });
});
