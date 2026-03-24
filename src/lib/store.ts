import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import type {
    SovdEntity,
    SovdEntityDetails,
    EntityTreeNode,
    ComponentTopic,
    TopicNodeData,
    Parameter,
    Operation,
    Execution,
    CreateExecutionRequest,
    CreateExecutionResponse,
    Fault,
    App,
    VersionInfo,
    SovdFunction,
} from './types';
import { createMedkitClient, type MedkitClient } from '@selfpatch/ros2-medkit-client-ts';
import type { SovdResourceEntityType } from './types';
import {
    transformFaultsResponse,
    transformOperationsResponse,
    transformDataResponse,
    transformConfigurationsResponse,
    transformFault,
    unwrapItems,
} from './transforms';
import {
    getEntityDetail,
    getEntityConfigurations,
    getEntityOperations,
    getEntityData,
    getEntityDataItem,
    getEntityFaults,
    getEntityFaultDetail,
    getEntityExecution,
    postEntityExecution,
    deleteEntityExecution,
    deleteEntityFault,
    putEntityConfiguration,
    putEntityDataItem,
    deleteEntityConfiguration,
    deleteEntityConfigurations,
    getEntityBulkData,
} from './api-dispatch';

const STORAGE_KEY = 'ros2_medkit_web_ui_server_url';
const EXECUTION_POLL_INTERVAL_MS = 1000;
const EXECUTION_CLEANUP_AFTER_MS = 5 * 60 * 1000; // 5 minutes

export type TreeViewMode = 'logical' | 'functional';

/**
 * Extended Execution with metadata needed for polling
 */
export interface TrackedExecution extends Execution {
    /** Entity ID for API calls */
    entityId: string;
    /** Operation name for API calls */
    operationName: string;
    /** Entity type for API calls */
    entityType: SovdResourceEntityType;
    /** Timestamp when execution reached terminal state (for cleanup) */
    completedAt?: number;
}

export interface AppState {
    // Connection state
    serverUrl: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;
    client: MedkitClient | null;

    // Entity tree state
    treeViewMode: TreeViewMode;
    rootEntities: EntityTreeNode[];
    loadingPaths: string[];
    expandedPaths: string[];

    // Selection state
    selectedPath: string | null;
    selectedEntity: SovdEntityDetails | null;
    isLoadingDetails: boolean;
    isRefreshing: boolean;

    // Configurations state (ROS 2 Parameters)
    configurations: Map<string, Parameter[]>; // entityId -> parameters
    isLoadingConfigurations: boolean;

    // Operations state (ROS 2 Services & Actions)
    operations: Map<string, Operation[]>; // entityId -> operations
    isLoadingOperations: boolean;

    // Active executions (for monitoring async actions) - SOVD Execution Model
    activeExecutions: Map<string, TrackedExecution>; // executionId -> tracked execution with metadata
    autoRefreshExecutions: boolean; // flag for auto-refresh polling
    executionPollingIntervalId: ReturnType<typeof setInterval> | null; // polling interval ID

    // Faults state (diagnostic trouble codes)
    faults: Fault[];
    isLoadingFaults: boolean;
    faultStreamCleanup: (() => void) | null;

    // Actions
    connect: (url: string) => Promise<boolean>;
    disconnect: () => void;
    setTreeViewMode: (mode: TreeViewMode) => Promise<void>;
    loadRootEntities: () => Promise<void>;
    loadChildren: (path: string) => Promise<void>;
    toggleExpanded: (path: string) => void;
    selectEntity: (path: string) => Promise<void>;
    refreshSelectedEntity: () => Promise<void>;
    clearSelection: () => void;

    // Configurations actions
    fetchConfigurations: (entityId: string, entityType?: SovdResourceEntityType) => Promise<void>;
    setParameter: (
        entityId: string,
        paramName: string,
        value: unknown,
        entityType?: SovdResourceEntityType
    ) => Promise<boolean>;
    resetParameter: (entityId: string, paramName: string, entityType?: SovdResourceEntityType) => Promise<boolean>;
    resetAllConfigurations: (
        entityId: string,
        entityType?: SovdResourceEntityType
    ) => Promise<{ reset_count: number; failed_count: number }>;

    // Operations actions - updated for SOVD Execution model
    fetchOperations: (entityId: string, entityType?: SovdResourceEntityType) => Promise<void>;
    createExecution: (
        entityId: string,
        operationName: string,
        request: CreateExecutionRequest,
        entityType?: SovdResourceEntityType
    ) => Promise<CreateExecutionResponse | null>;
    refreshExecutionStatus: (
        entityId: string,
        operationName: string,
        executionId: string,
        entityType?: SovdResourceEntityType
    ) => Promise<void>;
    cancelExecution: (
        entityId: string,
        operationName: string,
        executionId: string,
        entityType?: SovdResourceEntityType
    ) => Promise<boolean>;
    setAutoRefreshExecutions: (enabled: boolean) => void;
    startExecutionPolling: () => void;
    stopExecutionPolling: () => void;

    // Faults actions
    fetchFaults: () => Promise<void>;
    clearFault: (entityType: SovdResourceEntityType, entityId: string, faultCode: string) => Promise<boolean>;
    subscribeFaultStream: () => void;
    unsubscribeFaultStream: () => void;

    // Component-facing actions (replace direct client usage in components)
    fetchEntityData: (entityType: SovdResourceEntityType, entityId: string) => Promise<ComponentTopic[]>;
    fetchEntityOperations: (entityType: SovdResourceEntityType, entityId: string) => Promise<Operation[]>;
    listEntityFaults: (
        entityType: SovdResourceEntityType,
        entityId: string
    ) => Promise<{ items: Fault[]; count: number }>;
    getFaultWithEnvironmentData: (
        entityType: SovdResourceEntityType,
        entityId: string,
        faultCode: string
    ) => Promise<unknown>;
    publishToEntityData: (
        entityType: SovdResourceEntityType,
        entityId: string,
        dataId: string,
        request: { value: unknown }
    ) => Promise<void>;
    getServerCapabilities: () => Promise<unknown>;
    getVersionInfoAction: () => Promise<VersionInfo | null>;
    downloadBulkData: (
        entityType: SovdResourceEntityType,
        entityId: string,
        category: string,
        fileId: string
    ) => Promise<{ blob: Blob; filename: string } | null>;
    getFunctionHosts: (functionId: string) => Promise<unknown[]>;
    prefetchResourceCounts: (
        entityType: SovdResourceEntityType,
        entityId: string
    ) => Promise<{ data: number; operations: number; configurations: number; faults: number }>;
}

/**
 * Convert SovdEntity to EntityTreeNode
 *
 * Structure - flat hierarchy with type tags:
 * - Area: subareas and components loaded as direct children on expand
 * - Subarea: same as Area
 * - Component: subcomponents and apps loaded as direct children on expand
 * - Subcomponent: same as Component
 * - App: leaf node (no children in tree)
 *
 * Resources (data, operations, configurations, faults) are shown in the detail panel,
 * not as tree nodes.
 */
