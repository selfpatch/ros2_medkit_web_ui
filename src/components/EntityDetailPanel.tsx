import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/shallow';
import { toast } from 'react-toastify';
import { Copy, Radio, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { EntityDetailSkeleton } from '@/components/EntityDetailSkeleton';
import { DataPanel } from '@/components/DataPanel';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import { OperationsPanel } from '@/components/OperationsPanel';
import { RESOURCE_TABS, renderResourceTabContent, SCRIPTS_TAB, type ResourceTabId } from '@/components/ResourceTabs';
import { AreasPanel } from '@/components/AreasPanel';
import { AppsPanel } from '@/components/AppsPanel';
import { FunctionsPanel } from '@/components/FunctionsPanel';
import { ServerInfoPanel } from '@/components/ServerInfoPanel';
import { FaultsDashboard } from '@/components/FaultsDashboard';
import { UpdatesDashboard } from '@/components/UpdatesDashboard';
import { EntityStatusControl } from '@/components/EntityStatusControl';
import { EntityToolbar } from '@/components/EntityToolbar';
import { SidebarLine } from '@/components/SidebarToggle';
import { ResourceTabBar } from '@/components/ResourceTabBar';
import { RowGrid } from '@/components/RowGrid';
import { DataRow, topicPathOf } from '@/components/DataRow';
import { SectionHeading } from '@/components/SectionHeading';
import { copyText } from '@/lib/clipboard';
import { useAppStore, findNode, type AppState } from '@/lib/store';
import type { ComponentTopic, Parameter, SovdResourceEntityType } from '@/lib/types';

/** What the main pane shows: the selected entity, or one of the gateway-wide dashboards */
export type ViewMode = 'entity' | 'faults-dashboard' | 'updates-dashboard';

type ComponentTab = ResourceTabId;

/**
 * Determine entity type for API calls based on entity type
 */
function getEntityTypeForApi(entityType: string | undefined): SovdResourceEntityType {
    switch (entityType) {
        case 'app':
            return 'apps';
        case 'component':
        case 'subcomponent':
            return 'components';
        case 'function':
            return 'functions';
        case 'area':
        case 'subarea':
            return 'areas';
        default:
            return 'components'; // default fallback
    }
}

/**
 * Component tab content - renders based on active tab
 */
interface ComponentTabContentProps {
    activeTab: ComponentTab;
    entityId: string;
    selectedPath: string;
    selectedEntity: NonNullable<AppState['selectedEntity']>;
    hasTopicsInfo: boolean;
    selectEntity: (path: string) => void;
    entityType: SovdResourceEntityType;
    topicsData: ComponentTopic[] | null;
}

function ComponentTabContent({
    activeTab,
    entityId,
    selectedPath,
    selectedEntity,
    hasTopicsInfo,
    selectEntity,
    entityType,
    topicsData,
}: ComponentTabContentProps) {
    if (activeTab === 'data') {
        return (
            <DataTabContent
                selectedPath={selectedPath}
                selectedEntity={selectedEntity}
                hasTopicsInfo={hasTopicsInfo}
                selectEntity={selectEntity}
                topicsData={topicsData}
            />
        );
    }
    return <>{renderResourceTabContent(activeTab, entityId, entityType)}</>;
}

/**
 * Data tab content - shows data items.
 *
 * `topicsData` uses a three-state convention:
 *   - `null`   -> parent fetch is still in flight, render a skeleton
 *   - `[]`     -> fetch completed with no items, fall through to topicsInfo / empty state
 *   - `[...]`  -> render the list
 *
 * This lets the tab distinguish "loading" from "loaded empty" without a
 * second self-fetch or a duplicate network request.
 */
interface DataTabContentProps {
    selectedPath: string;
    selectedEntity: NonNullable<AppState['selectedEntity']>;
    hasTopicsInfo: boolean;
    selectEntity: (path: string) => void;
    topicsData: ComponentTopic[] | null;
}

/** The narrowest a data column gets: room for most topic names and message types, longer ones are cut */
const DATA_COLUMN = '20rem';

const TOPIC_ICON = <Radio className="size-4 shrink-0 text-faint" aria-hidden />;

function DataTabContent({
    selectedPath,
    selectedEntity,
    hasTopicsInfo,
    selectEntity,
    topicsData,
}: DataTabContentProps) {
    if (topicsData === null) {
        return (
            <RowGrid aria-busy="true" minColumn={DATA_COLUMN}>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[52px] animate-pulse bg-white" />
                ))}
            </RowGrid>
        );
    }

    // topicsData is loaded at this point. Prefer it over the entity-level fallback
    // so we never surface stale `selectedEntity.topics` when the fresh fetch is empty.
    const topics = topicsData.length > 0 ? topicsData : (selectedEntity.topics as ComponentTopic[] | undefined) || [];

    if (topics.length > 0) {
        return (
            <RowGrid minColumn={DATA_COLUMN}>
                {topics.map((topic) => (
                    <DataRow
                        key={topic.uniqueKey || topic.topic}
                        name={topic.topic}
                        type={topic.type || 'Unknown Type'}
                        lead={TOPIC_ICON}
                        onSelect={() => selectEntity(topicPathOf(selectedPath, topic.topic))}
                    />
                ))}
            </RowGrid>
        );
    }

    if (hasTopicsInfo) {
        const topicsInfo = selectedEntity.topicsInfo as NonNullable<typeof selectedEntity.topicsInfo>;
        const sections = [
            { label: 'Publishes', icon: ArrowUp, items: topicsInfo.publishes },
            { label: 'Subscribes', icon: ArrowDown, items: topicsInfo.subscribes },
        ].filter((section) => section.items.length > 0);
        return (
            <div className="space-y-5">
                {sections.map(({ label, icon: Icon, items }) => (
                    <section key={label} className="space-y-2">
                        <SectionHeading>
                            <Icon className="size-4 text-faint" aria-hidden />
                            {label}
                            <span className="text-xs font-normal tabular-nums text-faint">{items.length}</span>
                        </SectionHeading>
                        <RowGrid minColumn={DATA_COLUMN}>
                            {items.map((topic: string) => (
                                <DataRow
                                    key={topic}
                                    name={topic}
                                    lead={TOPIC_ICON}
                                    onSelect={() => selectEntity(topicPathOf(selectedPath, topic))}
                                />
                            ))}
                        </RowGrid>
                    </section>
                ))}
            </div>
        );
    }

    return <p className="py-6 text-center text-sm text-muted-foreground">No data available for this component.</p>;
}

