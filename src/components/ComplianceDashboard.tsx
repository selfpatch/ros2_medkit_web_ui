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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    ShieldCheck,
    RefreshCw,
    Download,
    Printer,
    Link2,
    AlertTriangle,
    Server,
    ChevronDown,
    ChevronRight,
    Loader2,
} from 'lucide-react';
import { normalizeBaseUrl } from '@selfpatch/ros2-medkit-client-ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppStore } from '@/lib/store';
import {
    fetchComplianceTimeline,
    ComplianceApiError,
    type ComplianceRecord,
    type ComplianceTimeline,
    type ComplianceTimelineResult,
} from '@/lib/compliance-api';
import { canExportCompliance, getUserRole } from '@/lib/role';

/** Badge variant for a severity label coming from the gateway. */
function severityBadgeVariant(label: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (label.toUpperCase()) {
        case 'CRITICAL':
        case 'ERROR':
            return 'destructive';
        case 'WARNING':
            return 'default';
        case 'INFO':
            return 'secondary';
        default:
            return 'outline';
    }
}

/** Format an int64 nanosecond timestamp into a human-readable local date-time. */
function formatNs(ns: number | null | undefined): string {
    if (ns === null || ns === undefined) return '-';
    // ns -> ms. Sub-millisecond precision is irrelevant for display and is
    // beyond Number's safe-integer range anyway.
    const date = new Date(ns / 1_000_000);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

/** A single confirmed-fault record, collapsible to reveal freeze frame + hashes. */
function ComplianceRow({ record }: { record: ComplianceRecord }) {
    const [open, setOpen] = useState(false);
    const freezeEntries = record.freeze_frame ? Object.entries(record.freeze_frame) : [];

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="rounded-lg border bg-card">
                <CollapsibleTrigger asChild>
                    <div className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="shrink-0 mt-0.5 compliance-no-print">
                            {open ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>
                        <div className="shrink-0 mt-0.5">
                            <Badge variant="outline" className="font-mono text-xs">
                                #{record.seq}
                            </Badge>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium">{record.fault_code}</span>
                                <Badge variant={severityBadgeVariant(record.severity_label)} className="text-xs">
                                    {record.severity_label}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    {record.status}
                                </Badge>
                                {record.cleared && (
                                    <Badge variant="outline" className="text-xs">
                                        cleared
                                    </Badge>
                                )}
                            </div>
                            {record.description && <p className="text-sm text-foreground">{record.description}</p>}
                            <div className="flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground flex-wrap">
                                <span>Occurred: {formatNs(record.occurred_at_ns)}</span>
                                <span>Confirmed: {formatNs(record.confirmed_at_ns)}</span>
                                <span>Last seen: {formatNs(record.last_occurred_at_ns)}</span>
                            </div>
                            {record.reporting_sources.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {record.reporting_sources.map((src) => (
                                        <Badge key={src} variant="outline" className="font-mono text-[10px]">
                                            {src}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-3 pb-3 pt-0 border-t">
                        <div className="pt-3 space-y-4">
                            {/* Freeze frame */}
                            <div>
                                <h5 className="text-sm font-medium text-muted-foreground mb-2">Freeze frame</h5>
                                {freezeEntries.length > 0 ? (
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        {freezeEntries.map(([key, value]) => (
                                            <div key={key} className="contents">
                                                <dt className="font-mono text-xs text-muted-foreground truncate">
                                                    {key}
                                                </dt>
                                                <dd className="font-mono text-xs break-all">
                                                    {typeof value?.data === 'object'
                                                        ? JSON.stringify(value.data)
                                                        : String(value?.data ?? '-')}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                ) : (
                                    <p className="text-sm text-muted-foreground italic">No freeze frame captured</p>
                                )}
                            </div>

                            {/* Hash chain links */}
                            <div className="space-y-1">
                                <h5 className="text-sm font-medium text-muted-foreground">Hash chain</h5>
                                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                                    <span className="text-muted-foreground">prev</span>
                                    <span className="font-mono break-all">{record.prev_hash}</span>
                                    <span className="text-muted-foreground">record</span>
                                    <span className="font-mono break-all">{record.record_hash}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

function ComplianceSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border space-y-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-10" />
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-64" />
                </div>
            ))}
        </div>
    );
}

/**
 * Compliance / NIS2 dashboard.
 *
 * Renders the gateway's tamper-evident, hash-chained confirmed-fault timeline
 * and offers Export (JSON download) and Print/PDF actions. The timeline is
 * always viewable; Export is gated to the Pro tier on the client (real
 * enforcement is server-side, see lib/role.ts).
 */
export function ComplianceDashboard() {
    const { serverUrl, isConnected } = useAppStore(
        useShallow((state) => ({
            serverUrl: state.serverUrl,
            isConnected: state.isConnected,
        }))
    );

    const baseUrl = isConnected && serverUrl ? normalizeBaseUrl(serverUrl) : null;

    const [result, setResult] = useState<ComplianceTimelineResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The compliance timeline is a Pro feature served by the commercial gateway.
    // Open-core gateways don't expose it, so a 404/501 is expected - degrade to
    // a calm "not available" notice instead of a scary error.
    const [notAvailable, setNotAvailable] = useState(false);

    // Role is read once on mount: it only changes via an explicit localStorage
    // override, which is not reactive.
    const role = useMemo(() => getUserRole(), []);
    const canExport = canExportCompliance(role);

    const abortRef = useRef<AbortController | null>(null);

    const load = useCallback(async () => {
        if (!baseUrl) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsLoading(true);
        setError(null);
        setNotAvailable(false);
        try {
            const res = await fetchComplianceTimeline(baseUrl, controller.signal);
            if (controller.signal.aborted) return;
            setResult(res);
        } catch (err) {
            if (controller.signal.aborted || (err as { name?: string })?.name === 'AbortError') return;
            // Endpoint missing (open-core gateway) -> degrade cleanly, not an error.
            if (err instanceof ComplianceApiError && (err.status === 404 || err.status === 501)) {
                setResult(null);
                setNotAvailable(true);
                return;
            }
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (!controller.signal.aborted) setIsLoading(false);
        }
    }, [baseUrl]);

    useEffect(() => {
        load();
        return () => abortRef.current?.abort();
    }, [load]);

    const handleExport = useCallback(() => {
        if (!result) return;
        // Download the raw response body so the int64 timestamps and the hash
        // chain are preserved byte-for-byte (re-stringifying would corrupt them).
        const blob = new Blob([result.raw], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const date = new Date().toISOString().slice(0, 10);
        link.download = `compliance_timeline_${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [result]);

    const handlePrint = useCallback(() => window.print(), []);

    const timeline: ComplianceTimeline | null = result?.timeline ?? null;

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Server className="h-10 w-10 mb-3 opacity-50" />
                <p className="font-medium">Not connected</p>
                <p className="text-sm mt-1">Connect to a gateway to view the compliance timeline.</p>
            </div>
        );
    }

    return (
        <div className="compliance-report space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-muted-foreground" />
                                Compliance / NIS2
                            </CardTitle>
                            <CardDescription>
                                Tamper-evident, hash-chained timeline of confirmed faults.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 compliance-no-print">
                            {canExport && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExport}
                                    disabled={!result}
                                    title="Download the timeline as JSON"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Export
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrint}
                                disabled={!timeline}
                                title="Print or save as PDF"
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                Print / PDF
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={load}
                                disabled={isLoading}
                                aria-label="Refresh timeline"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                {timeline && (
                    <CardContent>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="secondary">
                                {timeline.record_count} record{timeline.record_count !== 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[10px] uppercase">
                                {timeline.chain_algorithm}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                Generated {formatNs(timeline.generated_at_ns)}
                            </span>
                        </div>
                        <div className="mt-3 flex items-start gap-2 text-xs">
                            <Link2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <span className="text-muted-foreground">Chain head: </span>
                                <span className="font-mono break-all">{timeline.chain_head}</span>
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            {isLoading && !timeline ? (
                <Card>
                    <CardContent className="pt-6">
                        <ComplianceSkeleton />
                    </CardContent>
                </Card>
            ) : notAvailable ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
                            <p className="font-medium">Compliance timeline not available</p>
                            <p className="text-sm mt-1">
                                This gateway does not serve the compliance timeline. It is a Pro-tier
                                feature.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : error ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-destructive">
                            <AlertTriangle className="h-10 w-10 mb-3" />
                            <p className="font-medium">Failed to load compliance timeline</p>
                            <p className="text-sm mt-1">{error}</p>
                        </div>
                    </CardContent>
                </Card>
            ) : timeline && timeline.records.length === 0 ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
                            <p className="font-medium">No confirmed faults recorded</p>
                            <p className="text-sm mt-1">The audit timeline is empty.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : timeline ? (
                <Card>
                    <CardContent className="pt-4 space-y-2">
                        {timeline.records.map((record) => (
                            <ComplianceRow key={record.seq} record={record} />
                        ))}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Loading...
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
