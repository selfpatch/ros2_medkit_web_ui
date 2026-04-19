import { useState } from 'react';
import { Radio, RefreshCw, Copy, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { JsonFormViewer } from '@/components/JsonFormViewer';
import { TopicPublishForm } from '@/components/TopicPublishForm';
import type { ComponentTopic, TopicEndpoint, QosProfile, SovdResourceEntityType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

interface DataPanelProps {
    /** Data item from the API */
    topic: ComponentTopic;
    /** Entity ID for publishing */
    entityId: string;
    /** Entity type for API endpoint */
    entityType?: SovdResourceEntityType;
    /** Whether a refresh is in progress */
    isRefreshing?: boolean;
    /** Callback when refresh is requested */
    onRefresh?: () => void;
}

/**
 * Format QoS profile for display
 */
function formatQos(qos: QosProfile): string {
    const parts = [
        qos.reliability !== 'unknown' ? qos.reliability : null,
        qos.durability !== 'volatile' ? qos.durability : null,
        qos.history === 'keep_last' ? `depth=${qos.depth}` : qos.history,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'default';
}

/**
 * Check if QoS profiles are compatible between publishers and subscribers
 */
function checkQosCompatibility(
    publishers: TopicEndpoint[],
    subscribers: TopicEndpoint[]
): {
    compatible: boolean;
    warning?: string;
} {
    if (publishers.length === 0 || subscribers.length === 0) {
        return { compatible: true };
    }

    // Check reliability mismatch (RELIABLE sub needs RELIABLE pub)
    const reliableSubs = subscribers.filter((s) => s.qos.reliability === 'reliable');
    const bestEffortPubs = publishers.filter((p) => p.qos.reliability === 'best_effort');

    if (reliableSubs.length > 0 && bestEffortPubs.length > 0) {
        return {
            compatible: false,
            warning: 'QoS mismatch: Reliable subscribers cannot receive from best_effort publishers',
        };
    }

    // Check durability mismatch (TRANSIENT_LOCAL sub may not get late-joining data from VOLATILE pub)
    const transientSubs = subscribers.filter((s) => s.qos.durability === 'transient_local');
    const volatilePubs = publishers.filter((p) => p.qos.durability === 'volatile');

    if (transientSubs.length > 0 && volatilePubs.length > 0) {
        return {
            compatible: true,
            warning: 'Transient local subscribers may miss late-joining data from volatile publishers',
        };
    }

    return { compatible: true };
}

/**
 * Connection Status Section
 */
function ConnectionStatus({ topic }: { topic: ComponentTopic }) {
    const pubCount = topic.publisher_count ?? topic.publishers?.length ?? 0;
    const subCount = topic.subscriber_count ?? topic.subscribers?.length ?? 0;
    const hasData = topic.status === 'data' && topic.data !== null && topic.data !== undefined;

    const qosCheck = checkQosCompatibility(topic.publishers || [], topic.subscribers || []);

    const statusIcon = hasData ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
    ) : pubCount > 0 ? (
        <AlertTriangle className="w-4 h-4 text-amber-500" />
    ) : (
        <XCircle className="w-4 h-4 text-muted-foreground" />
    );

    const statusText = hasData ? 'Active' : pubCount > 0 ? 'Waiting for data' : 'No publishers';

    return (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className="text-sm font-medium">{statusText}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                            {pubCount} pub
                        </Badge>
                    </span>
                    <span className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                            {subCount} sub
                        </Badge>
                    </span>
                </div>
            </div>

            {/* QoS Warning */}
            {qosCheck.warning && (
                <div
                    className={cn(
                        'flex items-start gap-2 text-xs p-2 rounded',
                        qosCheck.compatible ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'
                    )}
                >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{qosCheck.warning}</span>
                </div>
            )}
        </div>
    );
}

/**
 * QoS Details Section
 */
function QosDetails({ publishers, subscribers }: { publishers?: TopicEndpoint[]; subscribers?: TopicEndpoint[] }) {
    const [isOpen, setIsOpen] = useState(false);

    if ((!publishers || publishers.length === 0) && (!subscribers || subscribers.length === 0)) {
        return null;
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
                    <span className="text-xs font-medium">QoS Details</span>
                    <span className="text-xs text-muted-foreground">{isOpen ? 'Hide' : 'Show'}</span>
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
                {publishers && publishers.length > 0 && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Publishers</div>
                        <div className="space-y-1">
                            {publishers.map((pub, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50"
                                >
                                    <span className="font-mono truncate">{pub.fqn}</span>
                                    <span className="text-muted-foreground">{formatQos(pub.qos)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {subscribers && subscribers.length > 0 && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Subscribers</div>
                        <div className="space-y-1">
                            {subscribers.map((sub, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50"
                                >
                                    <span className="font-mono truncate">{sub.fqn}</span>
                                    <span className="text-muted-foreground">{formatQos(sub.qos)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}

/**
 * DataPanel - Full diagnostic view for a data item
 */
export function DataPanel({
    topic,
    entityId,
    entityType = 'components',
    isRefreshing = false,
    onRefresh,
}: DataPanelProps) {
    // Use nullish coalescing so legitimate falsy scalars (0, false, '') are
    // preserved as the initial publish value instead of collapsing to `{}`.
    const [publishValue, setPublishValue] = useState<unknown>(topic.type_info?.default_value ?? topic.data ?? {});

    const isConnected = useAppStore((state) => state.isConnected);
    const hasData = topic.status === 'data' && topic.data !== null && topic.data !== undefined;
    // `access` is the explicit per-item write capability; when present it
    // overrides the legacy "any typed topic is publishable" heuristic so a
    // read-only data item never surfaces a write form. Falsy scalar values
    // (0, false, '') count as present - checking truthiness of `topic.data`
    // would incorrectly hide the write form for e.g. a counter reading 0.
    const hasTypeHint = !!(topic.type || topic.type_info);
    const hasValuePresent = topic.data !== null && topic.data !== undefined;
    const canWrite =
        isConnected &&
        (topic.access === 'write' ||
            topic.access === 'readwrite' ||
            (topic.access !== 'read' && (hasTypeHint || hasValuePresent)));
    // Use "Write Value" when the gateway told us this is a writable scalar
    // (access === 'write' / 'readwrite'); fall back to "Publish Message" for
    // streaming topics where the operation really is a publish.
    const writeSectionLabel =
        topic.access === 'write' || topic.access === 'readwrite' ? 'Write Value' : 'Publish Message';

    const handleCopyFromLast = () => {
        // Presence check, not truthiness, so a reported value of exactly 0
        // (or false / empty string) still copies into the publish form.
        if (topic.data !== null && topic.data !== undefined) {
            setPublishValue(JSON.parse(JSON.stringify(topic.data)));
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <Radio className={cn('w-5 h-5 shrink-0', hasData ? 'text-primary' : 'text-muted-foreground')} />
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <CardTitle className="text-base">{topic.topic}</CardTitle>
                                {topic.type && (
                                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                        {topic.type}
                                    </span>
                                )}
                            </div>
                            <CardDescription className="text-xs mt-1">Data diagnostics and access</CardDescription>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                        <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Connection Status */}
                <ConnectionStatus topic={topic} />

                {/* QoS Details (collapsible) */}
                <QosDetails publishers={topic.publishers} subscribers={topic.subscribers} />

                {/* Last Received Value */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Last Received Value</span>
                        {hasData && (
                            <Button variant="ghost" size="sm" onClick={handleCopyFromLast} className="h-7 text-xs">
                                <Copy className="w-3 h-3 mr-1" />
                                Copy to Publish
                            </Button>
                        )}
                    </div>
                    {hasData ? (
                        <JsonFormViewer
                            data={topic.data}
                            schema={topic.type_info?.schema}
                            editable={false}
                            timestamp={topic.timestamp}
                        />
                    ) : (
                        <div className="rounded-lg border bg-muted/30 p-4 text-center">
                            <p className="text-sm text-muted-foreground">
                                {topic.status === 'metadata_only'
                                    ? 'No data received yet. Schema available for publishing.'
                                    : 'Topic exists but is not publishing messages.'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Write/Publish Section */}
                {canWrite && (
                    <div className="border-t pt-4 space-y-2">
                        <span className="text-sm font-medium">{writeSectionLabel}</span>
                        <TopicPublishForm
                            topic={topic}
                            entityId={entityId}
                            entityType={entityType}
                            initialValue={publishValue}
                            onValueChange={setPublishValue}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default DataPanel;
