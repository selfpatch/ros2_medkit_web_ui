import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { Box, Cpu, FileCode, Network } from 'lucide-react';
import { DataValuePreview } from '@/components/DataValuePreview';
import { DataRow, topicPathOf } from '@/components/DataRow';
import { ResourceReadError, readFailure } from '@/components/ResourceReadError';
import { SectionHeading } from '@/components/SectionHeading';
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
import { ResourceTabBar, type ResourceTabBarTab } from '@/components/ResourceTabBar';
import { RowGrid } from '@/components/RowGrid';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

type AppTab = 'overview' | ResourceTabId;

const BASE_APP_TABS: ResourceTabBarTab<AppTab>[] = [{ id: 'overview', label: 'Overview', icon: Cpu }, ...RESOURCE_TABS];

/** Why a resource of the app could not be read; a resource that was read has no entry */
interface ReadErrors {
    topics?: string;
    operations?: string;
    faults?: string;
}

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
    const [readErrors, setReadErrors] = useState<ReadErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    // Bumped by Retry to read everything again
    const [attempt, setAttempt] = useState(0);
    const retry = () => setAttempt((n) => n + 1);

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

    // Load app resources on mount and on Retry (configurations are loaded by ConfigurationPanel).
    // Each read stands on its own: one that fails (an error answer or no answer at all) is
    // reported as failed, not as an empty list.
    useEffect(() => {
        let current = true;
        const loadAppData = async () => {
            setIsLoading(true);
            const [topicsRead, opsRead, faultsRead] = await Promise.allSettled([
                fetchEntityData('apps', appId),
                fetchEntityOperations('apps', appId),
                listEntityFaults('apps', appId),
            ]);
            if (!current) return;

            const failed: ReadErrors = {};
            if (topicsRead.status === 'fulfilled') setTopics(topicsRead.value);
            else failed.topics = readFailure(topicsRead.reason);
            if (opsRead.status === 'fulfilled') setOperations(opsRead.value);
            else failed.operations = readFailure(opsRead.reason);
            if (faultsRead.status === 'fulfilled') setFaults(faultsRead.value.items);
            else failed.faults = readFailure(faultsRead.reason);
            setReadErrors(failed);
            setIsLoading(false);
        };

        void loadAppData();
        return () => {
            current = false;
        };
    }, [fetchEntityData, fetchEntityOperations, listEntityFaults, appId, attempt]);

    const handleResourceClick = (resourcePath: string) => {
        if (onNavigate) {
            onNavigate(resourcePath);
        } else {
            selectEntity(resourcePath);
        }
    };

    const publishTopics = topics.filter((t) => t.isPublisher);
    const subscribeTopics = topics.filter((t) => t.isSubscriber);
    const activeFaults = faults.filter((f) => f.status === 'active');

    // What each tab holds; a resource that could not be read has no count rather than 0
    const counts: Partial<Record<AppTab, number>> = { configurations: configurations.get(appId)?.length || 0 };
    if (!readErrors.topics) counts.data = topics.length;
    if (!readErrors.operations) counts.operations = operations.length;
    if (!readErrors.faults) counts.faults = activeFaults.length;

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
                    counts={counts}
                    alarmTab="faults"
                />
            </div>

            {/* The node's facts. How much it holds is on the tabs above. */}
            {activeTab === 'overview' && (
                <section className="space-y-2">
                    <SectionHeading>Node Information</SectionHeading>
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
                (readErrors.topics ? (
                    <ResourceReadError what="topics" reason={readErrors.topics} onRetry={retry} />
                ) : topics.length === 0 ? (
                    !isLoading && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No topics available for this app.
                        </p>
                    )
                ) : (
                    <section className="space-y-2">
                        {publishTopics.length + subscribeTopics.length > 0 && (
                            <p className="text-xs text-faint">
                                {publishTopics.length} published, {subscribeTopics.length} subscribed
                            </p>
                        )}
                        <RowGrid columns={1}>
                            {topics.map((topic, idx) => (
                                <DataRow
                                    key={topic.uniqueKey || `${topic.topic}-${idx}`}
                                    name={topic.topic}
                                    type={topic.type || undefined}
                                    lead={
                                        (topic.isPublisher || topic.isSubscriber) && (
                                            <span className="w-8 shrink-0 rounded-md bg-canvas py-0.5 text-center text-[11px] font-medium text-muted-foreground">
                                                {topic.isPublisher ? 'pub' : 'sub'}
                                            </span>
                                        )
                                    }
                                    preview={<DataValuePreview topic={topic} />}
                                    onSelect={() => handleResourceClick(topicPathOf(path, topic.topic))}
                                />
                            ))}
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
