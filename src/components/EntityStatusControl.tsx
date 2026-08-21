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

import { useEffect, useRef, useState, useCallback } from 'react';
import { Activity, AlertCircle, Loader2, Play, Power, RotateCw, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore, entityStatusKey } from '@/lib/store';
import { setStatus, type LifecycleEntityType } from '@/lib/api-dispatch';
import type { LifecycleAction } from '@/lib/types';

interface EntityStatusControlProps {
    entityType: LifecycleEntityType;
    entityId: string;
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

/** Transitions disabled for a given cached readiness value. */
const DISABLED_BY_STATUS: Record<string, Set<LifecycleAction>> = {
    ready: new Set<LifecycleAction>(['start']),
    notReady: new Set<LifecycleAction>(['restart', 'force-restart', 'shutdown', 'force-shutdown']),
};

/** Destructive transitions get the destructive confirm-button variant. */
const DESTRUCTIVE_ACTIONS = new Set<LifecycleAction>(['shutdown', 'force-shutdown']);

/**
 * Message carried by an openapi-fetch error value, which is the parsed JSON body
 * when there is one and the raw text otherwise. Returns '' when the body held
 * nothing usable, so callers can fall back to a status-derived message.
 */
function errorMessageOf(error: unknown): string {
    if (typeof error === 'string') return error.trim();
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') return message.trim();
    }
    return '';
}

/** Fallback for a failed transition whose response body said nothing. */
function failureMessage(action: LifecycleAction, httpStatus: number | undefined): string {
    return httpStatus ? `Failed to ${action}: the gateway answered HTTP ${httpStatus}` : `Failed to ${action}`;
}

/**
 * Entity lifecycle status control for apps and components (gateway 0.6.0
 * lifecycle API). Shows the current readiness as a badge and exposes the five
 * lifecycle transitions as buttons.
 *
 * Status is read from the shared `statusByEntity` store slice (the single
 * source of truth, also feeding the tree readiness lamp). Actions are gated by
 * that status (disabled + tooltip), and every transition except Start asks for
 * confirmation before dispatch.
 *
 * The gateway returns 501 until a lifecycle provider is configured. That case
 * surfaces as the cached value `'unavailable'` -> a disabled "not available"
 * state rather than an error toast, so the control degrades gracefully on stock
 * gateways.
 */
