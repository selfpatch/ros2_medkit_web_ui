import { useState, useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { Database, Loader2, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { RESOURCE_TABS, renderResourceTabContent, type ResourceTabId } from '@/components/ResourceTabs';
import type { SovdResourceEntityType } from '@/lib/types';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

interface EntityResourceTabsProps {
    entityId: string;
    entityType: SovdResourceEntityType;
    /** Tree path for navigation (e.g., /server/root for areas) */
    basePath?: string;
    onNavigate?: (path: string) => void;
}

/** Track which resources have been loaded */
interface LoadedResources {
    data: boolean;
    operations: boolean;
    configurations: boolean;
    faults: boolean;
    logs: boolean;
}

/**
 * Reusable component for displaying entity resources (data, operations, configurations, faults)
 * Works with areas, components, apps, and functions.
 *
 * Resources are lazy-loaded per tab to avoid unnecessary API calls.
 */
export function EntityResourceTabs({ entityId, entityType, basePath, onNavigate }: EntityResourceTabsProps) {
    const [activeTab, setActiveTab] = useState<ResourceTabId>('data');
    const [isLoading, setIsLoading] = useState(false);
    const [loadedTabs, setLoadedTabs] = useState<LoadedResources>({
        data: false,
        operations: false,
        configurations: false,
        faults: false,
        logs: false,
    });
    const loadedTabsRef = useRef(loadedTabs);
    loadedTabsRef.current = loadedTabs;
    const [data, setData] = useState<ComponentTopic[]>([]);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [faults, setFaults] = useState<Fault[]>([]);

    const {
        selectEntity,
        fetchEntityData,
        fetchEntityOperations,
        fetchConfigurations,
        listEntityFaults,
        storeConfigurations,
    } = useAppStore(
        useShallow((state) => ({
            selectEntity: state.selectEntity,
            fetchEntityData: state.fetchEntityData,
            fetchEntityOperations: state.fetchEntityOperations,
            fetchConfigurations: state.fetchConfigurations,
            listEntityFaults: state.listEntityFaults,
            storeConfigurations: state.configurations,
        }))
    );

    // Lazy load resources for the active tab
    const loadTabResources = useCallback(
        async (tab: ResourceTabId) => {
            if (loadedTabsRef.current[tab]) return;

            setIsLoading(true);
            try {
                switch (tab) {
                    case 'data': {
                        const dataRes = await fetchEntityData(entityType, entityId).catch(() => [] as ComponentTopic[]);
                        setData(dataRes);
                        break;
                    }
                    case 'operations': {
                        const opsRes = await fetchEntityOperations(entityType, entityId).catch(() => [] as Operation[]);
                        setOperations(opsRes);
                        break;
                    }
                    case 'configurations': {
                        await fetchConfigurations(entityId, entityType);
                        // Configurations are stored in the store's configurations map
                        break;
                    }
                    case 'faults': {
                        const faultsRes = await listEntityFaults(entityType, entityId).catch(() => ({
                            items: [] as Fault[],
                            count: 0,
                        }));
                        setFaults(faultsRes.items || []);
                        break;
                    }
                    case 'logs': {
                        // LogsPanel owns its own fetching; no parent-level count fetch.
                        break;
                    }
                }
                setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
            } catch (error) {
                console.error(`Failed to load ${tab} resources:`, error);
            } finally {
                setIsLoading(false);
            }
        },

        [fetchEntityData, fetchEntityOperations, fetchConfigurations, listEntityFaults, entityId, entityType]
    );

    // Reset tab state when the entity changes so stale data from the
    // previous entity does not leak into the new one.
    useEffect(() => {
        const reset: LoadedResources = {
            data: false,
            operations: false,
            configurations: false,
            faults: false,
            logs: false,
        };
        setActiveTab('data');
        setLoadedTabs(reset);
        // Synchronously update the ref so the load effect (which fires in
        // the same commit) sees the cleared flags instead of stale `true`
        // values from the previous entity.
        loadedTabsRef.current = reset;
        setData([]);
        setOperations([]);
        setFaults([]);
    }, [entityId, entityType]);

    // Load resources when tab changes
    useEffect(() => {
        loadTabResources(activeTab);
    }, [activeTab, loadTabResources]);

    const handleNavigate = (path: string) => {
        if (onNavigate) {
            onNavigate(path);
        } else {
            selectEntity(path);
        }
    };

    return (
        <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
                {RESOURCE_TABS.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    let count = 0;
                    if (tab.id === 'data') count = data.length;
                    if (tab.id === 'operations') count = operations.length;
                    if (tab.id === 'configurations') count = storeConfigurations.get(entityId)?.length || 0;
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

            {isLoading ? (
                <Card>
                    <CardContent className="py-8 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Data Tab */}
                    {activeTab === 'data' && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Database className="w-4 h-4 text-blue-500" />
                                    Data Items
                                </CardTitle>
                                <CardDescription>Aggregated data from child entities</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {data.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-4">
                                        <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No data items available.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {data.map((item, idx) => (
                                            <div
                                                key={`${item.topic}-${idx}`}
                                                className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/30 cursor-pointer"
                                                onClick={() => {
                                                    // Use basePath for tree navigation, fallback to API path format
                                                    const navPath = basePath
                                                        ? `${basePath}/data/${encodeURIComponent(item.topic)}`
                                                        : `/${entityType}/${entityId}/data/${encodeURIComponent(item.topic)}`;
                                                    handleNavigate(navPath);
                                                }}
                                            >
                                                <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
                                                <span className="font-mono text-xs truncate flex-1">{item.topic}</span>
                                                {item.type && (
                                                    <Badge variant="outline" className="text-xs shrink-0">
                                                        {item.type.split('/').pop()}
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Operations / Configurations / Faults / Logs delegated to shared helper */}
                    {activeTab !== 'data' && renderResourceTabContent(activeTab, entityId, entityType)}
                </>
            )}
        </div>
    );
}
