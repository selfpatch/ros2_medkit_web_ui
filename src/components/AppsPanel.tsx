import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { Cpu, Database, Zap, Settings, AlertTriangle, ChevronRight, Box, Network, FileCode } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import { FaultsPanel } from '@/components/FaultsPanel';
import { OperationsPanel } from '@/components/OperationsPanel';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

type AppTab = 'overview' | 'data' | 'operations' | 'configurations' | 'faults';

interface TabConfig {
    id: AppTab;
    label: string;
    icon: typeof Database;
}

const APP_TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: Cpu },
    { id: 'data', label: 'Data', icon: Database },
    { id: 'operations', label: 'Operations', icon: Zap },
    { id: 'configurations', label: 'Config', icon: Settings },
    { id: 'faults', label: 'Faults', icon: AlertTriangle },
];

interface AppsPanelProps {
    appId: string;
    appName?: string;
    fqn?: string;
    nodeName?: string;
    namespace?: string;
    componentId?: string;
    path: string;
    onNavigate?: (path: string) => void;
}

/**
 * Apps Panel - displays app (ROS 2 node) entity details
 *
 * Apps are individual ROS 2 nodes in SOVD. They have:
 * - Data (topics they publish/subscribe to)
 * - Operations (services/actions they provide)
 * - Configurations (parameters)
 * - Faults (diagnostic trouble codes)
 */
export function AppsPanel({ appId, appName, fqn, nodeName, namespace, componentId, path, onNavigate }: AppsPanelProps) {
    const [activeTab, setActiveTab] = useState<AppTab>('overview');
    const [topics, setTopics] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { selectEntity, configurations, fetchEntityData, fetchEntityOperations, listEntityFaults } = useAppStore(
        useShallow((state) => ({
            selectEntity: state.selectEntity,
            configurations: state.configurations,
            fetchEntityData: state.fetchEntityData,
            fetchEntityOperations: state.fetchEntityOperations,
            listEntityFaults: state.listEntityFaults,
        }))
    );

    // Load app resources on mount (configurations are loaded by ConfigurationPanel)
    useEffect(() => {
        const loadAppData = async () => {
            setIsLoading(true);

            try {
                // Load resources in parallel (configurations handled by ConfigurationPanel)
                const [topicsData, opsData, faultsData] = await Promise.all([
                    fetchEntityData('apps', appId).catch(() => [] as ComponentTopic[]),
                    fetchEntityOperations('apps', appId).catch(() => [] as Operation[]),
                    listEntityFaults('apps', appId).catch(() => ({ items: [] as Fault[], count: 0 })),
                ]);

                setTopics(topicsData);
                setOperations(opsData);
                setFaults(faultsData.items);
            } catch (error) {
                console.error('Failed to load app data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadAppData();
    }, [fetchEntityData, fetchEntityOperations, listEntityFaults, appId]);

    const handleResourceClick = (resourcePath: string) => {
        if (onNavigate) {
            onNavigate(resourcePath);
        } else {
            selectEntity(resourcePath);
        }
    };

    // Count resources for badges
    const publishTopics = topics.filter((t) => t.isPublisher);
    const subscribeTopics = topics.filter((t) => t.isSubscriber);
    const activeFaults = faults.filter((f) => f.status === 'active');

    return (
        <div className="space-y-6">
            {/* App Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900">
                            <Cpu className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg truncate">{appName || nodeName || appId}</CardTitle>
                            <CardDescription className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                                    app
                                </Badge>
                                {componentId && (
                                    <>
                                        <span className="text-muted-foreground">•</span>
                                        <Button
                                            variant="link"
                                            className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                                            onClick={() => {
                                                const areaSegment =
                                                    namespace && namespace.trim().length > 0
                                                        ? namespace.split('/').filter(Boolean)[0] || 'root'
                                                        : 'root';
                                                handleResourceClick(`/${areaSegment}/${componentId}`);
                                            }}
                                        >
                                            <Box className="w-3 h-3 mr-1" />
                                            {componentId}
                                        </Button>
                                    </>
                                )}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                {/* Tab Navigation */}
                <div className="px-6 pb-4">
                    <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
                        {APP_TABS.map((tab) => {
                            const TabIcon = tab.icon;
                            const isActive = activeTab === tab.id;
                            let count = 0;
                            if (tab.id === 'data') count = topics.length;
                            if (tab.id === 'operations') count = operations.length;
                            if (tab.id === 'configurations') count = configurations.get(appId)?.length || 0;
                            if (tab.id === 'faults') count = activeFaults.length;

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
                        <CardTitle className="text-base">Node Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <FileCode className="w-4 h-4" />
                                    <span>Node Name</span>
                                </div>
                                <p className="font-mono text-sm mt-1">{nodeName || appId}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Network className="w-4 h-4" />
                                    <span>Namespace</span>
                                </div>
                                <p className="font-mono text-sm mt-1">{namespace || '/'}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 md:col-span-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Cpu className="w-4 h-4" />
                                    <span>Fully Qualified Name</span>
                                </div>
                                <p className="font-mono text-sm mt-1">
                                    {fqn || `${namespace || '/'}${nodeName || appId}`}
                                </p>
                            </div>
                        </div>

                        {/* Resource Summary */}
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button
                                onClick={() => setActiveTab('data')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Database className="w-4 h-4 text-blue-500 mb-1" />
                                <div className="text-2xl font-semibold">{topics.length}</div>
                                <div className="text-xs text-muted-foreground">Topics</div>
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
                                onClick={() => setActiveTab('configurations')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <Settings className="w-4 h-4 text-purple-500 mb-1" />
                                <div className="text-2xl font-semibold">{configurations.get(appId)?.length || 0}</div>
                                <div className="text-xs text-muted-foreground">Parameters</div>
                            </button>
                            <button
                                onClick={() => setActiveTab('faults')}
                                className="p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                            >
                                <AlertTriangle
                                    className={`w-4 h-4 mb-1 ${activeFaults.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
                                />
                                <div
                                    className={`text-2xl font-semibold ${activeFaults.length > 0 ? 'text-red-500' : ''}`}
                                >
                                    {activeFaults.length}
                                </div>
                                <div className="text-xs text-muted-foreground">Active Faults</div>
                            </button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'data' && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-500" />
                            Topics
                        </CardTitle>
                        <CardDescription>
                            {publishTopics.length} published, {subscribeTopics.length} subscribed
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {topics.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                No topics available for this app.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {topics.map((topic, idx) => {
                                    const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                                    const encodedName = encodeURIComponent(topic.uniqueKey || cleanName);
                                    const topicPath = `${path}/data/${encodedName}`;

                                    return (
                                        <div
                                            key={topic.uniqueKey || `${topic.topic}-${idx}`}
                                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer group"
                                            onClick={() => handleResourceClick(topicPath)}
                                        >
                                            <Badge
                                                variant={topic.isPublisher ? 'default' : 'secondary'}
                                                className={
                                                    topic.isPublisher
                                                        ? 'bg-green-500/10 text-green-600 border-green-300'
                                                        : 'bg-blue-500/10 text-blue-600 border-blue-300'
                                                }
                                            >
                                                {topic.isPublisher ? 'pub' : 'sub'}
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

            {activeTab === 'operations' && <OperationsPanel entityId={appId} entityType="apps" />}

            {activeTab === 'configurations' && <ConfigurationPanel entityId={appId} entityType="apps" />}

            {activeTab === 'faults' && <FaultsPanel entityId={appId} entityType="apps" />}

            {isLoading && <div className="text-center text-muted-foreground py-4">Loading app resources...</div>}
        </div>
    );
}
