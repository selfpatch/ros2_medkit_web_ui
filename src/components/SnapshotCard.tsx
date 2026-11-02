import { FileBox, Film } from 'lucide-react';
import { RosbagDownloadButton } from './RosbagDownloadButton';
import { snapshotTime } from '@/lib/fault-readings';
import { whenWords } from '@/lib/fault-story';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { FreezeFrameSnapshot, Snapshot } from '@/lib/types';
import { isFreezeFrameSnapshot, isRosbagSnapshot } from '@/lib/types';

interface SnapshotCardProps {
    snapshot: Snapshot;
    index: number;
}

const isPlain = (value: unknown) => value === null || typeof value !== 'object';

/**
 * JSON laid out a field a line, except where that runs long for little: a list of plain
 * values stays on one line that wraps (a scan's ranges read as a paragraph, not as seven
 * hundred lines), and so does a small object of plain values inside the message (a point,
 * a stamp).
 */
function layOut(value: unknown, indent = ''): string {
    const inner = `${indent}  `;
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (value.every(isPlain)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
        return `[\n${value.map((item) => inner + layOut(item, inner)).join(',\n')}\n${indent}]`;
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';
        if (indent && entries.length <= 4 && entries.every(([, item]) => isPlain(item))) {
            return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(', ')}}`;
        }
        const lines = entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${layOut(item, inner)}`);
        return `{\n${lines.join(',\n')}\n${indent}}`;
    }
    return JSON.stringify(value) ?? String(value);
}

/**
 * A freeze frame of a text message (std_msgs/String and the like) carries its text, not
 * an object: shown as it is, or laid out when the text is JSON.
 */
function frameText(frame: FreezeFrameSnapshot): string | null {
    if (typeof frame.data !== 'string' || frame.data === '') return null;
    try {
        return layOut(JSON.parse(frame.data));
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
                        {/* A frame is named by the topic it caught; a recording, or a frame
                            without a topic, by its place among the fault's snapshots. */}
                        {topic ? (
                            <span className="font-mono text-[13px] [overflow-wrap:anywhere] text-foreground">
                                {topic}
                            </span>
                        ) : (
                            <span className="text-sm font-medium text-foreground">Snapshot #{index + 1}</span>
                        )}
                        {at !== null && (
                            <time
                                dateTime={new Date(at).toISOString()}
                                title={new Date(at).toLocaleString()}
                                className="text-xs text-faint tabular-nums"
                            >
                                {whenWords(at, Date.now(), true)}
                            </time>
                        )}
                    </div>
                    {(rosbag || messageType) && (
                        <div className="text-xs [overflow-wrap:anywhere] text-faint">
                            {rosbag ? 'Rosbag' : messageType}
                            {rosbag && messageType && ` · ${messageType}`}
                        </div>
                    )}
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
                        Data ({fieldCount} {fieldCount === 1 ? 'field' : 'fields'})
                    </summary>
                    <pre className="mx-3 mb-3 max-h-48 overflow-auto rounded-md bg-canvas p-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">
                        {layOut(fields)}
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
