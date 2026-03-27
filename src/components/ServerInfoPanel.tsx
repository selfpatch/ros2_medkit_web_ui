import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { Server, Info, CheckCircle2, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/lib/store';
import type { ServerCapabilities, VersionInfo } from '@/lib/types';

/**
 * Server Info Panel - displays SOVD server capabilities and version info
 *
 * Shows:
 * - SOVD specification version
 * - Server implementation name/version
 * - Supported features list
 * - Available entry points (API collections)
 */
export function ServerInfoPanel() {
    const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { isConnected, serverUrl, getServerCapabilities, getVersionInfoAction } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            getServerCapabilities: state.getServerCapabilities,
            getVersionInfoAction: state.getVersionInfoAction,
        }))
    );

    useEffect(() => {
        const loadServerInfo = async () => {
            if (!isConnected) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const [caps, version] = await Promise.all([
                    getServerCapabilities().catch(() => null),
                    getVersionInfoAction().catch(() => null),
                ]);

                setCapabilities(caps as ServerCapabilities | null);
                setVersionInfo(version);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load server info');
            } finally {
                setIsLoading(false);
            }
        };

        loadServerInfo();
    }, [isConnected, getServerCapabilities, getVersionInfoAction]);

    if (!isConnected) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                        <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Connect to a server to view its information.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-4 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                        <p className="text-sm">Could not load server information.</p>
                        <p className="text-xs text-muted-foreground mt-1">{error}</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Extract first SOVD info entry for cleaner access
    const sovdInfo = versionInfo?.items?.[0];

    return (
        <div className="space-y-6">
            {/* Server Overview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Server className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">
                                {sovdInfo?.vendor_info?.name || capabilities?.server_name || 'ros2_medkit Gateway'}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-green-600 border-green-300">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Connected
                                </Badge>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-mono text-xs truncate max-w-[200px]">{serverUrl}</span>
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="text-sm text-muted-foreground mb-1">SOVD Version</div>
                            <p className="font-mono text-sm">
                                {sovdInfo?.version || capabilities?.sovd_version || 'Unknown'}
                            </p>
                        </div>
                        {sovdInfo?.vendor_info?.version && (
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="text-sm text-muted-foreground mb-1">Implementation Version</div>
                                <p className="font-mono text-sm">{sovdInfo.vendor_info.version}</p>
                            </div>
                        )}
                        {capabilities?.server_version && (
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="text-sm text-muted-foreground mb-1">Server Version</div>
                                <p className="font-mono text-sm">{capabilities.server_version}</p>
                            </div>
                        )}
                        {sovdInfo?.base_uri && (
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="text-sm text-muted-foreground mb-1">Base URI</div>
                                <p className="font-mono text-sm">{sovdInfo.base_uri}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Supported Features */}
            {capabilities?.supported_features && capabilities.supported_features.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Supported Features
                        </CardTitle>
                        <CardDescription>Capabilities available on this server</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {capabilities.supported_features.map((feature) => (
                                <Badge key={feature} variant="secondary" className="font-mono text-xs">
                                    {feature}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Entry Points / Collections */}
            {capabilities?.entry_points && Object.keys(capabilities.entry_points).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-blue-500" />
                            API Entry Points
                        </CardTitle>
                        <CardDescription>Available resource collections</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {Object.entries(capabilities.entry_points).map(([name, url]) => (
                                <div
                                    key={name}
                                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                                >
                                    <span className="font-medium text-sm">{name}</span>
                                    <span className="font-mono text-xs text-muted-foreground truncate ml-4 max-w-[200px]">
                                        {url}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
