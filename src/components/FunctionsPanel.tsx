import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { AlertTriangle, ChevronRight, Cpu, Database, GitBranch, Info, Loader2, Users, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { badgeVariants } from '@/components/ui/badge';
import { DataValuePreview } from '@/components/DataValuePreview';
import { topicPathOf } from '@/components/DataRow';
import { ResourceReadError, readFailure } from '@/components/ResourceReadError';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ResourceTabBar, type ResourceTabBarTab } from '@/components/ResourceTabBar';
import {
    RESOURCE_TABS,
    renderResourceTabContent,
    isResourceTabId,
    type ResourceTabId,
} from '@/components/ResourceTabs';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

/** Host app object returned from /functions/{id}/hosts */
interface FunctionHost {
    id: string;
    name: string;
    href: string;
}

type FunctionTab = 'overview' | 'hosts' | ResourceTabId;

// Functions are capability aggregations without their own configuration surface,
// so Config is intentionally omitted to avoid 404s on `/functions/{id}/configurations`.
const FUNCTION_TABS: ResourceTabBarTab<FunctionTab>[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'hosts', label: 'Hosts', icon: Cpu },
    ...RESOURCE_TABS.filter((t) => t.id !== 'configurations'),
];

/** Why a resource of the function could not be read; a resource that was read has no entry */
interface ReadErrors {
    hosts?: string;
    topics?: string;
    operations?: string;
    faults?: string;
}

interface FunctionsPanelProps {
    functionId: string;
    description?: string;
    path: string;
    onNavigate?: (path: string) => void;
}

/**
 * Functions Panel - displays function (capability grouping) entity details
 *
 * Functions are capability groupings in SOVD. They can have:
 * - Hosts (apps that implement this function)
 * - Data (aggregated from all hosts)
 * - Operations (aggregated from all hosts)
 */
