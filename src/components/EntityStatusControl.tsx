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

import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Activity, AlertCircle, Loader2, Play, Power, RotateCw, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { getStatus, setStatus, type LifecycleEntityType } from '@/lib/api-dispatch';
import type { LifecycleAction, LifecycleStatus } from '@/lib/types';

interface EntityStatusControlProps {
    entityType: LifecycleEntityType;
    entityId: string;
    /** Initial readiness value from the entity detail (AppDetail/ComponentDetail.status). */
    status?: string;
}

interface ActionConfig {
    action: LifecycleAction;
    label: string;
    icon: typeof Play;
    /** Destructive transitions use the destructive button variant. */
    variant: 'outline' | 'destructive';
}

const ACTIONS: ActionConfig[] = [
    { action: 'start', label: 'Start', icon: Play, variant: 'outline' },
    { action: 'restart', label: 'Restart', icon: RotateCw, variant: 'outline' },
    { action: 'force-restart', label: 'Force restart', icon: Zap, variant: 'outline' },
    { action: 'shutdown', label: 'Shutdown', icon: Power, variant: 'destructive' },
    { action: 'force-shutdown', label: 'Force shutdown', icon: Power, variant: 'destructive' },
];

/** Narrow an arbitrary status string to the known readiness union, else null. */
function toLifecycleStatus(value: string | undefined): LifecycleStatus | null {
    return value === 'ready' || value === 'notReady' ? value : null;
}

/**
 * Entity lifecycle status control for apps and components (gateway 0.6.0
 * lifecycle API). Shows the current readiness as a badge and exposes the five
 * lifecycle transitions as buttons.
 *
 * The gateway returns 501 until a lifecycle provider is configured. That case
 * is surfaced as a disabled "not available" state rather than an error toast,
 * so the control degrades gracefully on stock gateways.
 */
export function EntityStatusControl({ entityType, entityId, status }: EntityStatusControlProps) {
    const { client } = useAppStore(useShallow((state) => ({ client: state.client })));

    const [currentStatus, setCurrentStatus] = useState<LifecycleStatus | null>(toLifecycleStatus(status));
    const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
    const [notAvailable, setNotAvailable] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refresh the live status from the gateway, replacing the prop-seeded value.
    const refreshStatus = useCallback(
        async (signal?: AbortSignal) => {
            if (!client) return;
            const result = await getStatus(client, entityType, entityId, signal);
            if (signal?.aborted) return;
            if (result.response.status === 501) {
                setNotAvailable(true);
                return;
            }
            if (result.data && typeof result.data.status === 'string') {
                const next = toLifecycleStatus(result.data.status);
                if (next) setCurrentStatus(next);
            }
        },
        [client, entityType, entityId]
    );

    useEffect(() => {
        const controller = new AbortController();
        refreshStatus(controller.signal).catch(() => {
            // On-mount status fetch is best-effort; the prop value remains shown.
        });
        return () => controller.abort();
    }, [refreshStatus]);

    const handleAction = useCallback(
        async (action: LifecycleAction) => {
            if (!client) return;
            setPendingAction(action);
            setError(null);
            try {
                const result = await setStatus(client, entityType, entityId, action);
                if (result.response.status === 501) {
                    setNotAvailable(true);
                    return;
                }
                if (result.error) {
                    const message = result.error.message || `Failed to ${action}`;
                    setError(message);
                    toast.error(`Failed to ${action} ${entityId}: ${message}`);
                    return;
                }
                toast.success(`${action} requested for ${entityId}`);
                await refreshStatus();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(message);
                toast.error(`Failed to ${action} ${entityId}: ${message}`);
            } finally {
                setPendingAction(null);
            }
        },
        [client, entityType, entityId, refreshStatus]
    );

    const statusBadge = (() => {
        if (currentStatus === 'ready') {
            return (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                    ready
                </Badge>
            );
        }
        if (currentStatus === 'notReady') {
            return (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                    notReady
                </Badge>
            );
        }
        return <Badge variant="secondary">unknown</Badge>;
    })();

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    Lifecycle
                </span>
                {statusBadge}
                {notAvailable && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <AlertCircle className="w-3.5 h-3.5" />
                        not available
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {ACTIONS.map(({ action, label, icon: Icon, variant }) => {
                    const isPending = pendingAction === action;
                    return (
                        <Button
                            key={action}
                            variant={variant}
                            size="sm"
                            disabled={!client || notAvailable || pendingAction !== null}
                            onClick={() => handleAction(action)}
                        >
                            {isPending ? (
                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            ) : (
                                <Icon className="w-4 h-4 mr-1.5" />
                            )}
                            {label}
                        </Button>
                    );
                })}
            </div>

            {error && !notAvailable && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
