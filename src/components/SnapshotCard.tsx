import { FileBox, Film } from 'lucide-react';
import { RosbagDownloadButton } from './RosbagDownloadButton';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { RosbagSnapshot, Snapshot } from '@/lib/types';
import { isRosbagSnapshot } from '@/lib/types';

interface SnapshotCardProps {
    snapshot: Snapshot;
    index: number;
}

/**
 * Helper to safely get data from freeze frame snapshot
 * Returns the data object or null if not available
 */
function getFreezeFrameData(snapshot: Snapshot): Record<string, unknown> | null {
    if (snapshot.type === 'freeze_frame' && snapshot.data && typeof snapshot.data === 'object') {
        return snapshot.data as Record<string, unknown>;
    }
    return null;
}

/**
 * A freeze frame of a text message (std_msgs/String and the like) carries its text, not
 * an object: shown as it is, or laid out when the text is JSON.
 */
function getFreezeFrameText(snapshot: Snapshot): string | null {
    if (snapshot.type !== 'freeze_frame' || typeof snapshot.data !== 'string' || snapshot.data === '') return null;
    try {
        return JSON.stringify(JSON.parse(snapshot.data), null, 2);
    } catch {
        return snapshot.data;
    }
}

/**
 * One thing the gateway kept of a fault: a freeze frame says which topic it caught and
 * holds its message, a recording says how long and how big it is and downloads.
 */
export function SnapshotCard({ snapshot, index }: SnapshotCardProps) {
    const isRosbag = isRosbagSnapshot(snapshot);
    const rosbag = isRosbag ? (snapshot as RosbagSnapshot) : null;
    const freezeFrameData = getFreezeFrameData(snapshot);
    const fieldCount = freezeFrameData ? Object.keys(freezeFrameData).length : 0;
    const freezeFrameText = getFreezeFrameText(snapshot);
    const medkit = snapshot['x-medkit'];
    const topic = !isRosbag && medkit && 'topic' in medkit ? medkit.topic : undefined;
    const messageType = !isRosbag && medkit && 'message_type' in medkit ? medkit.message_type : undefined;
    const capturedAt = medkit?.captured_at ? new Date(medkit.captured_at).toLocaleString() : 'N/A';
    const Icon = isRosbag ? Film : FileBox;

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
                        <span>{isRosbag ? 'Rosbag' : 'Freeze Frame'}</span>
                        {messageType && ` · ${messageType}`}
                        {` · ${capturedAt}`}
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
            {!isRosbag && freezeFrameData && fieldCount > 0 && (
                <details className="group border-t border-hairline text-xs">
                    <summary className="cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground">
                        Data ({fieldCount} fields)
                    </summary>
                    <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-canvas p-2 font-mono text-xs text-foreground">
                        {JSON.stringify(freezeFrameData, null, 2)}
                    </pre>
                </details>
            )}
            {!isRosbag && freezeFrameText && (
                <details className="group border-t border-hairline text-xs">
                    <summary className="cursor-pointer px-3 py-1.5 text-muted-foreground hover:text-foreground">
                        Data (text)
                    </summary>
                    <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-canvas p-2 font-mono text-xs whitespace-pre-wrap text-foreground">
                        {freezeFrameText}
                    </pre>
                </details>
            )}
        </div>
    );
}