/**
 * Operation (Service/Action) detail card
 * Shows the full OperationsPanel with the selected operation highlighted
 */
interface OperationDetailCardProps {
    entity: NonNullable<AppState['selectedEntity']>;
    entityId: string;
    entityType: SovdResourceEntityType;
}

function OperationDetailCard({ entity, entityId, entityType }: OperationDetailCardProps) {
    // Render full OperationsPanel with the specific operation highlighted
    return <OperationsPanel entityId={entityId} highlightOperation={entity.name} entityType={entityType} />;
}

/**
 * Parameter detail: its type and whether it can be written, then the configuration
 * with this parameter highlighted. Its name is the view's heading, in the toolbar.
 */
interface ParameterDetailCardProps {
    entity: NonNullable<AppState['selectedEntity']>;
    entityId: string;
    entityType: SovdResourceEntityType;
}

function ParameterDetailCard({ entity, entityId, entityType }: ParameterDetailCardProps) {
    const parameterData = entity.data as Parameter | undefined;

    if (!parameterData) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                Parameter data not available. Select from the Configurations tab.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Badge variant="outline">{parameterData.type}</Badge>
                {parameterData.read_only && <Badge variant="secondary">Read-only</Badge>}
            </div>
            <ConfigurationPanel entityId={entityId} highlightParam={entity.name} entityType={entityType} />
        </div>
    );
}

/** A view with no toolbar of its own: the way back to a folded sidebar on top, then the content */
function PlainView({ children }: { children: ReactNode }) {
    return (
        <main className="flex-1 overflow-y-auto bg-background">
            <SidebarLine />
            <div className="max-w-6xl p-6">{children}</div>
        </main>
    );
}

interface EntityDetailPanelProps {
    onConnectClick: () => void;
    viewMode?: ViewMode;
    onEntitySelect?: () => void;
}

