import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { AlertTriangle, ChevronRight, Cpu, Database, GitBranch, Info, Loader2, Users, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
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

interface TabConfig {
    id: FunctionTab;
    label: string;
    icon: typeof Database;
}

// Functions are capability aggregations without their own configuration surface,
// so Config is intentionally omitted to avoid 404s on `/functions/{id}/configurations`.
const FUNCTION_TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'hosts', label: 'Hosts', icon: Cpu },
    ...RESOURCE_TABS.filter((t) => t.id !== 'configurations'),
];

interface FunctionsPanelProps {
    functionId: string;
    functionName?: string;
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
export function FunctionsPanel({ functionId, functionName, description, path, onNavigate }: FunctionsPanelProps) {
    const [activeTab, setActiveTab] = useState<FunctionTab>('overview');
    const [hosts, setHosts] = useState<FunctionHost[]>([]);
    const [topics, setTopics] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { selectEntity, getFunctionHosts, fetchEntityData, fetchEntityOperations, listEntityFaults } = useAppStore(
        useShallow((state) => ({
            selectEntity: state.selectEntity,
            getFunctionHosts: state.getFunctionHosts,
            fetchEntityData: state.fetchEntityData,
            fetchEntityOperations: state.fetchEntityOperations,
            listEntityFaults: state.listEntityFaults,
        }))
    );

    // Load function resources on mount
    useEffect(() => {
        const loadFunctionData = async () => {
            setIsLoading(true);

            try {
                // Functions do not expose a configurations collection; skip that fetch
                // to avoid 404s on `/functions/{id}/configurations`.
                const [hostsData, topicsData, opsData, faultsData] = await Promise.all([
                    getFunctionHosts(functionId).catch(() => [] as unknown[]),
                    fetchEntityData('functions', functionId).catch(() => [] as ComponentTopic[]),
                    fetchEntityOperations('functions', functionId).catch(() => [] as Operation[]),
                    listEntityFaults('functions', functionId).catch(() => ({ items: [] as Fault[], count: 0 })),
                ]);

                // Normalize hosts - API returns objects with {id, name, href}
                const normalizedHosts = hostsData.map((h: unknown) => {
                    if (typeof h === 'string') {
                        return { id: h, name: h, href: `/api/v1/apps/${h}` };
                    }
                    const hostObj = h as FunctionHost;
                    return { id: hostObj.id, name: hostObj.name || hostObj.id, href: hostObj.href || '' };
                });

                setHosts(normalizedHosts);
                setTopics(topicsData);
                setOperations(opsData);
                setFaults(faultsData.items || []);
            } catch (error) {
                console.error('Failed to load function data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadFunctionData();
    }, [getFunctionHosts, fetchEntityData, fetchEntityOperations, listEntityFaults, functionId]);

    const handleResourceClick = (resourcePath: string) => {
        if (onNavigate) {
            onNavigate(resourcePath);
        } else {
            selectEntity(resourcePath);
        }
    };

    return (
        <div className="space-y-6">
            {/* Function Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900">
                            <GitBranch className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg truncate">{functionName || functionId}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                                <Badge variant="outline" className="text-violet-600 border-violet-300">
                                    function
                                </Badge>
                                <span className="text-muted-foreground">•</span>
                                <span className="font-mono text-xs">{path}</span>
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                {/* Tab Navigation */}
                <div className="px-6 pb-4">
                    <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
                        {FUNCTION_TABS.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActive = activeTab === tab.id;
                            let count = 0;
                            if (tab.id === 'hosts') count = hosts.length;
                            if (tab.id === 'data') count = topics.length;
                            if (tab.id === 'operations') count = operations.length;
                            if (tab.id === 'faults') count = faults.length;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                                        isActive
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                    }`}
                                >
                                    <TabIcon className="w-4 h-4" />
                                    {tab.label}
                                    {count > 0 && (
                                        <Badge
                                            variant={isActive ? 'default' : 'secondary'}
                                            className={`ml-1 h-5 px-1.5 ${tab.id === 'faults' && count > 0 ? 'bg-red-500 text-white' : ''}`}
                                        >
                                            {count}
                                        </Badge>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Card>

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
                                <Users className="w-4 h-4 text-emerald-500 mb-1" />
                                <div className="text-2xl font-semibold">{hosts.length}</div>
                                <div className="text-xs text-muted-foreground">Host Apps</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('data')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Database className="w-4 h-4 text-blue-500 mb-1" />
                                <div className="text-2xl font-semibold">{topics.length}</div>
                                <div className="text-xs text-muted-foreground">Data Items</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('operations')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Zap className="w-4 h-4 text-amber-500 mb-1" />
                                <div className="text-2xl font-semibold">{operations.length}</div>
                                <div className="text-xs text-muted-foreground">Operations</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('faults')}
                                className={`p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left ${faults.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : ''}`}
                            >
                                <AlertTriangle
                                    className={`w-4 h-4 mb-1 ${faults.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                                />
                                <div className="text-2xl font-semibold">{faults.length}</div>
                                <div className="text-xs text-muted-foreground">Faults</div>
                            </button>
                        </div>

                        {hosts.length === 0 && !isLoading && (
                            <div className="mt-4 text-center text-muted-foreground text-sm">
                                <GitBranch className="w-6 h-6 mx-auto mb-2 opacity-30" />
                                <p>No host apps are implementing this function yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'hosts' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-emerald-500" />
                            Host Apps
                        </CardTitle>
                        <CardDescription>Apps implementing this function</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {hosts.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No host apps found for this function.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {hosts.map((host) => (
                                    <div
                                        key={host.id}
                                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 cursor-pointer group"
                                        onClick={() => handleResourceClick(`/apps/${host.id}`)}
                                    >
                                        <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900">
                                            <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <span className="font-medium text-sm truncate flex-1">{host.name}</span>
                                        <span className="font-mono text-xs text-muted-foreground">{host.id}</span>
                                        <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                                            app
                                        </Badge>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                    </div>
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
                            <Database className="w-4 h-4 text-blue-500" />
                            Aggregated Data
                        </CardTitle>
                        <CardDescription>Data items from all host apps</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {topics.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No data items available.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {topics.map((topic, idx) => {
                                    const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${path}/data/${encodedName}`;
                                    return (
                                        <div
                                            key={topic.uniqueKey || `${topic.topic}-${idx}`}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer group"
                                            onClick={() => handleResourceClick(topicPath)}
                                        >
                                            <Badge variant="outline" className="text-blue-600 border-blue-300">
                                                topic
                                            </Badge>
                                            <span className="font-mono text-sm truncate flex-1">{topic.topic}</span>
                                            {topic.type && (
                                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                    {topic.type}
                                                </span>
                                            )}
                                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                        </div>
                                    );
                                })}
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
