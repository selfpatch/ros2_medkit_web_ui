import { useState, useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/shallow';
import { Database, Loader2, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { badgeVariants } from '@/components/ui/badge';
import { DataValuePreview } from '@/components/DataValuePreview';
import { ResourceTabBar } from '@/components/ResourceTabBar';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
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
    scripts: boolean;
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
        scripts: false,
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

    // AbortController for in-flight fetches. Aborted (and replaced) whenever
    // the entity changes so stale responses never overwrite fresh ones.
    const abortRef = useRef<AbortController | null>(null);

    // Lazy load resources for the active tab
    const loadTabResources = useCallback(
        async (tab: ResourceTabId) => {
            if (loadedTabsRef.current[tab]) return;

            const signal = abortRef.current?.signal;
            setIsLoading(true);
            try {
                switch (tab) {
                    case 'data': {
                        const dataRes = await fetchEntityData(entityType, entityId, signal).catch(
                            () => [] as ComponentTopic[]
                        );
                        if (signal?.aborted) return;
                        setData(dataRes);
                        break;
                    }
                    case 'operations': {
                        const opsRes = await fetchEntityOperations(entityType, entityId, signal).catch(
                            () => [] as Operation[]
                        );
                        if (signal?.aborted) return;
                        setOperations(opsRes);
                        break;
                    }
                    case 'configurations': {
                        await fetchConfigurations(entityId, entityType, signal);
                        if (signal?.aborted) return;
                        // Configurations are stored in the store's configurations map
                        break;
                    }
                    case 'faults': {
                        const faultsRes = await listEntityFaults(entityType, entityId, signal).catch(() => ({
                            items: [] as Fault[],
                            count: 0,
                        }));
                        if (signal?.aborted) return;
                        setFaults(faultsRes.items || []);
                        break;
                    }
                    case 'logs': {
                        // LogsPanel owns its own fetching; no parent-level count fetch.
                        break;
                    }
                }
                if (signal?.aborted) return;
                setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
            } catch (error) {
                if (signal?.aborted) return;
                console.error(`Failed to load ${tab} resources:`, error);
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },

        [fetchEntityData, fetchEntityOperations, fetchConfigurations, listEntityFaults, entityId, entityType]
    );

    // Reset tab state when the entity changes so stale data from the
    // previous entity does not leak into the new one.
    useEffect(() => {
        // Abort any fetches still running for the previous entity. The
        // next load effect will spin up a fresh controller.
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        const reset: LoadedResources = {
            data: false,
            operations: false,
            configurations: false,
            faults: false,
            logs: false,
            scripts: false,
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

    // Abort in-flight fetches on unmount.
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

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
            <ResourceTabBar
                tabs={RESOURCE_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                counts={{
                    data: data.length,
                    operations: operations.length,
                    configurations: storeConfigurations.get(entityId)?.length || 0,
                    faults: faults.length,
                }}
                alarmTab="faults"
            />

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
                                    <Database className="w-4 h-4 text-faint" />
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
                                            <button
                                                type="button"
                                                key={`${item.topic}-${idx}`}
                                                className="flex w-full items-center gap-3 p-2.5 rounded-lg border text-left hover:bg-accent/30 cursor-pointer"
                                                onClick={() => {
                                                    // Use basePath for tree navigation, fallback to API path format
                                                    const navPath = basePath
                                                        ? `${basePath}/data/${encodeURIComponent(item.topic)}`
                                                        : `/${entityType}/${entityId}/data/${encodeURIComponent(item.topic)}`;
                                                    handleNavigate(navPath);
                                                }}
                                            >
                                                <MessageSquare className="w-4 h-4 text-faint shrink-0" aria-hidden />
                                                <span className="font-mono text-xs truncate flex-1">{item.topic}</span>
                                                <DataValuePreview topic={item} />
                                                {item.type && (
                                                    <span
                                                        className={cn(
                                                            badgeVariants({ variant: 'outline' }),
                                                            'text-xs shrink-0'
                                                        )}
                                                    >
                                                        {item.type.split('/').pop()}
                                                    </span>
                                                )}
                                            </button>
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
