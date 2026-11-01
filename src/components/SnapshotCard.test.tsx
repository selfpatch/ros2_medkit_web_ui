import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapshotCard } from './SnapshotCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FreezeFrameSnapshot, RosbagSnapshot } from '@/lib/types';

// Mock the store
vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector) =>
        selector({
            client: {
                getBulkDataUrl: vi.fn((uri: string) => `http://localhost:8080/api/v1${uri}`),
            },
        })
    ),
}));

const renderWithTooltip = (ui: React.ReactElement) => {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('SnapshotCard', () => {
    it('renders freeze frame snapshot', () => {
        const freezeFrame: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'temperature',
            data: { temperature: 85.5, rpm: 3000 },
            'x-medkit': {
                topic: '/motor/temp',
                message_type: 'sensor_msgs/msg/Temperature',
                full_data: { temperature: 85.5, rpm: 3000 },
                captured_at: '2026-02-04T10:00:00Z',
            },
        };

        renderWithTooltip(<SnapshotCard snapshot={freezeFrame} index={0} />);

        expect(screen.getByText('Snapshot #1')).toBeInTheDocument();
        expect(screen.getByText('Freeze Frame')).toBeInTheDocument();
        expect(screen.getByText(/Data.*2 fields/)).toBeInTheDocument();
    });

    it('renders rosbag snapshot with download button', () => {
        const rosbag: RosbagSnapshot = {
            type: 'rosbag',
            name: 'fault_recording',
            bulk_data_uri: '/apps/motor/bulk-data/rosbags/rb-1',
            size_bytes: 2097152,
            duration_sec: 60,
            format: 'mcap',
            'x-medkit': {
                captured_at: '2026-02-04T10:00:00Z',
                fault_code: 'MOTOR_OVERHEAT',
            },
        };

        renderWithTooltip(<SnapshotCard snapshot={rosbag} index={2} />);

        expect(screen.getByText('Snapshot #3')).toBeInTheDocument();
        expect(screen.getByText('Rosbag')).toBeInTheDocument();
        expect(screen.getByText('2 MB')).toBeInTheDocument();
        expect(screen.getByText('1m 0s')).toBeInTheDocument();
        expect(screen.getByText('mcap')).toBeInTheDocument();
        expect(screen.getByRole('button')).toBeInTheDocument(); // Download button
    });

    it('shows a text freeze frame by its topic, with its text laid out', () => {
        const status: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'status',
            data: '{"mode": "held", "free_width": 1.4}',
            'x-medkit': {
                topic: '/navigation/status',
                message_type: 'std_msgs/msg/String',
                full_data: { data: '{"mode": "held", "free_width": 1.4}' },
                captured_at: '2026-11-01T20:09:41Z',
            },
        };

        renderWithTooltip(<SnapshotCard snapshot={status} index={2} />);

        expect(screen.getByText('/navigation/status')).toBeInTheDocument();
        expect(screen.getByText('Data (text)')).toBeInTheDocument();
        expect(screen.getByText(/"mode": "held"/)).toBeInTheDocument();
    });

    it('displays captured_at from x-medkit', () => {
        const snapshot: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'test',
            data: {},
            'x-medkit': {
                topic: '/test',
                message_type: 'std_msgs/msg/String',
                full_data: {},
                captured_at: '2026-02-04T10:00:00Z',
            },
        };

        renderWithTooltip(<SnapshotCard snapshot={snapshot} index={0} />);

        // Check that timestamp is rendered (format depends on locale)
        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });
});