function toTreeNode(entity: SovdEntity, parentPath: string = ''): EntityTreeNode {
    const path = parentPath ? `${parentPath}/${entity.id}` : `/${entity.id}`;
    const entityType = entity.type.toLowerCase();

    // Determine hasChildren based on explicit metadata or type heuristic
    // Note: hasChildren controls whether expand button is shown
    // children: undefined means "not loaded yet" (lazy loading on expand)
    let hasChildren: boolean;
    const entityAny = entity as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(entityAny, 'hasChildren') && typeof entityAny.hasChildren === 'boolean') {
        // Explicit hasChildren metadata from API - use as-is
        hasChildren = entityAny.hasChildren as boolean;
    } else if (Array.isArray(entityAny.children)) {
        // Children array provided - check if non-empty
        hasChildren = (entityAny.children as unknown[]).length > 0;
    } else {
        // No explicit metadata - use type-based heuristic:
        // Areas and components typically have children (components, apps, subareas)
        // Apps are leaf nodes - their resources shown in detail panel, not tree
        hasChildren = entityType !== 'app';
    }

    return {
        ...entity,
        path,
        children: undefined, // Children always loaded lazily on expand
        isLoading: false,
        isExpanded: false,
        hasChildren, // Controls whether expand button is shown
    };
}

/**
 * Recursively update a node in the tree
 */
function updateNodeInTree(
    nodes: EntityTreeNode[],
    targetPath: string,
    updater: (node: EntityTreeNode) => EntityTreeNode
): EntityTreeNode[] {
    return nodes.map((node) => {
        if (node.path === targetPath) {
            return updater(node);
        }
        if (node.children && targetPath.startsWith(node.path)) {
            return {
                ...node,
                children: updateNodeInTree(node.children, targetPath, updater),
            };
        }
        return node;
    });
}

/**
 * Find a node in the tree by path
 */
function findNode(nodes: EntityTreeNode[], path: string): EntityTreeNode | null {
    for (const node of nodes) {
        if (node.path === path) {
            return node;
        }
        if (node.children) {
            const found = findNode(node.children, path);
            if (found) return found;
        }
    }
    return null;
}

// =============================================================================
// Entity Selection Handlers
// =============================================================================

/** Result from an entity selection handler */
interface SelectionResult {
    selectedPath: string;
    selectedEntity: SovdEntityDetails;
    expandedPaths?: string[];
    rootEntities?: EntityTreeNode[];
    isLoadingDetails: boolean;
}

/** Context passed to entity selection handlers */
interface SelectionContext {
    node: EntityTreeNode;
    path: string;
    expandedPaths: string[];
    rootEntities: EntityTreeNode[];
}

/**
 * Handle topic node selection
 * Distinguished between TopicNodeData (partial) and ComponentTopic (full)
 */
async function handleTopicSelection(ctx: SelectionContext, client: MedkitClient): Promise<SelectionResult | null> {
    const { node, path, rootEntities } = ctx;
    if (node.type !== 'topic' || !node.data) return null;

    const data = node.data as TopicNodeData | ComponentTopic;
    const isTopicNodeData = 'isPublisher' in data && 'isSubscriber' in data && !('type' in data);

    if (isTopicNodeData) {
        // TopicNodeData - need to fetch full topic details from the parent entity
        const { isPublisher, isSubscriber } = data as TopicNodeData;
        const topicName = node.id;

        // Find parent entity by walking up the tree path
        const parentPath = path.split('/').slice(0, -1).join('/');
        const parentNode = findNode(rootEntities, parentPath);
        const parentType = parentNode?.type || 'component';
        const entityType = `${parentType}s` as SovdResourceEntityType;
        const entityId = parentNode?.id || '';

        // Fetch the specific data item for this topic
        const { data: topicDetail } = await getEntityDataItem(client, entityType, entityId, topicName);
        const topicData = topicDetail as unknown as ComponentTopic | null;

        if (topicData) {
            // Update tree with full data merged with direction info
            const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                ...n,
                data: { ...topicData, isPublisher, isSubscriber },
            }));

            return {
                selectedPath: path,
                selectedEntity: {
                    id: node.id,
                    name: node.name,
                    href: node.href,
                    topicData: { ...topicData, isPublisher, isSubscriber },
                    rosType: topicData.type,
                    type: 'topic',
                },
                rootEntities: updatedTree,
                isLoadingDetails: false,
            };
        }

        // Fallback if topic fetch fails
        return {
            selectedPath: path,
            selectedEntity: {
                id: node.id,
                name: node.name,
                type: 'topic',
                href: node.href,
                error: 'Failed to load topic details',
            },
            isLoadingDetails: false,
        };
    }

    // Full ComponentTopic data available
    const topicData = data as ComponentTopic;
    return {
        selectedPath: path,
        selectedEntity: {
            id: node.id,
            name: node.name,
            href: node.href,
            topicData,
            rosType: topicData.type,
            type: 'topic',
        },
        isLoadingDetails: false,
    };
}

/** Handle server node selection */
function handleServerSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path, expandedPaths } = ctx;
    if (node.type !== 'server') return null;

    const serverData = node.data as {
        versionInfo?: VersionInfo;
        serverVersion?: string;
        sovdVersion?: string;
        serverUrl?: string;
    };

    return {
        selectedPath: path,
        expandedPaths: expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path],
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: 'server',
            href: node.href,
            versionInfo: serverData?.versionInfo,
            serverVersion: serverData?.serverVersion,
            sovdVersion: serverData?.sovdVersion,
            serverUrl: serverData?.serverUrl,
        },
        isLoadingDetails: false,
    };
}

/** Handle component/subcomponent node selection */
function handleComponentSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path, expandedPaths } = ctx;
    if (node.type !== 'component' && node.type !== 'subcomponent') return null;

    return {
        selectedPath: path,
        expandedPaths: expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path],
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: node.type,
            href: node.href,
            topicsInfo: node.topicsInfo,
        },
        isLoadingDetails: false,
    };
}

/** Handle area/subarea node selection */
function handleAreaSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path, expandedPaths } = ctx;
    if (node.type !== 'area' && node.type !== 'subarea') return null;

    return {
        selectedPath: path,
        expandedPaths: expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path],
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: node.type,
            href: node.href,
        },
        isLoadingDetails: false,
    };
}

/** Handle function node selection */
function handleFunctionSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path, expandedPaths } = ctx;
    if (node.type !== 'function') return null;

    const functionData = node.data as SovdFunction | undefined;
    return {
        selectedPath: path,
        expandedPaths: expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path],
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: 'function',
            href: node.href,
            description: functionData?.description,
        },
        isLoadingDetails: false,
    };
}

/** Handle app node selection */
function handleAppSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path, expandedPaths } = ctx;
    if (node.type !== 'app') return null;

    const appData = node.data as App | undefined;
    return {
        selectedPath: path,
        expandedPaths: expandedPaths.includes(path) ? expandedPaths : [...expandedPaths, path],
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: 'app',
            href: node.href,
            fqn: appData?.fqn || node.name,
            node_name: appData?.node_name,
            namespace: appData?.namespace,
            component_id: appData?.component_id,
        },
        isLoadingDetails: false,
    };
}

/** Handle fault node selection */
function handleFaultSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path } = ctx;
    if (node.type !== 'fault' || !node.data) return null;

    const fault = node.data as Fault;
    const pathSegments = path.split('/').filter(Boolean);
    const entityId = pathSegments.length >= 2 ? pathSegments[pathSegments.length - 3] : '';

    return {
        selectedPath: path,
        selectedEntity: {
            id: node.id,
            name: fault.message,
            type: 'fault',
            href: node.href,
            data: fault,
            entityId,
        },
        isLoadingDetails: false,
    };
}

