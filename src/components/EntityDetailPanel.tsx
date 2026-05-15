import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    Copy,
    Radio,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    Database,
    Settings,
    RefreshCw,
    Box,
    Layers,
    Cpu,
    GitBranch,
    Home,
    Server,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { EntityDetailSkeleton } from '@/components/EntityDetailSkeleton';
import { DataPanel } from '@/components/DataPanel';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import { OperationsPanel } from '@/components/OperationsPanel';
import { RESOURCE_TABS, renderResourceTabContent, type ResourceTabId } from '@/components/ResourceTabs';
import { AreasPanel } from '@/components/AreasPanel';
import { AppsPanel } from '@/components/AppsPanel';
import { FunctionsPanel } from '@/components/FunctionsPanel';
import { ServerInfoPanel } from '@/components/ServerInfoPanel';
import { FaultsDashboard } from '@/components/FaultsDashboard';
import { UpdatesDashboard } from '@/components/UpdatesDashboard';
import { useAppStore, type AppState } from '@/lib/store';
import type { ComponentTopic, Parameter, SovdResourceEntityType } from '@/lib/types';

type ComponentTab = ResourceTabId;

interface TabConfig {
    id: ComponentTab;
    label: string;
    icon: typeof Database;
    description?: string;
}

const COMPONENT_TABS: TabConfig[] = RESOURCE_TABS;

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
            return 'areas';
        default:
            return 'components'; // default fallback
    }
}

/**
 * Get icon for entity type to display in breadcrumbs
 */
