import { Download, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/lib/store';
import { parseBulkDataUri, saveBlob } from '@/lib/bulk-data';
import { formatBytes, formatDuration } from '@/lib/utils';
import type { RosbagSnapshot } from '@/lib/types';

interface RosbagDownloadButtonProps {
    snapshot: RosbagSnapshot;
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'icon';
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
                throw new Error("This recording's address could not be read");
            }

            const result = await downloadBulkData(parsed.entityType, parsed.entityId, parsed.category, parsed.id);

            if (!result) {
                throw new Error('The gateway did not hand over this recording');
            }

            saveBlob(result.blob, result.filename);
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
    // A fault can hold several recordings, so the icon variant renders as N
    // buttons with no text at all - identical to a screen reader and to keyboard
    // navigation. Name each one after the recording it downloads so they can be
    // told apart; snapshot.name carries the recording id.
    const accessibleName = snapshot.name ? `${label} - ${snapshot.name}` : label;

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={variant}
                        size={size}
                        onClick={handleDownload}
                        disabled={isDownloading}
                        aria-label={accessibleName}
                        className={error ? 'border-destructive' : ''}
                    >
                        {isDownloading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
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
            {/* On the page as well: a tooltip opens neither on a touch screen nor by itself. There
                from the start (out of the layout while empty), so a screen reader hears it change. */}
            <span role="status" className={error ? 'ml-2 text-xs text-destructive' : 'sr-only'}>
                {error && `Download failed: ${error}`}
            </span>
        </>
    );
}