export function FunctionsPanel({ functionId, description, path, onNavigate }: FunctionsPanelProps) {
    const [activeTab, setActiveTab] = useState<FunctionTab>('overview');
    const [hosts, setHosts] = useState<FunctionHost[]>([]);
    const [topics, setTopics] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);
    const [readErrors, setReadErrors] = useState<ReadErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    // Bumped by Retry to read everything again
    const [attempt, setAttempt] = useState(0);
    const retry = () => setAttempt((n) => n + 1);

    const { selectEntity, getFunctionHosts, fetchEntityData, fetchEntityOperations, listEntityFaults } = useAppStore(
        useShallow((state) => ({
            selectEntity: state.selectEntity,
            getFunctionHosts: state.getFunctionHosts,
            fetchEntityData: state.fetchEntityData,
            fetchEntityOperations: state.fetchEntityOperations,
            listEntityFaults: state.listEntityFaults,
        }))
    );

    // Load function resources on mount and on Retry. Each read stands on its own: one that fails
    // (an error answer or no answer at all) is reported as failed, not as an empty list.
    useEffect(() => {
        let current = true;
        const loadFunctionData = async () => {
            setIsLoading(true);
            // Functions do not expose a configurations collection; skip that fetch
            // to avoid 404s on `/functions/{id}/configurations`.
            const [hostsRead, topicsRead, opsRead, faultsRead] = await Promise.allSettled([
                getFunctionHosts(functionId),
                fetchEntityData('functions', functionId),
                fetchEntityOperations('functions', functionId),
                listEntityFaults('functions', functionId),
            ]);
            if (!current) return;

            const failed: ReadErrors = {};
            if (hostsRead.status === 'fulfilled') {
                // Normalize hosts - API returns objects with {id, name, href}
                setHosts(
                    hostsRead.value.map((h: unknown) => {
                        if (typeof h === 'string') {
                            return { id: h, name: h, href: `/api/v1/apps/${h}` };
                        }
                        const hostObj = h as FunctionHost;
                        return { id: hostObj.id, name: hostObj.name || hostObj.id, href: hostObj.href || '' };
                    })
                );
            } else {
                failed.hosts = readFailure(hostsRead.reason);
            }
            if (topicsRead.status === 'fulfilled') setTopics(topicsRead.value);
            else failed.topics = readFailure(topicsRead.reason);
            if (opsRead.status === 'fulfilled') setOperations(opsRead.value);
            else failed.operations = readFailure(opsRead.reason);
            if (faultsRead.status === 'fulfilled') setFaults(faultsRead.value.items || []);
            else failed.faults = readFailure(faultsRead.reason);
            setReadErrors(failed);
            setIsLoading(false);
        };

        void loadFunctionData();
        return () => {
            current = false;
        };
    }, [getFunctionHosts, fetchEntityData, fetchEntityOperations, listEntityFaults, functionId, attempt]);

    const handleResourceClick = (resourcePath: string) => {
        if (onNavigate) {
            onNavigate(resourcePath);
        } else {
            selectEntity(resourcePath);
        }
    };

    // What each tab holds; a resource that could not be read has no count rather than 0
    const counts: Partial<Record<FunctionTab, number>> = {};
    if (!readErrors.hosts) counts.hosts = hosts.length;
    if (!readErrors.topics) counts.data = topics.length;
    if (!readErrors.operations) counts.operations = operations.length;
    if (!readErrors.faults) counts.faults = faults.length;

    return (
        <div className="space-y-6">
            {/* Its name is the view's heading, in the toolbar */}
            <ResourceTabBar
                tabs={FUNCTION_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                counts={counts}
                alarmTab="faults"
            />

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Function Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {description && (
                            <div className="p-3 rounded-lg bg-muted/50 mb-4">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                    <Info className="w-4 h-4" />
                                    <span>Description</span>
                                </div>
                                <p className="text-sm">{description}</p>
                            </div>
                        )}

                        {/* Resource Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button
                                onClick={() => setActiveTab('hosts')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Users className="w-4 h-4 text-faint mb-1" />
                                <div className="text-2xl font-semibold">{readErrors.hosts ? '-' : hosts.length}</div>
                                <div className="text-xs text-muted-foreground">Host Apps</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('data')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Database className="w-4 h-4 text-faint mb-1" />
                                <div className="text-2xl font-semibold">{readErrors.topics ? '-' : topics.length}</div>
                                <div className="text-xs text-muted-foreground">Data Items</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('operations')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Zap className="w-4 h-4 text-faint mb-1" />
                                <div className="text-2xl font-semibold">
                                    {readErrors.operations ? '-' : operations.length}
                                </div>
                                <div className="text-xs text-muted-foreground">Operations</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('faults')}
                                className={`p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left ${faults.length > 0 ? 'border-state-fault/40 bg-state-fault-bg' : ''}`}
                            >
                                <AlertTriangle
                                    className={`w-4 h-4 mb-1 ${faults.length > 0 ? 'text-state-fault' : 'text-muted-foreground'}`}
                                />
                                <div className="text-2xl font-semibold">{readErrors.faults ? '-' : faults.length}</div>
                                <div className="text-xs text-muted-foreground">Faults</div>
                            </button>
                        </div>

                        {readErrors.hosts ? (
                            <ResourceReadError what="hosts" reason={readErrors.hosts} onRetry={retry} />
                        ) : (
                            hosts.length === 0 &&
                            !isLoading && (
                                <div className="mt-4 text-center text-muted-foreground text-sm">
                                    <GitBranch className="w-6 h-6 mx-auto mb-2 opacity-30" />
                                    <p>No host apps are implementing this function yet.</p>
                                </div>
                            )
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'hosts' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-faint" />
                            Host Apps
                        </CardTitle>
                        <CardDescription>Apps implementing this function</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {readErrors.hosts ? (
                            <ResourceReadError what="hosts" reason={readErrors.hosts} onRetry={retry} />
                        ) : hosts.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No host apps found for this function.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {hosts.map((host) => (
                                    <button
                                        type="button"
                                        key={host.id}
                                        className="flex w-full items-center gap-3 p-3 rounded-lg border text-left hover:bg-accent/30 cursor-pointer group"
                                        onClick={() => handleResourceClick(`/apps/${host.id}`)}
                                    >
                                        <span className="p-1.5 rounded bg-canvas-2">
                                            <Cpu className="w-4 h-4 text-body" aria-hidden />
                                        </span>
                                        <span className="font-medium text-sm truncate flex-1">{host.name}</span>
                                        <span className="font-mono text-xs text-muted-foreground">{host.id}</span>
                                        <span
                                            className={cn(
                                                badgeVariants({ variant: 'outline' }),
                                                'text-muted-foreground'
                                            )}
                                        >
                                            app
                                        </span>
                                        <ChevronRight
                                            className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100"
                                            aria-hidden
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'data' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Database className="w-4 h-4 text-faint" />
                            Aggregated Data
                        </CardTitle>
                        <CardDescription>Data items from all host apps</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {readErrors.topics ? (
                            <ResourceReadError what="data items" reason={readErrors.topics} onRetry={retry} />
                        ) : topics.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No data items available.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {topics.map((topic, idx) => (
                                    <button
                                        type="button"
                                        key={topic.uniqueKey || `${topic.topic}-${idx}`}
                                        className="flex w-full items-center gap-3 p-2 rounded-lg text-left hover:bg-accent/50 cursor-pointer group"
                                        onClick={() => handleResourceClick(topicPathOf(path, topic.topic))}
                                    >
                                        <span
                                            className={cn(
                                                badgeVariants({ variant: 'outline' }),
                                                'text-muted-foreground'
                                            )}
                                        >
                                            topic
                                        </span>
                                        <span className="font-mono text-sm truncate flex-1">{topic.topic}</span>
                                        <DataValuePreview topic={topic} />
                                        {topic.type && (
                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                {topic.type}
                                            </span>
                                        )}
                                        <ChevronRight
                                            className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100"
                                            aria-hidden
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Operations / Configurations / Faults / Logs delegated to the shared helper */}
            {activeTab !== 'overview' &&
                activeTab !== 'hosts' &&
                activeTab !== 'data' &&
                isResourceTabId(activeTab) &&
                renderResourceTabContent(activeTab, functionId, 'functions')}

            {isLoading && (
                <Card>
                    <CardContent className="py-8 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