export function EntityStatusControl({ entityType, entityId }: EntityStatusControlProps) {
    const client = useAppStore((s) => s.client);
    const status = useAppStore((s) => s.statusByEntity[entityStatusKey(entityType, entityId)]);
    const fetchEntityStatus = useAppStore((s) => s.fetchEntityStatus);
    const setActuationSupported = useAppStore((s) => s.setActuationSupported);
    const actuationSupported = useAppStore((s) => s.actuationSupported);

    const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
    const [confirmAction, setConfirmAction] = useState<LifecycleAction | null>(null);
    const [error, setError] = useState<string | null>(null);

    // The entity this control is currently showing. A transition already in
    // flight captured the entity it was dispatched against, and resolves against
    // whatever is selected by then; comparing the two is what keeps its result
    // off an unrelated entity's panel.
    const shownKey = entityStatusKey(entityType, entityId);
    const shownKeyRef = useRef(shownKey);
    shownKeyRef.current = shownKey;

    // Fetch the live status on mount; the slice de-dupes against the tree lamp.
    // The control is rendered at a fixed position in EntityDetailPanel and
    // AppsPanel, so a new selection changes entityId without remounting: the
    // per-entity UI state has to be cleared here or it belongs to the previous
    // entity.
    useEffect(() => {
        setError(null);
        setPendingAction(null);
        setConfirmAction(null);
        fetchEntityStatus(entityType, entityId);
    }, [entityType, entityId, fetchEntityStatus]);

    const notAvailable = status === 'unavailable';
    // A 501 from any transition means the gateway has no actuation provider:
    // disable every action (Start included), gateway-wide.
    const actuationUnsupported = actuationSupported === false;

    const isDisabled = (action: LifecycleAction): boolean =>
        !client ||
        notAvailable ||
        actuationUnsupported ||
        pendingAction !== null ||
        (DISABLED_BY_STATUS[status ?? '']?.has(action) ?? false);

    const tooltipFor = (action: LifecycleAction): string => {
        if (actuationUnsupported) return 'Not implemented by this gateway';
        if (status === 'ready' && action === 'start') return 'Already running';
        if (status === 'notReady' && DISABLED_BY_STATUS.notReady!.has(action)) return 'Entity is not running';
        return '';
    };

    const dispatchAction = useCallback(
        async (action: LifecycleAction) => {
            if (!client) return;
            const dispatchedFor = entityStatusKey(entityType, entityId);
            const stillShown = () => shownKeyRef.current === dispatchedFor;
            setPendingAction(action);
            setError(null);
            try {
                const result = await setStatus(client, entityType, entityId, action);
                const httpStatus = result.response?.status;
                if (httpStatus === 501) {
                    // The gateway has no actuation provider: record it gateway-wide
                    // so every transition button disables, and warn (not error) -
                    // this is a missing capability, not a failed request.
                    setActuationSupported(false);
                    const msg = errorMessageOf(result.error);
                    toast.warning(`${action} is not implemented by this gateway${msg ? `: ${msg}` : ''}`);
                    return;
                }
                // Success is the HTTP status, never the truthiness of `error`.
                // openapi-fetch yields a falsy `error` on a failed request whenever
                // the body carries nothing it can parse - `undefined` for 204/HEAD
                // or `Content-Length: 0`, `''` for an empty body with no
                // Content-Length - which a proxy or an aborting gateway produces on
                // a 5xx. Branching on `error` reports those as a completed
                // transition and marks the gateway as able to actuate.
                if (!result.response?.ok) {
                    const message = errorMessageOf(result.error) || failureMessage(action, httpStatus);
                    // The toast names the entity, so it stays useful after the
                    // selection moves on; the inline error does not.
                    if (stillShown()) setError(message);
                    toast.error(`Failed to ${action} ${entityId}: ${message}`);
                    return;
                }
                // Any 2xx proves the gateway can actuate; clear a stale "unsupported".
                setActuationSupported(true);
                toast.success(`${action} requested for ${entityId}`);
                await fetchEntityStatus(entityType, entityId);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                if (stillShown()) setError(message);
                toast.error(`Failed to ${action} ${entityId}: ${message}`);
            } finally {
                // A late finish must not clear a spinner that now belongs to a
                // transition dispatched against the newly selected entity.
                if (stillShown()) setPendingAction(null);
            }
        },
        [client, entityType, entityId, fetchEntityStatus, setActuationSupported]
    );

    const handleClick = useCallback(
        (action: LifecycleAction) => {
            // Start is non-destructive: dispatch immediately. Everything else
            // interrupts a running entity, so confirm first.
            if (action === 'start') {
                void dispatchAction(action);
            } else {
                setConfirmAction(action);
            }
        },
        [dispatchAction]
    );

    const handleConfirm = useCallback(() => {
        if (confirmAction) {
            void dispatchAction(confirmAction);
        }
        setConfirmAction(null);
    }, [confirmAction, dispatchAction]);

    const confirmLabel = confirmAction ? (ACTIONS.find((a) => a.action === confirmAction)?.label ?? confirmAction) : '';

    const statusBadge = (() => {
        if (status === 'ready') {
            return (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                    ready
                </Badge>
            );
        }
        if (status === 'notReady') {
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
                    const disabled = isDisabled(action);
                    const tip = disabled ? tooltipFor(action) : '';
                    const button = (
                        <Button
                            key={action}
                            variant={variant}
                            size="sm"
                            disabled={disabled}
                            onClick={() => handleClick(action)}
                        >
                            {isPending ? (
                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            ) : (
                                <Icon className="w-4 h-4 mr-1.5" />
                            )}
                            {label}
                        </Button>
                    );

                    // A disabled button does not fire pointer events, so wrap it
                    // in a focusable span to let the tooltip explain why.
                    if (tip) {
                        return (
                            <Tooltip key={action}>
                                <TooltipTrigger asChild>
                                    <span tabIndex={0}>{button}</span>
                                </TooltipTrigger>
                                <TooltipContent>{tip}</TooltipContent>
                            </Tooltip>
                        );
                    }
                    return button;
                })}
            </div>

            {actuationUnsupported && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Transitions not implemented by this gateway (yet)
                </span>
            )}

            {error && !notAvailable && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}

            <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm {confirmLabel}?</DialogTitle>
                        <DialogDescription>
                            This will {confirmLabel.toLowerCase()} {entityId}. The transition interrupts the entity and
                            may trigger faults.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant={
                                confirmAction && DESTRUCTIVE_ACTIONS.has(confirmAction) ? 'destructive' : 'default'
                            }
                            size="sm"
                            onClick={handleConfirm}
                        >
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
