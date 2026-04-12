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

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { Package, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { normalizeBaseUrl } from '@selfpatch/ros2-medkit-client-ts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UpdateCard, type UpdateAction } from '@/components/UpdateCard';
import { useUpdatesPolling } from '@/hooks/useUpdatesPolling';
import { triggerPrepare, triggerExecute, triggerAutomated, deleteUpdate } from '@/lib/updates-api';
import { useAppStore } from '@/lib/store';

export function UpdatesDashboard() {
    const { serverUrl, isConnected } = useAppStore(
        useShallow((state) => ({
            serverUrl: state.serverUrl,
            isConnected: state.isConnected,
        }))
    );

    const baseUrl = isConnected && serverUrl ? normalizeBaseUrl(serverUrl) : null;

    const { updates, isLoading, error, notAvailable, refresh } = useUpdatesPolling(baseUrl);

    const summary = useMemo(() => {
        let active = 0;
        let failed = 0;
        let completed = 0;
        for (const u of updates) {
            if (!u.status) continue;
            if (u.status.status === 'pending' || u.status.status === 'inProgress') active++;
            else if (u.status.status === 'failed') failed++;
            else if (u.status.status === 'completed') completed++;
        }
        return { active, failed, completed };
    }, [updates]);

    const handleAction = useCallback(
        async (id: string, action: UpdateAction) => {
            if (!baseUrl) return;
            if (action === 'delete') {
                const confirmed = window.confirm(`Delete update "${id}"? This cannot be undone.`);
                if (!confirmed) return;
            }
            try {
                if (action === 'prepare') await triggerPrepare(baseUrl, id);
                else if (action === 'execute') await triggerExecute(baseUrl, id);
                else if (action === 'automated') await triggerAutomated(baseUrl, id);
                else if (action === 'delete') await deleteUpdate(baseUrl, id);
                toast.success(`${action} triggered for ${id}`);
                refresh();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
            }
        },
        [baseUrl, refresh]
    );

    const header = (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Software Updates</h2>
                {summary.active > 0 && <Badge variant="default">{summary.active} active</Badge>}
                {summary.failed > 0 && <Badge variant="destructive">{summary.failed} failed</Badge>}
                {summary.completed > 0 && <Badge variant="secondary">{summary.completed} completed</Badge>}
            </div>
            <Button variant="outline" size="sm" aria-label="Refresh updates" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
            </Button>
        </div>
    );

    if (isLoading && updates.length === 0) {
        return (
            <div>
                {header}
                <div className="grid gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-lg" />
                    ))}
                </div>
                <p className="mt-4 text-sm text-center text-muted-foreground">loading updates...</p>
            </div>
        );
    }

    if (notAvailable) {
        return (
            <div>
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <AlertTriangle className="h-10 w-10 mb-3 opacity-50" />
                            <p className="font-medium">Software updates not available on this gateway</p>
                            <p className="text-sm mt-1">The gateway does not support the updates API (501).</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-destructive">
                            <AlertTriangle className="h-10 w-10 mb-3" />
                            <p className="font-medium">Failed to load updates</p>
                            <p className="text-sm mt-1">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (updates.length === 0) {
        return (
            <div>
                {header}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <Package className="h-10 w-10 mb-3 opacity-30" />
                            <p className="font-medium">No software updates registered</p>
                            <p className="text-sm mt-1">Updates appear here once the gateway reports them.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div>
            {header}
            <div className="grid gap-4 md:grid-cols-2">
                {updates.map((entry) => (
                    <UpdateCard key={entry.id} entry={entry} baseUrl={baseUrl} onAction={handleAction} />
                ))}
            </div>
        </div>
    );
}
