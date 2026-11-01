import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Layers, Box, ChevronRight, MapPin, Database } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { ResourceTabBar } from '@/components/ResourceTabBar';
import { EntityResourceTabs } from '@/components/EntityResourceTabs';
import type { EntityTreeNode } from '@/lib/types';

type AreaTab = 'overview' | 'components' | 'resources';

interface TabConfig {
    id: AreaTab;
    label: string;
    icon: typeof Layers;
}

const AREA_TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'components', label: 'Components', icon: Box },
    { id: 'resources', label: 'Resources', icon: Database },
];

interface AreasPanelProps {
    areaId: string;
    path: string;
}

/**
 * Areas Panel - displays area entity details with related components
 *
 * Areas are namespace groupings in SOVD. They can have:
 * - Subareas (child areas)
 * - Related components (components in this area)
 *
 * Note: Areas don't have direct data/operations/configurations/faults.
 * Those resources belong to components and apps within the area.
 */
export function AreasPanel({ areaId, path }: AreasPanelProps) {
    const [activeTab, setActiveTab] = useState<AreaTab>('overview');

    const { rootEntities, selectEntity, expandedPaths, toggleExpanded } = useAppStore(
        useShallow((state) => ({
            rootEntities: state.rootEntities,
            selectEntity: state.selectEntity,
            expandedPaths: state.expandedPaths,
            toggleExpanded: state.toggleExpanded,
        }))
    );

    // Recursive function to find area node in tree (areas are children of server node)
    const findAreaNode = (
        nodes: EntityTreeNode[] | undefined,
        targetId: string,
        targetPath: string
    ): EntityTreeNode | undefined => {
        if (!nodes) return undefined;
        for (const node of nodes) {
            if (node.id === targetId || node.path === targetPath) {
                return node;
            }
            if (node.children && Array.isArray(node.children)) {
                const found = findAreaNode(node.children, targetId, targetPath);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    };

    // Find the area node in the tree (areas are now children of server node)
    const areaNode = findAreaNode(rootEntities, areaId, path);
    const components = areaNode?.children?.filter((c: EntityTreeNode) => c.type === 'component') || [];
    const subareas = areaNode?.children?.filter((c: EntityTreeNode) => c.type === 'subarea') || [];

    const handleComponentClick = (componentPath: string) => {
        selectEntity(componentPath);
        // Auto-expand the component
        if (!expandedPaths.includes(componentPath)) {
            toggleExpanded(componentPath);
        }
    };

    return (
        <div className="space-y-6">
            {/* Its name is the view's heading, in the toolbar */}
            <ResourceTabBar
                tabs={AREA_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                counts={{ components: components.length }}
            />

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="p-3 rounded-lg bg-muted/50">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="w-4 h-4" />
                                    <span>Namespace</span>
                                </div>
                                <p className="font-mono text-sm mt-1">/{areaId}</p>
                            </div>
                            <button
                                onClick={() => setActiveTab('components')}
                                className="p-3 rounded-lg bg-muted/50 hover:bg-accent/50 transition-colors text-left"
                            >
                                <Box className="w-4 h-4 text-indigo-500 mb-1" />
                                <div className="text-lg font-semibold">{components.length}</div>
                                <div className="text-xs text-muted-foreground">Components</div>
                            </button>
                            {subareas.length > 0 && (
                                <div className="p-3 rounded-lg bg-muted/50">
                                    <Layers className="w-4 h-4 text-cyan-400 mb-1" />
                                    <div className="text-lg font-semibold">{subareas.length}</div>
                                    <div className="text-xs text-muted-foreground">Subareas</div>
                                </div>
                            )}
                            <button
                                onClick={() => setActiveTab('resources')}
                                className="p-3 rounded-lg bg-muted/50 hover:bg-accent/50 transition-colors text-left"
                            >
                                <Database className="w-4 h-4 text-blue-500 mb-1" />
                                <div className="text-lg font-semibold">→</div>
                                <div className="text-xs text-muted-foreground">Resources</div>
                            </button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'components' && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Box className="w-5 h-5 text-indigo-500" />
                            <CardTitle className="text-base">Components in this Area</CardTitle>
                            <Badge variant="secondary">{components.length}</Badge>
                        </div>
                        <CardDescription>
                            Components are logical groupings of ROS 2 nodes (apps) within this namespace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {components.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4">
                                <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No components found in this area.</p>
                                <p className="text-xs mt-1">
                                    Components will appear here when ROS 2 nodes are discovered.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {components.map((component) => (
                                    <div
                                        key={component.path}
                                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer group transition-colors"
                                        onClick={() => handleComponentClick(component.path)}
                                    >
                                        <div className="p-1.5 rounded bg-indigo-100">
                                            <Box className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium truncate text-sm">{component.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono truncate">
                                                {component.id}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'resources' && <EntityResourceTabs entityId={areaId} entityType="areas" basePath={path} />}
        </div>
    );
}
