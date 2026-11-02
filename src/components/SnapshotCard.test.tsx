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

        // Named by its topic: the topic says which frame it is, the icon that it is one.
        expect(screen.getByText('/motor/temp')).toBeInTheDocument();
        expect(screen.getByText('sensor_msgs/msg/Temperature')).toBeInTheDocument();
        expect(screen.queryByText('Snapshot #1')).not.toBeInTheDocument();
        expect(screen.queryByText(/Freeze Frame/)).not.toBeInTheDocument();
        expect(screen.getByText(/Data.*2 fields/)).toBeInTheDocument();
        expect(screen.getByText(/"rpm": 3000/).textContent).toBe('{\n  "temperature": 85.5,\n  "rpm": 3000\n}');
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
        // Laid out: the text as it came would hold the same words on one line.
        expect(screen.getByText(/"mode": "held"/).textContent).toBe('{\n  "mode": "held",\n  "free_width": 1.4\n}');
    });

    it('shows text that is not JSON as it came', () => {
        const log: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'log',
            data: 'lane held {for 4 s',
            'x-medkit': { topic: '/log', message_type: 'std_msgs/msg/String', captured_at: '2026-11-01T20:09:41Z' },
        };

        renderWithTooltip(<SnapshotCard snapshot={log} index={0} />);

        expect(screen.getByText('lane held {for 4 s')).toBeInTheDocument();
    });

    it('puts no time on a snapshot that carries none, nor the epoch the gateway writes for one', () => {
        const unparsed: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'scan',
            data: '{"ranges": [',
            'x-medkit': { topic: '/scan', message_type: 'sensor_msgs/msg/LaserScan', parse_error: 'unexpected end' },
        };
        const epoch: FreezeFrameSnapshot = {
            ...unparsed,
            'x-medkit': { topic: '/scan', message_type: '', captured_at: '1970-01-01T00:00:00Z' },
        };

        const { container } = renderWithTooltip(<SnapshotCard snapshot={unparsed} index={0} />);
        expect(container.textContent).not.toMatch(/N\/A|1970|Invalid Date/);
        renderWithTooltip(<SnapshotCard snapshot={epoch} index={1} />);
        expect(document.body.textContent).not.toMatch(/1970|Invalid Date/);
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

        const { container } = renderWithTooltip(<SnapshotCard snapshot={snapshot} index={0} />);

        // In the page's words ("Feb 4", "Tue 14:20", "11:55"), the whole date on hover.
        const time = container.querySelector('time');
        expect(time?.getAttribute('datetime')).toBe('2026-02-04T10:00:00.000Z');
        expect(time?.getAttribute('title')).toMatch(/2026/);
        expect(time?.textContent).not.toBe('');
    });

    it("keeps a list of plain values on one line, so a scan's ranges do not run a line a number", () => {
        const scan: FreezeFrameSnapshot = {
            type: 'freeze_frame',
            name: 'scan',
            data: { angle_min: -3.14, ranges: [0.96, 0.97, null], header: { frame_id: 'base_scan' } },
            'x-medkit': { topic: '/scan', message_type: 'sensor_msgs/msg/LaserScan' },
        };

        renderWithTooltip(<SnapshotCard snapshot={scan} index={0} />);

        expect(screen.getByText(/"ranges"/).textContent).toBe(
            '{\n  "angle_min": -3.14,\n  "ranges": [0.96, 0.97, null],\n  "header": {"frame_id": "base_scan"}\n}'
        );
    });
});