function getBreadcrumbIcon(type: string) {
    switch (type) {
        case 'server':
            return <Server className="w-3 h-3" />;
        case 'area':
            return <Layers className="w-3 h-3" />;
        case 'component':
            return <Box className="w-3 h-3" />;
        case 'app':
            return <Cpu className="w-3 h-3" />;
        case 'function':
            return <GitBranch className="w-3 h-3" />;
        default:
            return null;
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

function DataTabContent({
    selectedPath,
    selectedEntity,
    hasTopicsInfo,
    selectEntity,
    topicsData,
}: DataTabContentProps) {
    if (topicsData === null) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Data</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-14 rounded-lg border bg-muted/30 animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // topicsData is loaded at this point. Prefer it over the entity-level fallback
    // so we never surface stale `selectedEntity.topics` when the fresh fetch is empty.
    const topics = topicsData.length > 0 ? topicsData : (selectedEntity.topics as ComponentTopic[] | undefined) || [];
    const hasTopics = topics.length > 0;

    if (hasTopics) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-base">Data</CardTitle>
                        <span className="text-xs text-muted-foreground">({topics.length} items)</span>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 max-h-[500px] overflow-y-auto pr-1">
                        {topics.map((topic) => {
                            const cleanName = topic.topic.startsWith('/') ? topic.topic.slice(1) : topic.topic;
                            const encodedName = encodeURIComponent(cleanName);
                            const topicPath = `${selectedPath}/data/${encodedName}`;

                            return (
                                <div
                                    key={topic.uniqueKey || topic.topic}
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer group transition-colors"
                                    onClick={() => selectEntity(topicPath)}
                                >
                                    <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate text-sm">{topic.topic}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {topic.type || 'Unknown Type'}
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (hasTopicsInfo) {
        const topicsInfo = selectedEntity.topicsInfo as NonNullable<typeof selectedEntity.topicsInfo>;
        return (
            <div className="space-y-4">
                {/* Publishes Section */}
                {topicsInfo.publishes.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <ArrowUp className="w-4 h-4 text-green-500" />
                                <CardTitle className="text-base">Publishes</CardTitle>
                                <Badge variant="secondary">{topicsInfo.publishes.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                                {topicsInfo.publishes.map((topic: string) => {
                                    const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${selectedPath}/data/${encodedName}`;

                                    return (
                                        <div
                                            key={topic}
                                            className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                                            onClick={() => selectEntity(topicPath)}
                                        >
                                            <Radio className="w-3 h-3 text-green-500" />
                                            <span className="text-sm font-mono truncate flex-1">{topic}</span>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Subscribes Section */}
                {topicsInfo.subscribes.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <ArrowDown className="w-4 h-4 text-blue-500" />
                                <CardTitle className="text-base">Subscribes</CardTitle>
                                <Badge variant="secondary">{topicsInfo.subscribes.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                                {topicsInfo.subscribes.map((topic: string) => {
                                    const cleanName = topic.startsWith('/') ? topic.slice(1) : topic;
                                    const encodedName = encodeURIComponent(cleanName);
                                    const topicPath = `${selectedPath}/data/${encodedName}`;

                                    return (
                                        <div
                                            key={topic}
                                            className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                                            onClick={() => selectEntity(topicPath)}
                                        >
                                            <Radio className="w-3 h-3 text-blue-500" />
                                            <span className="text-sm font-mono truncate flex-1">{topic}</span>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-4">No data available for this component.</div>
            </CardContent>
        </Card>
    );
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
 * Parameter detail card
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
            <Card>
                <CardContent className="pt-6">
                    <p className="text-muted-foreground text-sm text-center">
                        Parameter data not available. Select from the Configurations tab.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                        <Settings className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">{entity.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                            <Badge variant="outline">{parameterData.type}</Badge>
                            {parameterData.read_only && <Badge variant="secondary">Read-only</Badge>}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ConfigurationPanel entityId={entityId} highlightParam={entity.name} entityType={entityType} />
            </CardContent>
        </Card>
    );
}

interface EntityDetailPanelProps {
    onConnectClick: () => void;
    viewMode?: 'entity' | 'faults-dashboard' | 'updates-dashboard';
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
    });
    // Store fetched topics data for the Data tab. `null` means "not yet loaded
    // for the current entity" so the Data tab can render a skeleton instead of
    // an empty-state flash while the fetch is in flight. `[]` means "loaded,
    // no items". `[...]` means "loaded with items".
    const [topicsData, setTopicsData] = useState<ComponentTopic[] | null>(null);

    const {
        selectedPath,
        selectedEntity,
        isLoadingDetails,
        isRefreshing,
        isConnected,
        selectEntity,
        refreshSelectedEntity,
        prefetchResourceCounts,
        fetchEntityData,
    } = useAppStore(
        useShallow((state: AppState) => ({
            selectedPath: state.selectedPath,
            selectedEntity: state.selectedEntity,
            isLoadingDetails: state.isLoadingDetails,
            isRefreshing: state.isRefreshing,
            isConnected: state.isConnected,
            selectEntity: state.selectEntity,
            refreshSelectedEntity: state.refreshSelectedEntity,
            prefetchResourceCounts: state.prefetchResourceCounts,
            fetchEntityData: state.fetchEntityData,
        }))
    );

    // Notify parent when entity is selected
    useEffect(() => {
        if (selectedPath && onEntitySelect) {
            onEntitySelect();
        }
    }, [selectedPath, onEntitySelect]);

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
            const isArea = selectedEntity.type === 'area';
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
                setResourceCounts({ ...counts, data: fetchedData.length, logs: 0 });
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
        if (selectedEntity) {
            await navigator.clipboard.writeText(JSON.stringify(selectedEntity, null, 2));
        }
    };

    // Not connected - show empty state
    if (!isConnected) {
        return (
            <main className="flex-1 flex items-center justify-center bg-background">
                <EmptyState type="no-connection" onAction={onConnectClick} />
            </main>
        );
    }

    // Faults Dashboard view
    if (viewMode === 'faults-dashboard' && !selectedPath) {
        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto">
                    <FaultsDashboard />
                </div>
            </main>
        );
    }

    // Updates Dashboard view
    if (viewMode === 'updates-dashboard' && !selectedPath) {
        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto">
                    <UpdatesDashboard />
                </div>
            </main>
        );
    }

    // No selection - show server info
    if (!selectedPath) {
        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto">
                    <ServerInfoPanel />
                </div>
            </main>
        );
    }

    // Loading
    if (isLoadingDetails) {
        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto">
                    <EntityDetailSkeleton />
                </div>
            </main>
        );
    }

    // Entity detail view
    if (selectedEntity) {
        const isTopic = selectedEntity.type === 'topic';
        const isComponent = selectedEntity.type === 'component' || selectedEntity.type === 'subcomponent';
        const isArea = selectedEntity.type === 'area';
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

        // Get icon for entity type
        const getEntityTypeIcon = () => {
            switch (selectedEntity.type) {
                case 'server':
                    return <Server className="w-6 h-6 text-primary" />;
                case 'area':
                    return <Layers className="w-6 h-6 text-cyan-500" />;
                case 'component':
                case 'subcomponent':
                    return <Box className="w-6 h-6 text-indigo-500" />;
                case 'app':
                    return <Cpu className="w-6 h-6 text-emerald-500" />;
                case 'function':
                    return <GitBranch className="w-6 h-6 text-violet-500" />;
                default:
                    return <Box className="w-6 h-6 text-primary" />;
            }
        };

        // Get background color for entity type
        const getEntityBgColor = () => {
            switch (selectedEntity.type) {
                case 'server':
                    return 'bg-primary/10';
                case 'area':
                    return 'bg-cyan-100 dark:bg-cyan-900';
                case 'component':
                case 'subcomponent':
                    return 'bg-indigo-100 dark:bg-indigo-900';
                case 'app':
                    return 'bg-emerald-100 dark:bg-emerald-900';
                case 'function':
                    return 'bg-violet-100 dark:bg-violet-900';
                default:
                    return 'bg-primary/10';
            }
        };

        // Build breadcrumb from path with type inference
        const breadcrumbs = pathParts.map((part, index) => {
            const breadcrumbPath = '/' + pathParts.slice(0, index + 1).join('/');
            // Decode URL-encoded parts for display
            const decodedPart = decodeURIComponent(part);
            // Infer type from path position: server -> area -> component -> app/folder
            let type: string;
            if (part === 'server') {
                type = 'server';
            } else if (index === 1) {
                type = 'area';
            } else if (index === 2) {
                type = 'component';
            } else if (['data', 'operations', 'configurations', 'faults', 'resources'].includes(part)) {
                type = 'folder';
            } else {
                type = 'app';
            }
            return {
                label: decodedPart,
                path: breadcrumbPath,
                type,
            };
        });

        return (
            <main className="flex-1 overflow-y-auto p-6 bg-background">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Breadcrumb Navigation */}
                    {breadcrumbs.length > 0 && (
                        <nav className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
                            <button
                                onClick={() => selectEntity('/server')}
                                className="flex items-center gap-1 hover:text-primary transition-colors whitespace-nowrap"
                            >
                                <Home className="w-4 h-4" />
                            </button>
                            {breadcrumbs.map((crumb, index) => (
                                <div key={crumb.path} className="flex items-center gap-1">
                                    <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                                    <button
                                        onClick={() => selectEntity(crumb.path)}
                                        className={`flex items-center gap-1 hover:text-primary transition-colors whitespace-nowrap ${
                                            index === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''
                                        }`}
                                    >
                                        {getBreadcrumbIcon(crumb.type)}
                                        {crumb.label}
                                    </button>
                                </div>
                            ))}
                        </nav>
                    )}

                    {/* Server Entity View */}
                    {isServer && !hasError && <ServerInfoPanel />}

                    {/* Area Entity View */}
                    {isArea && !hasError && (
                        <AreasPanel
                            key={selectedEntity.id}
                            areaId={selectedEntity.id}
                            areaName={selectedEntity.name}
                            path={selectedPath}
                        />
                    )}

                    {/* App Entity View */}
                    {isApp && !hasError && (
                        <AppsPanel
                            key={selectedEntity.id}
                            appId={selectedEntity.id}
                            appName={selectedEntity.name}
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
                            functionName={selectedEntity.name}
                            description={selectedEntity.description as string | undefined}
                            path={selectedPath}
                            onNavigate={selectEntity}
                        />
                    )}

                    {/* Component/Generic Header */}
                    {!isServer && !isArea && !isApp && !isFunction && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${getEntityBgColor()}`}>
                                            {getEntityTypeIcon()}
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl">{selectedEntity.name}</CardTitle>
                                            <CardDescription className="flex items-center gap-2">
                                                <Badge variant="outline">{selectedEntity.type}</Badge>
                                                <span className="text-muted-foreground">•</span>
                                                <span className="font-mono text-xs">{selectedPath}</span>
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={refreshSelectedEntity}
                                            disabled={isRefreshing}
                                        >
                                            <RefreshCw
                                                className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
                                            />
                                            Refresh
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleCopyEntity}>
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copy JSON
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>

                            {/* Tab Navigation for Components */}
                            {isComponent && (
                                <div className="px-6 pb-4">
                                    <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                        {COMPONENT_TABS.map((tab) => {
                                            const TabIcon = tab.icon;
                                            const isActive = activeTab === tab.id;
                                            const count = resourceCounts[tab.id];
                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveTab(tab.id)}
                                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
                                                            className={`ml-1 h-5 px-1.5 text-xs ${
                                                                tab.id === 'faults' && count > 0
                                                                    ? 'bg-red-500 text-white'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {count}
                                                        </Badge>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Content based on entity type and active tab */}
                    {hasError ? (
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                                    <p className="font-medium text-destructive">Failed to load entity details</p>
                                    <p className="text-sm mt-2">
                                        The server might be unreachable or the entity might not exist.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
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
                                    isRefreshing={isRefreshing}
                                    onRefresh={refreshSelectedEntity}
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
                        <Card>
                            <CardContent className="pt-6">
                                <div className="text-center text-muted-foreground">
                                    No detailed information available for this entity.
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        );
    }

    // Fallback - show server info while loading
    return (
        <main className="flex-1 overflow-y-auto p-6 bg-background">
            <div className="max-w-4xl mx-auto">
                <ServerInfoPanel />
            </div>
        </main>
    );
}
