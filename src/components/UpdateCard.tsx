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

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Loader2, AlertCircle, FileText } from 'lucide-react';
import { fetchUpdateDetail } from '@/lib/updates-api';
import type { UpdateEntry, UpdateStatus, UpdateStatusValue } from '@/lib/types';

export type UpdateAction = 'prepare' | 'execute' | 'automated' | 'delete';

interface UpdateCardProps {
    entry: UpdateEntry;
    baseUrl?: string | null;
    busy?: boolean;
    onAction?: (id: string, action: UpdateAction) => void;
}

type BadgeVariant = 'outline' | 'default' | 'secondary' | 'destructive';

function statusBadgeVariant(status: UpdateStatusValue): BadgeVariant {
    switch (status) {
        case 'pending':
            return 'outline';
        case 'inProgress':
            return 'default';
        case 'completed':
            return 'secondary';
        case 'failed':
            return 'destructive';
    }
}

function progressBarColor(status: UpdateStatusValue): string {
    switch (status) {
        case 'inProgress':
            return 'bg-blue-500';
        case 'completed':
            return 'bg-green-500';
        case 'failed':
            return 'bg-red-500';
        default:
            return 'bg-gray-400';
    }
}

function actionButtonsForStatus(status: UpdateStatus): UpdateAction[] {
    // SOVD collapses the prepare + execute pipeline into a single
    // `completed` terminal status. Plugins that split the pipeline (e.g.
    // uptane_ota) keep the real phase on the `x-medkit-phase` vendor field,
    // so when status=completed + phase=prepared we are only half done and
    // must surface Execute / Delete. Any other completed update (phase
    // missing or `executed`) is truly terminal and only Delete applies.
    const phase = status['x-medkit-phase'];
    switch (status.status) {
        case 'pending':
            return ['prepare', 'execute', 'automated', 'delete'];
        case 'inProgress':
            return [];
        case 'completed':
            return phase === 'prepared' ? ['execute', 'delete'] : ['delete'];
        case 'failed':
            return ['prepare', 'execute', 'delete'];
    }
}

function clampProgress(value: number): number {
    return Math.min(100, Math.max(0, value));
}

function displayProgress(status: UpdateStatusValue, progress: number | undefined): number | undefined {
    if (status === 'completed') return 100;
    if (progress === undefined) return undefined;
    return clampProgress(progress);
}

function actionLabel(action: UpdateAction): string {
    switch (action) {
        case 'prepare':
            return 'Prepare';
        case 'execute':
            return 'Execute';
        case 'automated':
            return 'Automated';
        case 'delete':
            return 'Delete';
    }
}

export function UpdateCard({ entry, baseUrl, busy, onAction }: UpdateCardProps) {
    const { id, status } = entry;
    const [detailOpen, setDetailOpen] = useState(false);
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const detailAbortRef = useRef<AbortController | null>(null);

    const handleViewDetails = useCallback(async () => {
        if (!baseUrl) return;
        detailAbortRef.current?.abort();
        const controller = new AbortController();
        detailAbortRef.current = controller;
        setDetail(null);
        setDetailOpen(true);
        setDetailLoading(true);
        try {
            const data = await fetchUpdateDetail(baseUrl, id, controller.signal);
            if (!controller.signal.aborted) {
                setDetail(data);
            }
        } catch {
            if (!controller.signal.aborted) {
                setDetail({ error: 'Failed to load details' });
            }
        } finally {
            if (!controller.signal.aborted) {
                setDetailLoading(false);
            }
        }
    }, [baseUrl, id]);

    const handleDetailClose = useCallback((open: boolean) => {
        if (!open) {
            detailAbortRef.current?.abort();
        }
        setDetailOpen(open);
    }, []);

    useEffect(() => {
        return () => {
            detailAbortRef.current?.abort();
        };
    }, []);

    const isFailed = status?.status === 'failed';

    return (
        <Card className={isFailed ? 'border-red-300 dark:border-red-800' : undefined}>
            <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 shrink-0" />
                        <span className="truncate">{id}</span>
                    </CardTitle>
                    {status && <Badge variant={statusBadgeVariant(status.status)}>{status.status}</Badge>}
                </div>
            </CardHeader>

            <CardContent className="py-2 px-4 space-y-3">
                {status === null && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Status unavailable</span>
                    </div>
                )}

                {status !== null && status !== undefined && (
                    <>
                        {(() => {
                            const value = displayProgress(status.status, status.progress);
                            if (value === undefined) return null;
                            return (
                                <div
                                    role="progressbar"
                                    aria-label={`Progress for update ${id}`}
                                    aria-valuenow={value}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    className="w-full h-2 rounded-full bg-muted overflow-hidden"
                                >
                                    <div
                                        className={`h-full ${progressBarColor(status.status)} transition-all`}
                                        style={{ width: `${value}%` }}
                                    />
                                </div>
                            );
                        })()}

                        {status.sub_progress && status.sub_progress.length > 0 && (
                            <ul className="space-y-1">
                                {status.sub_progress.map((sub) => {
                                    const value = displayProgress(status.status, sub.progress) ?? 0;
                                    return (
                                        <li key={sub.name} className="flex items-center gap-2 text-xs">
                                            <span className="w-24 shrink-0 text-muted-foreground truncate">
                                                {sub.name}
                                            </span>
                                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full ${progressBarColor(status.status)}`}
                                                    style={{ width: `${value}%` }}
                                                />
                                            </div>
                                            <span className="w-9 text-right tabular-nums">{value}%</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {status.error && (
                            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{status.error}</span>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                            {onAction &&
                                actionButtonsForStatus(status).map((action) => (
                                    <Button
                                        key={action}
                                        size="sm"
                                        variant={action === 'delete' ? 'destructive' : 'outline'}
                                        disabled={busy}
                                        onClick={() => onAction(id, action)}
                                    >
                                        {actionLabel(action)}
                                    </Button>
                                ))}
                            {baseUrl && (
                                <Button size="sm" variant="ghost" onClick={handleViewDetails}>
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    Details
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </CardContent>

            <Dialog open={detailOpen} onOpenChange={handleDetailClose}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Update: {id}</DialogTitle>
                    </DialogHeader>
                    {detailLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading details...
                        </div>
                    ) : (
                        <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(detail, null, 2)}
                        </pre>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
