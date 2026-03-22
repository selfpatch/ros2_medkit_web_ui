import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Database, FileBox } from 'lucide-react';
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

export function SnapshotCard({ snapshot, index }: SnapshotCardProps) {
    const isRosbag = isRosbagSnapshot(snapshot);
    const freezeFrameData = getFreezeFrameData(snapshot);
    const fieldCount = freezeFrameData ? Object.keys(freezeFrameData).length : 0;

    return (
        <Card className="bg-muted/50">
            <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileBox className="h-4 w-4" />
                        Snapshot #{index + 1}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant={isRosbag ? 'default' : 'secondary'}>
                            {isRosbag ? 'Rosbag' : 'Freeze Frame'}
                        </Badge>
                        {isRosbag && <RosbagDownloadButton snapshot={snapshot as RosbagSnapshot} size="icon" />}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="py-2 px-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Captured At
                    </dt>
                    <dd className="font-mono text-xs">
                        {snapshot['x-medkit']?.captured_at
                            ? new Date(snapshot['x-medkit'].captured_at).toLocaleString()
                            : 'N/A'}
                    </dd>

                    {isRosbag && (snapshot as RosbagSnapshot).duration_sec && (
                        <>
                            <dt className="text-muted-foreground">Duration</dt>
                            <dd>{formatDuration((snapshot as RosbagSnapshot).duration_sec)}</dd>
                        </>
                    )}

                    {isRosbag && (snapshot as RosbagSnapshot).size_bytes && (
                        <>
                            <dt className="text-muted-foreground flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                Size
                            </dt>
                            <dd>{formatBytes((snapshot as RosbagSnapshot).size_bytes)}</dd>
                        </>
                    )}

                    {isRosbag && (snapshot as RosbagSnapshot).format && (
                        <>
                            <dt className="text-muted-foreground">Format</dt>
                            <dd>{(snapshot as RosbagSnapshot).format}</dd>
                        </>
                    )}
                </dl>

                {/* Freeze frame data display */}
                {!isRosbag && freezeFrameData && fieldCount > 0 && (
                    <div className="mt-2 pt-2 border-t">
                        <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Data ({fieldCount} fields)
                            </summary>
                            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                                {JSON.stringify(freezeFrameData, null, 2)}
                            </pre>
                        </details>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