/** Handle parameter node selection */
function handleParameterSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path } = ctx;
    if (node.type !== 'parameter' || !node.data) return null;

    const pathSegments = path.split('/').filter(Boolean);
    const componentId = (pathSegments.length >= 2 ? pathSegments[1] : pathSegments[0]) ?? '';

    return {
        selectedPath: path,
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: 'parameter',
            href: node.href,
            data: node.data,
            componentId,
        },
        isLoadingDetails: false,
    };
}

/** Handle service/action node selection */
function handleOperationSelection(ctx: SelectionContext): SelectionResult | null {
    const { node, path } = ctx;
    if ((node.type !== 'service' && node.type !== 'action') || !node.data) return null;

    const pathSegments = path.split('/').filter(Boolean);
    const opsIndex = pathSegments.indexOf('operations');
    const componentId = opsIndex > 0 ? pathSegments[opsIndex - 1] : (pathSegments[0] ?? '');

    return {
        selectedPath: path,
        selectedEntity: {
            id: node.id,
            name: node.name,
            type: node.type,
            href: node.href,
            data: node.data,
            componentId,
        },
        isLoadingDetails: false,
    };
}

/**
 * Infer entity type from tree path depth.
 * Tree paths: /server/<areaId> (depth 1), /server/<areaId>/<componentId> (depth 2),
 * /server/<areaId>/<componentId>/<appId> (depth 3)
 */
function inferEntityTypeFromDepth(depth: number): SovdResourceEntityType {
    if (depth <= 1) return 'areas';
    if (depth === 2) return 'components';
    return 'apps';
}

/**
 * Parse a tree path to find the parent entity and any resource segment.
 * Tree paths: /server/<areaId>/<componentId>/<appId>/data/<topicName>
 * Returns: { entityType, entityId, resource?, resourceId? }
 */
function parseTreePath(path: string): {
    entityType: SovdResourceEntityType;
    entityId: string;
    resource?: 'data' | 'operations' | 'configurations' | 'faults';
    resourceId?: string;
} {
    const apiPath = path.replace(/^\/server/, '');
    const segments = apiPath.split('/').filter(Boolean);

    // Check for resource segments: .../data/<id>, .../operations/<id>, etc.
    const resourceTypes = ['data', 'operations', 'configurations', 'faults'] as const;
    for (const res of resourceTypes) {
        const resIndex = segments.indexOf(res);
        if (resIndex > 0) {
            // Entity is the segment before the resource
            const entityId = segments[resIndex - 1] || '';
            const entityType = inferEntityTypeFromDepth(resIndex);
            const resourceId = segments[resIndex + 1] ? decodeURIComponent(segments[resIndex + 1]!) : undefined;
            return { entityType, entityId, resource: res, resourceId };
        }
    }

    // No resource segment - it's an entity path
    const entityId = segments[segments.length - 1] || '';
    const entityType = inferEntityTypeFromDepth(segments.length);
    return { entityType, entityId };
}

