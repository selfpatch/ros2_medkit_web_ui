import { Download, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { SovdResourceEntityType } from '@/lib/types';
import type { RosbagSnapshot } from '@/lib/types';

interface RosbagDownloadButtonProps {
    snapshot: RosbagSnapshot;
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'icon';
}

/**
 * Parse a bulk_data_uri like "/apps/motor/bulk-data/rosbags/FAULT_CODE"
 * into { entityType, entityId, category, id } for the downloadBulkData API.
 */
function parseBulkDataUri(uri: string): {
    entityType: SovdResourceEntityType;
    entityId: string;
    category: string;
    id: string;
} | null {
    // Pattern: /<entityType>/<entityId>/bulk-data/<category>/<id>
    const match = uri.match(/^\/(apps|components|areas|functions)\/([^/]+)\/bulk-data\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
        entityType: match[1]! as SovdResourceEntityType,
        entityId: match[2]!,
        category: match[3]!,
        id: match[4]!,
    };
}

export function RosbagDownloadButton({ snapshot, variant = 'outline', size = 'sm' }: RosbagDownloadButtonProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { downloadBulkData } = useAppStore(
        useShallow((state) => ({
            downloadBulkData: state.downloadBulkData,
        }))
    );

    const handleDownload = useCallback(async () => {
        if (!snapshot.bulk_data_uri) return;

        setIsDownloading(true);
        setError(null);

        try {
            const parsed = parseBulkDataUri(snapshot.bulk_data_uri);
            if (!parsed) {
                throw new Error('Invalid bulk_data_uri format');
            }

            const result = await downloadBulkData(parsed.entityType, parsed.entityId, parsed.category, parsed.id);

            if (!result) {
                throw new Error('Download failed');
            }

            // Create object URL and trigger download
            const url = URL.createObjectURL(result.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setIsDownloading(false);
        }
    }, [downloadBulkData, snapshot]);

    if (!snapshot.bulk_data_uri) {
        return null;
    }

    const label = snapshot.size_bytes ? `Download (${formatBytes(snapshot.size_bytes)})` : 'Download rosbag';

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={variant}
                    size={size}
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className={error ? 'border-destructive' : ''}
                >
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {size !== 'icon' && <span className="ml-2">{isDownloading ? 'Downloading...' : label}</span>}
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                {error ? (
                    <p className="text-destructive">{error}</p>
                ) : (
                    <div className="space-y-1">
                        <p className="font-medium">{snapshot.name}</p>
                        {snapshot.duration_sec && <p>Duration: {formatDuration(snapshot.duration_sec)}</p>}
                        {snapshot.format && <p>Format: {snapshot.format}</p>}
                    </div>
                )}
            </TooltipContent>
        </Tooltip>
    );
}