export function EntityDetailPanel({ onConnectClick, viewMode = 'entity', onEntitySelect }: EntityDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<ComponentTab>('data');
    const [resourceCounts, setResourceCounts] = useState<Record<ResourceTabId, number>>({
        data: 0,
        operations: 0,
        configurations: 0,
        faults: 0,
        logs: 0,
        scripts: 0,
    });
    // Store fetched topics data for the Data tab. `null` means "not yet loaded
    // for the current entity" so the Data tab can render a skeleton instead of
    // an empty-state flash while the fetch is in flight. `[]` means "loaded,
    // no items". `[...]` means "loaded with items".
    const [topicsData, setTopicsData] = useState<ComponentTopic[] | null>(null);

    const {
        selectedPath,
        selectedEntity,
        rootEntities,
        isLoadingDetails,
        isRefreshing,
        isConnected,
        selectEntity,
        refreshSelectedEntity,
        prefetchResourceCounts,
        fetchEntityData,
        scriptsSupported,
    } = useAppStore(
        useShallow((state: AppState) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            rootEntities: state.rootEntities,
            isLoadingDetails: state.isLoadingDetails,
            isRefreshing: state.isRefreshing,
            isConnected: state.isConnected,
            selectEntity: state.selectEntity,
            refreshSelectedEntity: state.refreshSelectedEntity,
            prefetchResourceCounts: state.prefetchResourceCounts,
            fetchEntityData: state.fetchEntityData,
            scriptsSupported: state.scriptsSupported,
        }))
    );

    const componentTabs = useMemo(
        () => (scriptsSupported ? [...RESOURCE_TABS, SCRIPTS_TAB] : RESOURCE_TABS),
        [scriptsSupported]
    );

    // Notify parent when entity is selected
    useEffect(() => {
        if (selectedPath && onEntitySelect) {
            onEntitySelect();
        }
    }, [selectedPath, onEntitySelect]);

    // Fall back to the default tab when the Scripts tab disappears (e.g. the
    // gateway capability flips off) while it is the active tab.
    useEffect(() => {
        if (!scriptsSupported && activeTab === 'scripts') setActiveTab('data');
    }, [scriptsSupported, activeTab]);

    // Reset the component-view resource tab to Data when the entity changes,
    // so switching between components doesn't show stale tab state.
    useEffect(() => {
        setActiveTab('data');
    }, [selectedEntity?.id]);

    // Fetch resource counts when entity changes
    useEffect(() => {
        const emptyCounts: Record<ResourceTabId, number> = {
            data: 0,
            operations: 0,
            configurations: 0,
            faults: 0,
            logs: 0,
            scripts: 0,
        };
        // Guard against late results from a previous entity overwriting the
        // current entity's state. The cleanup aborts in-flight requests AND
        // flips `cancelled` so any setState calls after the entity changed
        // become no-ops (covers transforms that ignore the abort signal).
        const controller = new AbortController();
        let cancelled = false;
        const doFetchResourceCounts = async () => {
            // Mark topicsData as "not loaded yet for the current entity" so the
            // Data tab renders a skeleton instead of an empty-state flash while
            // the fetch is in flight. Any previous entity's data is discarded.
            setTopicsData(null);

            if (!selectedEntity) {
                setResourceCounts(emptyCounts);
                setTopicsData([]);
                return;
            }

            const entityId = selectedEntity.id;
            const isComponent = selectedEntity.type === 'component' || selectedEntity.type === 'subcomponent';
            const isApp = selectedEntity.type === 'app';
            const isArea = selectedEntity.type === 'area' || selectedEntity.type === 'subarea';
            const isFunction = selectedEntity.type === 'function';

            // Only fetch counts for entity types that have resources
            if (!isComponent && !isApp && !isArea && !isFunction) {
                setResourceCounts(emptyCounts);
                setTopicsData([]);
                return;
            }

            // Determine entity type for API calls
            let entityType: SovdResourceEntityType = 'components';
            if (isApp) entityType = 'apps';
            else if (isArea) entityType = 'areas';
            else if (isFunction) entityType = 'functions';

            try {
                // Fetch resource counts and data in parallel
                const [counts, dataRes] = await Promise.all([
                    prefetchResourceCounts(entityType, entityId, controller.signal),
                    fetchEntityData(entityType, entityId, controller.signal).catch(() => [] as ComponentTopic[]),
                ]);

                if (cancelled) return;

                // Store the fetched data for the Data tab
                const fetchedData = Array.isArray(dataRes) ? dataRes : [];
                setTopicsData(fetchedData);

                // Use the already-fetched data length instead of a separate request
                setResourceCounts({ ...counts, data: fetchedData.length, logs: 0, scripts: 0 });
            } catch {
                if (cancelled) return;
                // On unexpected failure fall back to "loaded empty" so the UI
                // doesn't get stuck showing the skeleton forever.
                setTopicsData([]);
            }
        };

        doFetchResourceCounts();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [selectedEntity, prefetchResourceCounts, fetchEntityData]);

    const handleCopyEntity = async () => {
        if (!selectedEntity) return;
        if (await copyText(JSON.stringify(selectedEntity, null, 2))) {
            toast.success(`Copied ${selectedEntity.name} as JSON`);
        } else {
            toast.error(`Could not copy ${selectedEntity.name}: the browser did not allow it`);
        }
    };

    // Not connected - show empty state
    if (!isConnected) {
        return (
            <main className="flex-1 flex flex-col bg-background">
                <SidebarLine />
                <div className="flex flex-1 items-center justify-center">
                    <EmptyState type="no-connection" onAction={onConnectClick} />
                </div>
            </main>
        );
    }

    // Faults Dashboard view
    if (viewMode === 'faults-dashboard' && !selectedPath) {
        // The dashboard draws its own toolbar line and page width
        return (
            <main className="flex-1 overflow-y-auto bg-background">
                <FaultsDashboard />
            </main>
        );
    }

    // Updates Dashboard view
    if (viewMode === 'updates-dashboard' && !selectedPath) {
        return (
            <PlainView>
                <UpdatesDashboard />
            </PlainView>
        );
    }

    // No selection - show server info
    if (!selectedPath) {
        return (
            <PlainView>
                <ServerInfoPanel />
            </PlainView>
        );
    }

    // Loading
    if (isLoadingDetails) {
        return (
            <PlainView>
                <EntityDetailSkeleton />
            </PlainView>
        );
    }

    // Entity detail view
    if (selectedEntity) {
        const isTopic = selectedEntity.type === 'topic';
        const isComponent = selectedEntity.type === 'component' || selectedEntity.type === 'subcomponent';
        const isArea = selectedEntity.type === 'area' || selectedEntity.type === 'subarea';
        const isApp = selectedEntity.type === 'app';
        const isFunction = selectedEntity.type === 'function';
        const isServer = selectedEntity.type === 'server';
        const hasTopicData = isTopic && selectedEntity.topicData;
        // Prefer full topics array (with QoS, type info) over topicsInfo (names only)
        const hasTopicsArray = isComponent && selectedEntity.topics && selectedEntity.topics.length > 0;
        const hasTopicsInfo =
            isComponent &&
            !hasTopicsArray &&
            selectedEntity.topicsInfo &&
            ((selectedEntity.topicsInfo.publishes?.length ?? 0) > 0 ||
                (selectedEntity.topicsInfo.subscribes?.length ?? 0) > 0);
        const hasError = !!selectedEntity.error;

        // Extract component ID from path for component/topic/operation views
        const pathParts = selectedPath.split('/').filter(Boolean);
        // For topics, the path is like: /server/area/component/data/topicName
        // For operations, the path is like: /server/area/component/operations/opName
        // or /server/function_name/operations/opName
        const dataIndex = pathParts.indexOf('data');
        const opsIndex = pathParts.indexOf('operations');
        const configIndex = pathParts.indexOf('configurations');

        // Extract parent entity ID from path based on resource type
        let parentEntityId: string | null = null;
        if (dataIndex > 0) {
            parentEntityId = pathParts[dataIndex - 1] ?? null;
        } else if (opsIndex > 0) {
            parentEntityId = pathParts[opsIndex - 1] ?? null;
        } else if (configIndex > 0) {
            parentEntityId = pathParts[configIndex - 1] ?? null;
        }

        // Determine if this is an operation or parameter (resource-level entity)
        const isOperationOrParam =
            selectedEntity.type === 'service' ||
            selectedEntity.type === 'action' ||
            selectedEntity.type === 'parameter';

        // Get entityId: prefer from entity (set by API for operations), then from path, then entity's own ID
        const entityId =
            (selectedEntity.componentId as string | undefined) ??
            ((isTopic || isOperationOrParam) && parentEntityId ? parentEntityId : null) ??
            selectedEntity.id;

        // Get entityType: prefer from entity (set by API for operations), then infer from type/path
        let entityType: SovdResourceEntityType =
            (selectedEntity.entityType as SovdResourceEntityType | undefined) ??
            getEntityTypeForApi(selectedEntity.type);

        // Fallback inference for operations/parameters when entityType not in entity
        if (isOperationOrParam && !selectedEntity.entityType && parentEntityId) {
            // Check if parent is a function (path: /server/function_name/operations/...)
            // vs component/app/area based on path depth
            // Functions: pathParts = ['server', 'func_name', 'operations', 'op_name'] - opsIndex is 2
            const resourceIndex = Math.max(dataIndex, opsIndex, configIndex);
            if (resourceIndex === 2) {
                // Short path: /server/entity/resource/name - could be function or area
                // Check if the parent ID looks like a function (has underscore pattern) or area
                entityType = 'functions'; // Default to functions for short paths
            }
            // Otherwise keep default (components)
        }

        // The entities above this one, by the names the tree knows them by. A path
        // segment the tree has not loaded (a resource folder such as `data`) keeps its own.
        const crumbs = pathParts.slice(0, -1).map((part, index) => {
            const crumbPath = '/' + pathParts.slice(0, index + 1).join('/');
            return { label: findNode(rootEntities, crumbPath)?.name ?? decodeURIComponent(part), path: crumbPath };
        });

        // Refresh and Copy JSON belong to the views that have no panel of their own
        const isGenericView = !isServer && !isArea && !isApp && !isFunction;
        const description = typeof selectedEntity.description === 'string' ? selectedEntity.description : undefined;

        return (
            <main className="flex-1 overflow-y-auto bg-background">
                <EntityToolbar
                    crumbs={crumbs}
                    onNavigate={selectEntity}
                    title={selectedEntity.name}
                    kind={selectedEntity.type}
                    actions={
                        isGenericView ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={refreshSelectedEntity}
                                    disabled={isRefreshing}
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={handleCopyEntity}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy JSON
                                </Button>
                            </>
                        ) : undefined
                    }
                />
                <div className="@container max-w-6xl space-y-5 px-4 py-5 sm:px-6">
                    {/* Server Entity View */}
                    {isServer && !hasError && <ServerInfoPanel />}

                    {/* Area Entity View */}
                    {isArea && !hasError && (
                        <AreasPanel key={selectedEntity.id} areaId={selectedEntity.id} path={selectedPath} />
                    )}

                    {/* App Entity View */}
                    {isApp && !hasError && (
                        <AppsPanel
                            key={selectedEntity.id}
                            appId={selectedEntity.id}
                            fqn={selectedEntity.fqn as string | undefined}
                            nodeName={selectedEntity.node_name as string | undefined}
                            namespace={selectedEntity.namespace as string | undefined}
                            componentId={selectedEntity.component_id as string | undefined}
                            path={selectedPath}
                            onNavigate={selectEntity}
                        />
                    )}

                    {/* Function Entity View */}
                    {isFunction && !hasError && (
                        <FunctionsPanel
                            key={selectedEntity.id}
                            functionId={selectedEntity.id}
                            description={selectedEntity.description as string | undefined}
                            path={selectedPath}
                            onNavigate={selectEntity}
                        />
                    )}

                    {/* Component / generic: what it is, its lifecycle (gateway 0.6.0 lifecycle API) and its tabs */}
                    {isGenericView && (description || isComponent) && (
                        <div className="space-y-4">
                            {description && <p className="max-w-prose text-sm text-body">{description}</p>}
                            {isComponent && <EntityStatusControl entityType="components" entityId={entityId} />}
                            {isComponent && (
                                <ResourceTabBar
                                    tabs={componentTabs}
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                    counts={resourceCounts}
                                    alarmTab="faults"
                                />
                            )}
                        </div>
                    )}

                    {/* Content based on entity type and active tab */}
                    {hasError ? (
                        <div className="py-6 text-center">
                            <p className="font-medium text-destructive">Failed to load entity details</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                The server might be unreachable or the entity might not exist.
                            </p>
                        </div>
                    ) : hasTopicData ? (
                        // Single Data View - use DataPanel
                        (() => {
                            const topic = selectedEntity.topicData!;
                            return (
                                <DataPanel
                                    key={topic.timestamp}
                                    topic={topic}
                                    entityId={entityId}
                                    entityType={entityType}
                                />
                            );
                        })()
                    ) : isComponent ? (
                        // Component Dashboard with Tabs
                        <ComponentTabContent
                            activeTab={activeTab}
                            entityId={entityId}
                            selectedPath={selectedPath}
                            selectedEntity={selectedEntity}
                            hasTopicsInfo={hasTopicsInfo ?? false}
                            selectEntity={selectEntity}
                            entityType={entityType}
                            topicsData={topicsData}
                        />
                    ) : isArea || isApp || isFunction || isServer ? null : selectedEntity.type === 'action' ||
                      selectedEntity.type === 'service' ? ( // Already handled above with specialized panels
                        // Service/Action detail view
                        <OperationDetailCard entity={selectedEntity} entityId={entityId} entityType={entityType} />
                    ) : selectedEntity.type === 'parameter' ? (
                        // Parameter detail view
                        <ParameterDetailCard entity={selectedEntity} entityId={entityId} entityType={entityType} />
                    ) : (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No detailed information available for this entity.
                        </p>
                    )}
                </div>
            </main>
        );
    }

    // Fallback - show server info while loading
    return (
        <PlainView>
            <ServerInfoPanel />
        </PlainView>
    );
}