/** Fallback: fetch entity details from API when not in tree */
async function fetchEntityFromApi(
    path: string,
    client: MedkitClient,
    set: (state: Partial<AppState>) => void
): Promise<void> {
    set({ selectedPath: path, isLoadingDetails: true, selectedEntity: null });

    try {
        const parsed = parseTreePath(path);

        if (parsed.resource === 'data' && parsed.resourceId) {
            // Topic detail: fetch specific data item and transform it
            const { data: rawItem } = await getEntityDataItem(client, parsed.entityType, parsed.entityId, parsed.resourceId);
            // Transform raw API response to ComponentTopic (same as list transform but for single item)
            const transformed = rawItem ? transformDataResponse({ items: [rawItem] }) : [];
            const topicData = transformed[0] || null;
            set({
                selectedEntity: {
                    id: parsed.resourceId,
                    name: topicData?.topic || parsed.resourceId,
                    href: path,
                    topicData: topicData || undefined,
                    rosType: topicData?.type,
                    type: 'topic',
                },
                isLoadingDetails: false,
            });
            return;
        }

        if (parsed.resource === 'operations' && parsed.resourceId) {
            // Operation detail
            set({
                selectedEntity: {
                    id: parsed.resourceId,
                    name: parsed.resourceId,
                    type: 'service',
                    href: path,
                    componentId: parsed.entityId,
                    entityType: parsed.entityType,
                },
                isLoadingDetails: false,
            });
            return;
        }

        // Entity detail
        const { data } = await getEntityDetail(client, parsed.entityType, parsed.entityId);
        const details = (data || {
            id: parsed.entityId,
            name: parsed.entityId,
            type: parsed.entityType.slice(0, -1),
            href: path,
        }) as SovdEntityDetails;
        set({ selectedEntity: details, isLoadingDetails: false });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[fetchEntityFromApi] Error:', message, { path });

        const parsed = parseTreePath(path);
        set({
            selectedEntity: {
                id: parsed.entityId,
                name: parsed.entityId,
                type: parsed.entityType.slice(0, -1),
                href: path,
                error: 'Failed to load details',
            },
            isLoadingDetails: false,
        });
    }
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Initial state
            serverUrl: null,
            isConnected: false,
            isConnecting: false,
            connectionError: null,
            client: null,

            treeViewMode: 'logical',
            rootEntities: [],
            loadingPaths: [],
            expandedPaths: [],

            // Selection state
            selectedPath: null,
            selectedEntity: null,
            isLoadingDetails: false,
            isRefreshing: false,

            // Configurations state
            configurations: new Map(),
            isLoadingConfigurations: false,

            // Operations state
            operations: new Map(),
            isLoadingOperations: false,

            // Active executions state - SOVD Execution model
            activeExecutions: new Map(),
            autoRefreshExecutions: true,
            executionPollingIntervalId: null,

            // Faults state
            faults: [],
            isLoadingFaults: false,
            faultStreamCleanup: null,

            // Connect to SOVD server
            connect: async (url: string) => {
                set({ isConnecting: true, connectionError: null });

                try {
                    const client = createMedkitClient({ baseUrl: url, fetch: fetch.bind(globalThis) });
                    const { error: healthError } = await client.GET('/health');

                    if (healthError) {
                        set({
                            isConnecting: false,
                            connectionError: 'Unable to connect to server. Check the URL and try again.',
                        });
                        return false;
                    }

                    set({
                        serverUrl: url,
                        isConnected: true,
                        isConnecting: false,
                        connectionError: null,
                        client,
                    });

                    // Load root entities after successful connection
                    await get().loadRootEntities();

                    // Subscribe to fault stream for real-time toast notifications
                    get().subscribeFaultStream();

                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Connection failed';
                    set({
                        isConnecting: false,
                        connectionError: message,
                    });
                    return false;
                }
            },

            // Disconnect from server
            disconnect: () => {
                // Stop execution polling
                get().stopExecutionPolling();

                // Unsubscribe from fault stream
                get().unsubscribeFaultStream();

                set({
                    serverUrl: null,
                    isConnected: false,
                    isConnecting: false,
                    connectionError: null,
                    client: null,
                    rootEntities: [],
                    loadingPaths: [],
                    expandedPaths: [],
                    selectedPath: null,
                    selectedEntity: null,
                    activeExecutions: new Map(),
                });
            },

            // Set tree view mode (logical vs functional) and reload entities
            setTreeViewMode: async (mode: TreeViewMode) => {
                set({ treeViewMode: mode, rootEntities: [], expandedPaths: [] });
                await get().loadRootEntities();
            },

            // Load root entities - creates a server node as root
            // In logical mode: Areas -> Components -> Apps
            // In functional mode: Functions -> Apps (hosts)
            loadRootEntities: async () => {
                const { client, serverUrl, treeViewMode } = get();
                if (!client) return;

                try {
                    // Fetch version info - critical for server identification and feature detection
                    const versionInfo = await client.GET('/version-info').then(({ data }) => data ?? null).catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        toast.warn(
                            `Failed to fetch server version info: ${message}. ` +
                                'Server will be shown with generic name and version info may be incomplete.'
                        );
                        return null as VersionInfo | null;
                    });

                    // Extract server info from version-info response (fallback to generic values if unavailable)
                    const sovdInfo = versionInfo?.items?.[0];
                    const serverName = sovdInfo?.vendor_info?.name || 'SOVD Server';
                    const serverVersion = sovdInfo?.vendor_info?.version || '';
                    const sovdVersion = sovdInfo?.version || '';

                    let children: EntityTreeNode[] = [];

                    if (treeViewMode === 'functional') {
                        // Functional view: Functions -> Apps (hosts)
                        const functionsRes = await client.GET('/functions').catch(() => null);
                        const functions = (functionsRes?.data ? unwrapItems<SovdFunction>(functionsRes.data) : []) as SovdFunction[];
                        children = functions.map((fn: SovdFunction) => {
                            // Validate function data quality
                            if (!fn.id || (typeof fn.id !== 'string' && typeof fn.id !== 'number')) {
                                console.warn('[Store] Malformed function data - missing or invalid id:', fn);
                            }
                            if (!fn.name && !fn.id) {
                                console.warn('[Store] Malformed function data - missing both name and id:', fn);
                            }

                            const fnName = typeof fn.name === 'string' ? fn.name : fn.id || 'Unknown';
                            const fnId = typeof fn.id === 'string' ? fn.id : String(fn.id);
                            return {
                                id: fnId,
                                name: fnName,
                                type: 'function',
                                href: fn.href || '',
                                path: `/server/${fnId}`,
                                children: undefined,
                                isLoading: false,
                                isExpanded: false,
                                // Functions always potentially have hosts - load on expand
                                hasChildren: true,
                                data: fn,
                            };
                        });
                    } else {
                        // Logical view: Areas -> Components -> Apps
                        const areasRes = await client.GET('/areas');
                        const rawAreas = areasRes.data ? unwrapItems<Record<string, unknown>>(areasRes.data) : [];
                        const entities = rawAreas.map((e) => ({ ...e, type: 'area' }) as unknown as SovdEntity);
                        children = entities.map((e: SovdEntity) => toTreeNode(e, '/server'));
                    }

                    // Create server root node
                    const serverNode: EntityTreeNode = {
                        id: 'server',
                        name: serverName,
                        type: 'server',
                        href: serverUrl || '',
                        path: '/server',
                        hasChildren: children.length > 0,
                        isLoading: false,
                        isExpanded: false,
                        children,
                        data: {
                            versionInfo,
                            serverVersion,
                            sovdVersion,
                            serverUrl,
                            treeViewMode,
                        },
                    };

                    set({ rootEntities: [serverNode], expandedPaths: ['/server'] });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to load entities: ${message}`);
                }
            },

            // Load children for a specific node
            loadChildren: async (path: string) => {
                const { client, loadingPaths, rootEntities, isLoadingDetails } = get();
                if (!client || loadingPaths.includes(path)) return;

                // If currently loading details, wait for it instead of making duplicate request
                if (isLoadingDetails) {
                    return;
                }

                // Check if we already have this data in the tree
                const node = findNode(rootEntities, path);

                // Regular node loading for entities (server, areas, subareas, components, subcomponents)
                // These load their direct children
                const nodeType = node?.type?.toLowerCase() || '';

                // Handle server node - children (areas) are already loaded in loadRootEntities
                if (nodeType === 'server') {
                    // Server children (areas) are pre-loaded, nothing to do
                    return;
                }

                // Check if this is a loadable entity type
                const isAreaOrSubarea = nodeType === 'area' || nodeType === 'subarea';
                const isComponentOrSubcomponent = nodeType === 'component' || nodeType === 'subcomponent';
                const isFunction = nodeType === 'function';

                if (node && (isAreaOrSubarea || isComponentOrSubcomponent || isFunction)) {
                    // Check if we already loaded children
                    if (node.children && node.children.length > 0) {
                        // Already loaded children, skip fetch
                        return;
                    }

                    set({ loadingPaths: [...loadingPaths, path] });

                    try {
                        let loadedEntities: EntityTreeNode[] = [];

                        if (isAreaOrSubarea) {
                            // Load components for this area
                            const componentsRes = await client.GET('/areas/{area_id}/components', { params: { path: { area_id: node.id } } });
                            const rawComponents = componentsRes.data ? unwrapItems<Record<string, unknown>>(componentsRes.data) : [];
                            const components = rawComponents.map((e) => ({ ...e, type: 'component' }) as unknown as SovdEntity);
                            loadedEntities = components.map((e: SovdEntity) => toTreeNode(e, path));
                        } else if (isComponentOrSubcomponent) {
                            // Load apps (hosts) for this component
                            const appsRes = await client.GET('/components/{component_id}/hosts', { params: { path: { component_id: node.id } } });
                            const rawApps = appsRes.data ? unwrapItems<Record<string, unknown>>(appsRes.data) : [];
                            const apps = rawApps.map((e) => ({ ...e, type: 'app' }) as unknown as SovdEntity);
                            loadedEntities = apps.map((app: SovdEntity) =>
                                toTreeNode({ ...app, type: 'app', hasChildren: false }, path)
                            );
                        } else if (isFunction) {
                            // Load hosts (apps) for this function
                            const hostsRes = await client.GET('/functions/{function_id}/hosts', { params: { path: { function_id: node.id } } }).catch(() => null);
                            const hosts = hostsRes?.data ? unwrapItems<Record<string, unknown>>(hostsRes.data) : [];

                            // Hosts response contains objects with {id, name, href}
                            loadedEntities = hosts.map((host: unknown) => {
                                const hostObj = host as { id?: string; name?: string; href?: string };
                                const hostId = hostObj.id || '';
                                const hostName = hostObj.name || hostObj.id || '';
                                return {
                                    id: hostId,
                                    name: hostName,
                                    type: 'app',
                                    href: hostObj.href || `${path}/${hostId}`,
                                    path: `${path}/${hostId}`,
                                    hasChildren: false,
                                    isLoading: false,
                                    isExpanded: false,
                                };
                            });
                        }

                        const updatedTree = updateNodeInTree(rootEntities, path, (n) => ({
                            ...n,
                            children: loadedEntities,
                            hasChildren: loadedEntities.length > 0,
                            isLoading: false,
                        }));

                        set({
                            rootEntities: updatedTree,
                            loadingPaths: get().loadingPaths.filter((p) => p !== path),
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        if (!message.includes('not found') && !message.includes('404')) {
                            console.error('[store]', error);
                            toast.error(`Failed to load children for ${path}: ${message}`);
                        }
                        set({ loadingPaths: get().loadingPaths.filter((p) => p !== path) });
                    }
                    return;
                }

                // For non-entity nodes, use regular loading
                if (node && Array.isArray(node.children) && node.children.length > 0) {
                    // Check if children have full data or just TopicNodeData
                    const firstChild = node.children[0];
                    const hasFullData =
                        firstChild?.data && typeof firstChild.data === 'object' && 'type' in firstChild.data;

                    if (hasFullData) {
                        // Already have full data, skip fetch
                        return;
                    }
                }

                // Mark as loading
                set({ loadingPaths: [...loadingPaths, path] });

                try {
                    // Convert tree path to API path (remove /server prefix)
                    // Parse entity type from path to dispatch to correct endpoint
                    const apiPath = path.replace(/^\/server/, '');
                    const segments = apiPath.split('/').filter(Boolean);

                    // Fallback: try to load children based on path depth
                    const depth = segments.length;
                    let entities: SovdEntity[] = [];
                    if (depth === 0) {
                        const res = await client.GET('/areas');
                        const raw = res.data ? unwrapItems<Record<string, unknown>>(res.data) : [];
                        entities = raw.map((e) => ({ ...e, type: 'area' }) as unknown as SovdEntity);
                    } else if (depth === 1) {
                        const areaId = segments[0]!;
                        const res = await client.GET('/areas/{area_id}/components', { params: { path: { area_id: areaId } } });
                        const raw = res.data ? unwrapItems<Record<string, unknown>>(res.data) : [];
                        entities = raw.map((e) => ({ ...e, type: 'component' }) as unknown as SovdEntity);
                    } else if (depth === 2) {
                        const componentId = segments[1]!;
                        const res = await client.GET('/components/{component_id}/hosts', { params: { path: { component_id: componentId } } });
                        const raw = res.data ? unwrapItems<Record<string, unknown>>(res.data) : [];
                        entities = raw.map((e) => ({ ...e, type: 'app' }) as unknown as SovdEntity);
                    }
                    const children = entities.map((e: SovdEntity) => toTreeNode(e, path));

                    // Update tree with children
                    const updatedTree = updateNodeInTree(rootEntities, path, (node) => ({
                        ...node,
                        children,
                        isLoading: false,
                    }));

                    // Remove from loading and update tree
                    set({
                        rootEntities: updatedTree,
                        loadingPaths: get().loadingPaths.filter((p) => p !== path),
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to load children for ${path}: ${message}`);
                    set({ loadingPaths: get().loadingPaths.filter((p) => p !== path) });
                }
            },

            // Toggle expanded state
            toggleExpanded: (path: string) => {
                const { expandedPaths } = get();

                if (expandedPaths.includes(path)) {
                    set({ expandedPaths: expandedPaths.filter((p) => p !== path) });
                } else {
                    set({ expandedPaths: [...expandedPaths, path] });
                }
            },

            // Select an entity and load its details
            selectEntity: async (path: string) => {
                const { client, selectedPath, rootEntities, expandedPaths, loadChildren } = get();
                if (!client || path === selectedPath) return;

                // Auto-expand parent paths and load children if needed
                const pathParts = path.split('/').filter(Boolean);
                const newExpandedPaths = [...expandedPaths];
                let currentPath = '';

                for (let i = 0; i < pathParts.length - 1; i++) {
                    currentPath += '/' + pathParts[i];
                    if (!newExpandedPaths.includes(currentPath)) {
                        newExpandedPaths.push(currentPath);
                    }
                    const parentNode = findNode(rootEntities, currentPath);
                    if (parentNode && parentNode.hasChildren !== false && !parentNode.children) {
                        loadChildren(currentPath);
                    }
                }

                if (newExpandedPaths.length !== expandedPaths.length) {
                    set({ expandedPaths: newExpandedPaths });
                }

                const node = findNode(rootEntities, path);
                if (!node) {
                    // Node not in tree - fall back to API fetch
                    await fetchEntityFromApi(path, client, set);
                    return;
                }

                const ctx: SelectionContext = { node, path, expandedPaths, rootEntities };

                // Try each handler in order - first match wins
                // Topic requires special handling (async + possible error)
                if (node.type === 'topic' && node.data) {
                    set({ selectedPath: path, isLoadingDetails: true, selectedEntity: null });
                    try {
                        const result = await handleTopicSelection(ctx, client);
                        if (result) {
                            set({
                                selectedPath: result.selectedPath,
                                selectedEntity: result.selectedEntity,
                                isLoadingDetails: result.isLoadingDetails,
                                ...(result.rootEntities && { rootEntities: result.rootEntities }),
                            });
                            return;
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        console.error('[store]', error);
                        toast.error(`Failed to load topic details: ${message}`);
                        set({
                            selectedEntity: {
                                id: node.id,
                                name: node.name,
                                type: 'topic',
                                href: node.href,
                                error: 'Failed to load details',
                            },
                            isLoadingDetails: false,
                        });
                        return;
                    }
                }

                // Synchronous handlers
                const handlers = [
                    handleServerSelection,
                    handleComponentSelection,
                    handleAreaSelection,
                    handleFunctionSelection,
                    handleAppSelection,
                    handleFaultSelection,
                    handleParameterSelection,
                    handleOperationSelection,
                ];

                for (const handler of handlers) {
                    const result = handler(ctx);
                    if (result) {
                        set({
                            selectedPath: result.selectedPath,
                            selectedEntity: result.selectedEntity,
                            isLoadingDetails: result.isLoadingDetails,
                            ...(result.expandedPaths && { expandedPaths: result.expandedPaths }),
                        });
                        return;
                    }
                }

                // No handler matched - fall back to API fetch
                await fetchEntityFromApi(path, client, set);
            },

            // Refresh the currently selected entity (re-fetch from server)
            refreshSelectedEntity: async () => {
                const { selectedPath, selectedEntity, client } = get();
                if (!selectedPath || !client || !selectedEntity) {
                    return;
                }

                set({ isRefreshing: true });

                try {
                    const entityType = `${selectedEntity.type}s` as SovdResourceEntityType;
                    const entityId = selectedEntity.id;

                    // Only refresh actual entities (area, component, app, function)
                    const validTypes: SovdResourceEntityType[] = ['areas', 'components', 'apps', 'functions'];
                    if (!validTypes.includes(entityType)) {
                        // For non-entity nodes (topic, fault, parameter), just clear refreshing
                        set({ isRefreshing: false });
                        return;
                    }

                    const { data } = await getEntityDetail(client, entityType, entityId);
                    if (data) {
                        set({ selectedEntity: data as unknown as SovdEntityDetails, isRefreshing: false });
                    } else {
                        set({ isRefreshing: false });
                    }
                } catch (error) {
                    console.error('[store] refreshSelectedEntity', error);
                    toast.error('Failed to refresh data');
                    set({ isRefreshing: false });
                }
            },

            // Clear selection
            clearSelection: () => {
                set({
                    selectedPath: null,
                    selectedEntity: null,
                });
            },

            // ===========================================================================
            // CONFIGURATIONS ACTIONS (ROS 2 Parameters)
            // ===========================================================================

            fetchConfigurations: async (entityId: string, entityType: SovdResourceEntityType = 'components') => {
                const { client, configurations } = get();
                if (!client) return;

                set({ isLoadingConfigurations: true });

                try {
                    const { data, error: fetchError } = await getEntityConfigurations(client, entityType, entityId);
                    if (fetchError) throw new Error(fetchError.message || 'Failed to load configurations');
                    const result = transformConfigurationsResponse(data, entityId);
                    const newConfigs = new Map(configurations);
                    newConfigs.set(entityId, result.parameters);
                    set({ configurations: newConfigs, isLoadingConfigurations: false });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to load configurations: ${message}`);
                    set({ isLoadingConfigurations: false });
                }
            },

            setParameter: async (
                entityId: string,
                paramName: string,
                value: unknown,
                entityType: SovdResourceEntityType = 'components'
            ) => {
                const { client, configurations } = get();
                if (!client) return false;

                try {
                    const { data: result, error: setError } = await putEntityConfiguration(client, entityType, entityId, paramName, { value });
                    if (setError) throw new Error(setError.message || 'Failed to set parameter');

                    // API returns {data: ..., id: ..., x-medkit: {parameter: {...}}}
                    // Success is indicated by presence of x-medkit.parameter (no status field)
                    const xMedkit = (result as { 'x-medkit'?: { parameter?: { name: string; value: unknown } } })[
                        'x-medkit'
                    ];
                    const parameter = xMedkit?.parameter;

                    if (parameter) {
                        // Update local state with new value
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(entityId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: parameter.value } : p
                        );
                        newConfigs.set(entityId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else if ((result as { status?: string }).status === 'success') {
                        // Legacy format fallback
                        const legacyResult = result as { parameter: { value: unknown } };
                        const newConfigs = new Map(configurations);
                        const params = newConfigs.get(entityId) || [];
                        const updatedParams = params.map((p) =>
                            p.name === paramName ? { ...p, value: legacyResult.parameter.value } : p
                        );
                        newConfigs.set(entityId, updatedParams);
                        set({ configurations: newConfigs });
                        toast.success(`Parameter ${paramName} updated`);
                        return true;
                    } else {
                        console.error('[store] setParameter: unexpected response', result);
                        toast.error(
                            `Failed to set parameter: ${(result as { error?: string }).error || 'Unknown error'}`
                        );
                        return false;
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to set parameter: ${message}`);
                    return false;
                }
            },

            resetParameter: async (
                entityId: string,
                paramName: string,
                entityType: SovdResourceEntityType = 'components'
            ) => {
                const { client, fetchConfigurations } = get();
                if (!client) return false;

                try {
                    const { error: resetError } = await deleteEntityConfiguration(client, entityType, entityId, paramName);
                    if (resetError) throw new Error(resetError.message || 'Failed to reset parameter');

                    // Refetch configurations to get updated value after reset
                    await fetchConfigurations(entityId, entityType);
                    toast.success(`Parameter ${paramName} reset to default`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to reset parameter: ${message}`);
                    return false;
                }
            },

            resetAllConfigurations: async (entityId: string, entityType: SovdResourceEntityType = 'components') => {
                const { client, fetchConfigurations } = get();
                if (!client) return { reset_count: 0, failed_count: 0 };

                try {
                    const { data: result, error: resetError } = await deleteEntityConfigurations(client, entityType, entityId);
                    if (resetError) throw new Error(resetError.message || 'Failed to reset configurations');

                    const resetResult = result as unknown as { reset_count: number; failed_count: number } | undefined;
                    const resetCount = resetResult?.reset_count ?? 0;
                    const failedCount = resetResult?.failed_count ?? 0;

                    if (failedCount === 0) {
                        toast.success(`Reset ${resetCount} parameters to defaults`);
                    } else {
                        toast.warning(`Reset ${resetCount} parameters, ${failedCount} failed`);
                    }

                    // Refresh configurations to get updated values
                    await fetchConfigurations(entityId, entityType);

                    return { reset_count: resetCount, failed_count: failedCount };
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to reset configurations: ${message}`);
                    return { reset_count: 0, failed_count: 0 };
                }
            },

            // ===========================================================================
            // OPERATIONS ACTIONS (ROS 2 Services & Actions) - SOVD Execution Model
            // ===========================================================================

            fetchOperations: async (entityId: string, entityType: SovdResourceEntityType = 'components') => {
                const { client, operations } = get();
                if (!client) return;

                set({ isLoadingOperations: true });

                try {
                    const { data, error: fetchError } = await getEntityOperations(client, entityType, entityId);
                    if (fetchError) throw new Error(fetchError.message || 'Failed to load operations');
                    const result = transformOperationsResponse(data);
                    const newOps = new Map(operations);
                    newOps.set(entityId, result);
                    set({ operations: newOps, isLoadingOperations: false });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to load operations: ${message}`);
                    set({ isLoadingOperations: false });
                }
            },

            createExecution: async (
                entityId: string,
                operationName: string,
                request: CreateExecutionRequest,
                entityType: SovdResourceEntityType = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return null;

                try {
                    const { data, error: execError } = await postEntityExecution(client, entityType, entityId, operationName, { input: request.input });
                    if (execError) throw new Error(execError.message || 'Operation failed');
                    const result = (data || {}) as CreateExecutionResponse;

                    // Track all executions with an ID (both running and completed/failed)
                    // Actions always get an ID, services may or may not depending on backend
                    if (result.id && !result.error) {
                        // Track the new execution for actions with metadata for polling
                        const trackedExecution: TrackedExecution = {
                            id: result.id,
                            status: result.status,
                            created_at: new Date().toISOString(),
                            result: result.result,
                            // Metadata for polling
                            entityId,
                            operationName,
                            entityType,
                        };
                        const newExecutions = new Map(activeExecutions);
                        newExecutions.set(result.id, trackedExecution);
                        // Enable auto-refresh and start polling when new execution is created
                        set({ activeExecutions: newExecutions, autoRefreshExecutions: true });
                        // Call directly from get() to ensure fresh state
                        get().startExecutionPolling();

                        // Show appropriate toast based on status
                        const isRunning = result.status === 'pending' || result.status === 'running';
                        if (isRunning) {
                            toast.success(`Action execution ${result.id.slice(0, 8)}... started`);
                        } else if (result.status === 'failed') {
                            console.error('[store] createExecution: failed', result);
                            toast.error(`Action execution ${result.id.slice(0, 8)}... failed`);
                        } else if (result.status === 'completed' || result.status === 'succeeded') {
                            toast.success(`Action execution ${result.id.slice(0, 8)}... completed`);
                        }
                    } else if (result.error) {
                        console.error('[store] createExecution: error in result', result);
                        toast.error(`Operation failed: ${result.error}`);
                    }

                    return result;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Operation failed: ${message}`);
                    return null;
                }
            },

            refreshExecutionStatus: async (
                entityId: string,
                operationName: string,
                executionId: string,
                entityType: SovdResourceEntityType = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return;

                try {
                    const { data, error: fetchError } = await getEntityExecution(client, entityType, entityId, operationName, executionId);
                    if (fetchError) throw new Error(fetchError.message || 'Failed to get execution');
                    const execution = data as unknown as Execution;
                    // Preserve metadata when updating execution
                    const trackedExecution: TrackedExecution = {
                        ...execution,
                        entityId,
                        operationName,
                        entityType,
                    };
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, trackedExecution);
                    set({ activeExecutions: newExecutions });
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[refreshExecutionStatus] Error:', message, {
                        entityId,
                        operationName,
                        executionId,
                        entityType,
                    });
                    console.error('[store]', error);
                    toast.error(`Failed to refresh execution status: ${message}`);
                }
            },

            cancelExecution: async (
                entityId: string,
                operationName: string,
                executionId: string,
                entityType: SovdResourceEntityType = 'components'
            ) => {
                const { client, activeExecutions } = get();
                if (!client) return false;

                try {
                    const { data, error: cancelError } = await deleteEntityExecution(client, entityType, entityId, operationName, executionId);
                    if (cancelError) throw new Error(cancelError.message || 'Failed to cancel execution');
                    const execution = data as unknown as Execution;
                    // Preserve metadata when updating execution
                    const trackedExecution: TrackedExecution = {
                        ...execution,
                        entityId,
                        operationName,
                        entityType,
                    };
                    const newExecutions = new Map(activeExecutions);
                    newExecutions.set(executionId, trackedExecution);
                    set({ activeExecutions: newExecutions });
                    toast.success(`Cancel request sent for execution ${executionId.slice(0, 8)}...`);
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to cancel execution: ${message}`);
                    return false;
                }
            },

            setAutoRefreshExecutions: (enabled: boolean) => {
                set({ autoRefreshExecutions: enabled });
                if (enabled) {
                    get().startExecutionPolling();
                } else {
                    get().stopExecutionPolling();
                }
            },

            startExecutionPolling: () => {
                // Atomic check: get current state and immediately set to prevent race
                const state = get();

                // Don't start if already running, disabled, or no client
                if (state.executionPollingIntervalId || !state.autoRefreshExecutions || !state.client) {
                    return;
                }

                // Create interval immediately and set it atomically
                const intervalId = setInterval(async () => {
                    const { activeExecutions, autoRefreshExecutions: stillEnabled, client: currentClient } = get();

                    // Stop polling if disabled or no client
                    if (!stillEnabled || !currentClient) {
                        get().stopExecutionPolling();
                        return;
                    }

                    // Cleanup old completed executions (older than EXECUTION_CLEANUP_AFTER_MS)
                    const now = Date.now();
                    const executionsToCleanup = Array.from(activeExecutions.entries()).filter(
                        ([, exec]) => exec.completedAt && now - exec.completedAt > EXECUTION_CLEANUP_AFTER_MS
                    );

                    if (executionsToCleanup.length > 0) {
                        const cleanedExecutions = new Map(activeExecutions);
                        for (const [id] of executionsToCleanup) {
                            cleanedExecutions.delete(id);
                        }
                        set({ activeExecutions: cleanedExecutions });
                    }

                    // Find all running executions
                    const runningExecutions = Array.from(activeExecutions.values()).filter(
                        (exec) => exec.status === 'pending' || exec.status === 'running'
                    );

                    // If no running executions, stop polling
                    if (runningExecutions.length === 0) {
                        get().stopExecutionPolling();
                        return;
                    }

                    // Refresh all running executions in parallel, then batch update
                    const results = await Promise.all(
                        runningExecutions.map(async (exec) => {
                            try {
                                const { data: execData } = await getEntityExecution(currentClient, exec.entityType, exec.entityId, exec.operationName, exec.id);
                                if (!execData) throw new Error('No data');
                                const updated = execData as unknown as Execution;
                                const isTerminal = ['succeeded', 'failed', 'canceled', 'completed'].includes(
                                    updated.status
                                );
                                const trackedExec: TrackedExecution = {
                                    ...updated,
                                    entityId: exec.entityId,
                                    operationName: exec.operationName,
                                    entityType: exec.entityType,
                                    completedAt: isTerminal ? Date.now() : undefined,
                                };
                                return { id: exec.id, execution: trackedExec };
                            } catch (error) {
                                console.error('[pollExecution] Error:', error, { executionId: exec.id });
                                return null;
                            }
                        })
                    );

                    // Batch update all successful results in a single set() call
                    const validResults = results.filter(
                        (r): r is { id: string; execution: TrackedExecution } => r !== null
                    );
                    if (validResults.length > 0) {
                        const { activeExecutions: currentExecutions } = get();
                        const newExecutions = new Map(currentExecutions);
                        for (const { id, execution } of validResults) {
                            newExecutions.set(id, execution);
                        }
                        set({ activeExecutions: newExecutions });
                    }
                }, EXECUTION_POLL_INTERVAL_MS);

                // Set interval ID immediately to prevent race condition
                set({ executionPollingIntervalId: intervalId });
            },

            stopExecutionPolling: () => {
                const { executionPollingIntervalId } = get();
                if (executionPollingIntervalId) {
                    clearInterval(executionPollingIntervalId);
                    set({ executionPollingIntervalId: null });
                }
            },

            // ===========================================================================
            // FAULTS ACTIONS (Diagnostic Trouble Codes)
            // ===========================================================================

            fetchFaults: async () => {
                const { client, faults: currentFaults } = get();
                if (!client) return;

                // Only show loading spinner on initial load, not background polls
                const isInitialLoad = currentFaults.length === 0;
                if (isInitialLoad) {
                    set({ isLoadingFaults: true });
                }

                try {
                    const { data: faultsData, error: faultsError } = await client.GET('/faults', { params: { query: { status: 'all' } } });
                    if (faultsError) throw new Error(faultsError.message || 'Failed to load faults');
                    const result = transformFaultsResponse(faultsData);
                    // Skip state update if faults haven't changed to avoid unnecessary re-renders.
                    // Compare by serializing fault codes + statuses (cheap and covers all meaningful changes).
                    const newKey = result.items.map((f: Fault) => `${f.code}:${f.status}:${f.severity}`).join('|');
                    const oldKey = currentFaults.map((f) => `${f.code}:${f.status}:${f.severity}`).join('|');
                    if (newKey !== oldKey) {
                        set({ faults: result.items, isLoadingFaults: false });
                    } else if (isInitialLoad) {
                        set({ isLoadingFaults: false });
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to load faults: ${message}`);
                    set({ isLoadingFaults: false });
                }
            },

            clearFault: async (entityType: SovdResourceEntityType, entityId: string, faultCode: string) => {
                const { client, fetchFaults } = get();
                if (!client) return false;

                try {
                    const { error: clearError } = await deleteEntityFault(client, entityType, entityId, faultCode);
                    if (clearError) throw new Error(clearError.message || 'Failed to clear fault');
                    toast.success(`Fault ${faultCode} cleared`);
                    // Refresh faults list
                    await fetchFaults();
                    return true;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.error('[store]', error);
                    toast.error(`Failed to clear fault: ${message}`);
                    return false;
                }
            },

            subscribeFaultStream: () => {
                const { client, faultStreamCleanup } = get();
                if (!client) return;

                // Clean up existing subscription
                if (faultStreamCleanup) {
                    faultStreamCleanup();
                }

                const stream = client.streams.faults();
                let running = true;

                const consume = async () => {
                    try {
                        for await (const event of stream) {
                            if (!running) break;

                            const rawData = event.data as Record<string, unknown>;
                            const faultData = (rawData.fault || rawData) as Parameters<typeof transformFault>[0];

                            if (!('fault_code' in faultData)) continue;
                            const fault = transformFault(faultData);

                            if (event.event === 'fault_cleared') {
                                // onFaultCleared - no toast, clearFault() already shows one for UI-triggered clears
                                const { faults } = get();
                                const newFaults = faults.filter(
                                    (f) => !(f.code === fault.code && f.entity_id === fault.entity_id)
                                );
                                if (newFaults.length !== faults.length) {
                                    set({ faults: newFaults });
                                }
                            } else {
                                // fault_confirmed or default message
                                const { faults } = get();
                                const existingIndex = faults.findIndex(
                                    (f) => f.code === fault.code && f.entity_id === fault.entity_id
                                );
                                if (existingIndex >= 0) {
                                    const existing = faults[existingIndex]!;
                                    if (
                                        existing.status === fault.status &&
                                        existing.severity === fault.severity &&
                                        existing.message === fault.message &&
                                        existing.timestamp === fault.timestamp
                                    ) {
                                        continue;
                                    }
                                    const newFaults = [...faults];
                                    newFaults[existingIndex] = fault;
                                    set({ faults: newFaults });
                                } else {
                                    set({ faults: [...faults, fault] });
                                }
                                toast.warning(`Fault: ${fault.message}`, { autoClose: 5000 });
                            }
                        }
                    } catch (error) {
                        console.error('[store] subscribeFaultStream: error in consume loop', error);
                        if (running) {
                            const message = error instanceof Error ? error.message : 'Fault stream error';
                            toast.error(`Fault stream error: ${message}`);
                        }
                    }
                };

                consume();

                const cleanup = () => {
                    running = false;
                    stream.close();
                };

                set({ faultStreamCleanup: cleanup });
            },

            // =================================================================
            // COMPONENT-FACING ACTIONS (replace direct client usage)
            // =================================================================

            fetchEntityData: async (entityType: SovdResourceEntityType, entityId: string) => {
                const { client } = get();
                if (!client) return [];
                const { data, error: fetchError } = await getEntityData(client, entityType, entityId);
                if (fetchError) return [];
                console.warn('[fetchEntityData] raw items:', (data as Record<string, unknown>)?.items ? 'present' : 'MISSING', 'x-medkit in first:', JSON.stringify(((data as Record<string, unknown>)?.items as Array<Record<string, unknown>>)?.[0]?.['x-medkit']).slice(0, 200));
                const result = transformDataResponse(data);
                console.warn('[fetchEntityData] transformed:', result.length, 'items, first type_info:', !!result[0]?.type_info, 'first type:', result[0]?.type);
                return result;
            },

            fetchEntityOperations: async (entityType: SovdResourceEntityType, entityId: string) => {
                const { client } = get();
                if (!client) return [];
                const { data, error: fetchError } = await getEntityOperations(client, entityType, entityId);
                if (fetchError) return [];
                return transformOperationsResponse(data);
            },

            listEntityFaults: async (entityType: SovdResourceEntityType, entityId: string) => {
                const { client } = get();
                if (!client) return { items: [], count: 0 };
                const { data, error: fetchError } = await getEntityFaults(client, entityType, entityId);
                if (fetchError) return { items: [], count: 0 };
                return transformFaultsResponse(data);
            },

            getFaultWithEnvironmentData: async (
                entityType: SovdResourceEntityType,
                entityId: string,
                faultCode: string
            ) => {
                const { client } = get();
                if (!client) return null;
                // Try entity-scoped fault detail - if 404, fault may not be scoped to this entity
                const { data, error: fetchError } = await getEntityFaultDetail(client, entityType, entityId, faultCode);
                if (!fetchError) return data;
                // Fault not found on this entity - this is expected for faults reported by
                // a different entity than the one shown in the UI (e.g., anomaly_detector reports
                // about imu_sim). Log at debug level, not error.
                console.debug('[store] getFaultWithEnvironmentData: not found on entity, skipping detail', { entityType, entityId, faultCode });
                return null;
            },

            publishToEntityData: async (
                entityType: SovdResourceEntityType,
                entityId: string,
                dataId: string,
                request: { value: unknown }
            ) => {
                const { client } = get();
                if (!client) return;
                await putEntityDataItem(client, entityType, entityId, dataId, request);
            },

            getServerCapabilities: async () => {
                const { client } = get();
                if (!client) return null;
                const { data } = await client.GET('/');
                return data ?? null;
            },

            getVersionInfoAction: async () => {
                const { client } = get();
                if (!client) return null;
                const { data } = await client.GET('/version-info');
                return (data as VersionInfo) ?? null;
            },

            downloadBulkData: async (
                entityType: SovdResourceEntityType,
                entityId: string,
                category: string,
                fileId: string
            ) => {
                const { client, serverUrl } = get();
                if (!client || !serverUrl) return null;

                // Fetch file list to get filename
                const { data } = await getEntityBulkData(client, entityType, entityId, category);
                if (!data) return null;
                const items = (data as unknown as { items?: Array<{ id: string; name?: string }> })?.items || [];
                const fileDesc = items.find((item) => item.id === fileId);
                const filename = fileDesc?.name || fileId;

                // Download binary via fetch (openapi-fetch doesn't support blob responses)
                const baseUrl = serverUrl.replace(/\/+$/, '');
                const downloadUrl = `${baseUrl}/${entityType}/${encodeURIComponent(entityId)}/bulk-data/${encodeURIComponent(category)}/${encodeURIComponent(fileId)}`;
                const response = await fetch(downloadUrl);
                if (!response.ok) return null;
                const blob = await response.blob();
                return { blob, filename };
            },

            getFunctionHosts: async (functionId: string) => {
                const { client } = get();
                if (!client) return [];
                const { data } = await client.GET('/functions/{function_id}/hosts', {
                    params: { path: { function_id: functionId } },
                });
                return data ? unwrapItems<unknown>(data) : [];
            },

            prefetchResourceCounts: async (entityType: SovdResourceEntityType, entityId: string) => {
                const { client } = get();
                if (!client) return { data: 0, operations: 0, configurations: 0, faults: 0 };

                const [dataRes, opsRes, configRes, faultsRes] = await Promise.all([
                    getEntityData(client, entityType, entityId).catch(() => ({ data: undefined, error: undefined })),
                    getEntityOperations(client, entityType, entityId).catch(() => ({ data: undefined, error: undefined })),
                    getEntityConfigurations(client, entityType, entityId).catch(() => ({
                        data: undefined,
                        error: undefined,
                    })),
                    getEntityFaults(client, entityType, entityId).catch(() => ({ data: undefined, error: undefined })),
                ]);

                return {
                    data: dataRes.data ? unwrapItems(dataRes.data).length : 0,
                    operations: opsRes.data ? unwrapItems(opsRes.data).length : 0,
                    configurations: configRes.data
                        ? transformConfigurationsResponse(configRes.data, entityId).parameters.length
                        : 0,
                    faults: faultsRes.data ? transformFaultsResponse(faultsRes.data).items.length : 0,
                };
            },

            unsubscribeFaultStream: () => {
                const { faultStreamCleanup } = get();
                if (faultStreamCleanup) {
                    faultStreamCleanup();
                    set({ faultStreamCleanup: null });
                }
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state: AppState) => ({
                serverUrl: state.serverUrl,
                treeViewMode: state.treeViewMode,
            }),
        }
    )
);
