import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { Box, ChevronRight, Cpu, Database, FileCode, Network } from 'lucide-react';
import { DataValuePreview } from '@/components/DataValuePreview';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import {
    RESOURCE_TABS,
    renderResourceTabContent,
    isResourceTabId,
    SCRIPTS_TAB,
    type ResourceTabId,
} from '@/components/ResourceTabs';
import { EntityStatusControl } from '@/components/EntityStatusControl';
import { ResourceTabBar } from '@/components/ResourceTabBar';
import { RowGrid } from '@/components/RowGrid';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

type AppTab = 'overview' | ResourceTabId;

interface TabConfig {
    id: AppTab;
    label: string;
    icon: typeof Database;
}

const BASE_APP_TABS: TabConfig[] = [{ id: 'overview', label: 'Overview', icon: Cpu }, ...RESOURCE_TABS];

interface AppsPanelProps {
    appId: string;
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
export function AppsPanel({ appId, fqn, nodeName, namespace, componentId, path, onNavigate }: AppsPanelProps) {
    const [activeTab, setActiveTab] = useState<AppTab>('overview');
    const [topics, setTopics] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { selectEntity, configurations, fetchEntityData, fetchEntityOperations, listEntityFaults, scriptsSupported } =
        useAppStore(
            useShallow((state) => ({
                selectEntity: state.selectEntity,
                configurations: state.configurations,
                fetchEntityData: state.fetchEntityData,
                fetchEntityOperations: state.fetchEntityOperations,
                listEntityFaults: state.listEntityFaults,
                scriptsSupported: state.scriptsSupported,
            }))
        );

    const appTabs = useMemo(
        () => (scriptsSupported ? [...BASE_APP_TABS, SCRIPTS_TAB] : BASE_APP_TABS),
        [scriptsSupported]
    );

    // Fall back to the default tab when the Scripts tab disappears (e.g. the
    // gateway capability flips off) while it is the active tab.
    useEffect(() => {
        if (!scriptsSupported && activeTab === 'scripts') setActiveTab('overview');
    }, [scriptsSupported, activeTab]);

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
            {/* What the app belongs to, its lifecycle (gateway 0.6.0 lifecycle API) and its tabs. Its
                name is the view's heading, in the toolbar. */}
            <div className="space-y-4">
                {/* Its component, unless the breadcrumb already leads through it */}
                {componentId && !path.split('/').includes(componentId) && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        Part of
                        <Button
                            variant="link"
                            className="h-auto p-0 text-sm"
                            onClick={() => {
                                const areaSegment =
                                    namespace && namespace.trim().length > 0
                                        ? namespace.split('/').filter(Boolean)[0] || 'root'
                                        : 'root';
                                handleResourceClick(`/${areaSegment}/${componentId}`);
                            }}
                        >
                            <Box className="w-3.5 h-3.5 mr-1" />
                            {componentId}
                        </Button>
                    </p>
                )}
                <EntityStatusControl entityType="apps" entityId={appId} />
                <ResourceTabBar
                    tabs={appTabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    counts={{
                        data: topics.length,
                        operations: operations.length,
                        configurations: configurations.get(appId)?.length || 0,
                        faults: activeFaults.length,
                    }}
                    alarmTab="faults"
                />
            </div>

            {/* Tab Content */}
            {/* The node's facts. How much it holds is on the tabs above. */}
            {activeTab === 'overview' && (
                <section className="space-y-2">
                    <h3 className="font-sans text-[13px] font-semibold tracking-normal text-foreground">
                        Node Information
                    </h3>
                    <RowGrid as="dl">
                        {[
                            { label: 'Node Name', icon: FileCode, value: nodeName || appId },
                            { label: 'Namespace', icon: Network, value: namespace || '/' },
                            {
                                label: 'Fully Qualified Name',
                                icon: Cpu,
                                value: fqn || `${namespace || '/'}${nodeName || appId}`,
                            },
                        ].map(({ label, icon: Icon, value }) => (
                            <div key={label} className="min-w-0 bg-white px-4 py-2.5">
                                <dt className="flex items-center gap-1.5 text-xs text-faint">
                                    <Icon className="size-3.5" aria-hidden />
                                    {label}
                                </dt>
                                <dd className="mt-0.5 truncate font-mono text-[13px] text-foreground" title={value}>
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </RowGrid>
                </section>
            )}

            {/* One row per topic, with its last value: one column, so the values have room */}
            {activeTab === 'data' &&
                (topics.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No topics available for this app.</p>
                ) : (
                    <section className="space-y-2">
                        {publishTopics.length + subscribeTopics.length > 0 && (
                            <p className="text-xs text-faint">
                                {publishTopics.length} published, {subscribeTopics.length} subscribed
                            </p>
                        )}
                        <RowGrid columns={1}>
                            {topics.map((topic, idx) => {
                                const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                                const topicPath = `${path}/data/${encodeURIComponent(cleanName)}`;
                                return (
                                    <button
                                        key={topic.uniqueKey || `${topic.topic}-${idx}`}
                                        type="button"
                                        onClick={() => handleResourceClick(topicPath)}
                                        className="group flex min-w-0 items-center gap-3 bg-white px-4 py-2.5 text-left outline-none transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                    >
                                        {(topic.isPublisher || topic.isSubscriber) && (
                                            <span className="w-8 shrink-0 rounded-md bg-canvas py-0.5 text-center text-[11px] font-medium text-muted-foreground">
                                                {topic.isPublisher ? 'pub' : 'sub'}
                                            </span>
                                        )}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-mono text-[13px] text-foreground">
                                                {topic.topic}
                                            </span>
                                            {topic.type && (
                                                <span className="block truncate text-xs text-faint">{topic.type}</span>
                                            )}
                                        </span>
                                        <DataValuePreview topic={topic} />
                                        <ChevronRight
                                            className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                                            aria-hidden
                                        />
                                    </button>
                                );
                            })}
                        </RowGrid>
                    </section>
                ))}

            {/* Operations / Configurations / Faults / Logs delegated to the shared helper */}
            {activeTab !== 'overview' &&
                activeTab !== 'data' &&
                isResourceTabId(activeTab) &&
                renderResourceTabContent(activeTab, appId, 'apps')}

            {isLoading && <div className="text-center text-muted-foreground py-4">Loading app resources...</div>}
        </div>
    );
}
