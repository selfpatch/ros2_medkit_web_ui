import { FileBox, Film } from 'lucide-react';
import { RosbagDownloadButton } from './RosbagDownloadButton';
import { snapshotTime } from '@/lib/fault-readings';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { FreezeFrameSnapshot, Snapshot } from '@/lib/types';
import { isFreezeFrameSnapshot, isRosbagSnapshot } from '@/lib/types';

interface SnapshotCardProps {
    snapshot: Snapshot;
    index: number;
}

/**
 * A freeze frame of a text message (std_msgs/String and the like) carries its text, not
 * an object: shown as it is, or laid out when the text is JSON.
 */
function frameText(frame: FreezeFrameSnapshot): string | null {
    if (typeof frame.data !== 'string' || frame.data === '') return null;
    try {
        return JSON.stringify(JSON.parse(frame.data), null, 2);
    } catch {
        return frame.data;
    }
}

/**
 * One thing the gateway kept of a fault: a freeze frame says which topic it caught and
 * holds its message, a recording says how long and how big it is and downloads.
 */
export function SnapshotCard({ snapshot, index }: SnapshotCardProps) {
    const rosbag = isRosbagSnapshot(snapshot) ? snapshot : null;
    const frame = isFreezeFrameSnapshot(snapshot) ? snapshot : null;
    const fields =
        frame && typeof frame.data === 'object' && frame.data !== null ? (frame.data as Record<string, unknown>) : null;
    const fieldCount = fields ? Object.keys(fields).length : 0;
    const text = frame ? frameText(frame) : null;
    const topic = frame?.['x-medkit']?.topic || undefined;
    const messageType = frame?.['x-medkit']?.message_type || undefined;
    const at = snapshotTime(snapshot);
    const Icon = rosbag ? Film : FileBox;

    return (
        <div className="min-w-0 rounded-lg bg-white ring-1 ring-graphite/8">
            <div className="flex items-start gap-3 px-3 py-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                {/* A narrow pane wraps the topic and its type rather than cutting them off. */}
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        {topic && (
                            <span className="font-mono text-[13px] [overflow-wrap:anywhere] text-foreground">
                                {topic}
                            </span>
                        )}
                        <span className={topic ? 'text-xs text-faint' : 'text-sm font-medium text-foreground'}>
                            Snapshot #{index + 1}
                        </span>
                    </div>
                    <div className="text-xs [overflow-wrap:anywhere] text-faint">
                        <span>{rosbag ? 'Rosbag' : 'Freeze Frame'}</span>
                        {messageType && ` · ${messageType}`}
                        {at !== null && ` · ${new Date(at).toLocaleString()}`}
                    </div>
                </div>
                {rosbag && <RosbagDownloadButton snapshot={rosbag} size="icon" />}
            </div>

            {rosbag && (
                <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline px-3 py-2 text-xs">
                    {rosbag.duration_sec > 0 && (
                        <div className="flex gap-1.5">
                            <dt className="text-faint">Duration</dt>
                            <dd className="text-foreground">{formatDuration(rosbag.duration_sec)}</dd>
                        </div>
                    )}
                    {rosbag.size_bytes > 0 && (
                        <div className="flex gap-1.5">
                            <dt className="text-faint">Size</dt>
                            <dd className="text-foreground">{formatBytes(rosbag.size_bytes)}</dd>
                        </div>
                    )}
                    {rosbag.format && (
                        <div className="flex gap-1.5">
                            <dt className="text-faint">Format</dt>
                            <dd className="font-mono text-foreground">{rosbag.format}</dd>
                        </div>
                    )}
                </dl>
            )}

            {/* Freeze frame data display */}
            {fields && fieldCount > 0 && (
                <details className="group border-t border-hairline text-xs">
                    <summary className="cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground">
                        Data ({fieldCount} fields)
                    </summary>
                    <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-canvas p-2 font-mono text-xs text-foreground">
                        {JSON.stringify(fields, null, 2)}
                    </pre>
                </details>
            )}
            {text && (
                <details className="group border-t border-hairline text-xs">
                    <summary className="cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground">
                        Data (text)
                    </summary>
                    <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-canvas p-2 font-mono text-xs whitespace-pre-wrap text-foreground">
                        {text}
                    </pre>
                </details>
            )}
        </div>
    );
}
