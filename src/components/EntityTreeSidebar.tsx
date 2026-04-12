import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { Server, Settings, RefreshCw, Search, X, AlertTriangle, Layers, GitBranch, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntityTreeNode } from '@/components/EntityTreeNode';
import { EntityTreeSkeleton } from '@/components/EntityTreeSkeleton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { EmptyState } from '@/components/EmptyState';
import { FaultsCountBadge } from '@/components/FaultsDashboard';
import { useAppStore, type TreeViewMode } from '@/lib/store';
import type { EntityTreeNode as EntityTreeNodeType } from '@/lib/types';

interface EntityTreeSidebarProps {
    onSettingsClick: () => void;
    onFaultsDashboardClick?: () => void;
    onUpdatesDashboardClick?: () => void;
}

/**
 * Recursively filter tree nodes by search query
 * Returns nodes that match or have matching descendants
 */
function filterTree(nodes: EntityTreeNodeType[], query: string): EntityTreeNodeType[] {
    const lowerQuery = query.toLowerCase();
    const result: EntityTreeNodeType[] = [];

    for (const node of nodes) {
        const nameMatches = node.name.toLowerCase().includes(lowerQuery);
        const typeMatches = node.type.toLowerCase().includes(lowerQuery);
        const filteredChildren = node.children ? filterTree(node.children, query) : undefined;

        // Include node if it matches or has matching children
        if (nameMatches || typeMatches || (filteredChildren && filteredChildren.length > 0)) {
            result.push({
                ...node,
                children: filteredChildren && filteredChildren.length > 0 ? filteredChildren : node.children,
            });
        }
    }

    return result;
}

export function EntityTreeSidebar({
    onSettingsClick,
    onFaultsDashboardClick,
    onUpdatesDashboardClick,
}: EntityTreeSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { isConnected, isConnecting, serverUrl, rootEntities, loadRootEntities, treeViewMode, setTreeViewMode } =
        useAppStore(
            useShallow((state) => ({
                isConnected: state.isConnected,
                isConnecting: state.isConnecting,
                serverUrl: state.serverUrl,
                rootEntities: state.rootEntities,
                loadRootEntities: state.loadRootEntities,
                treeViewMode: state.treeViewMode,
                setTreeViewMode: state.setTreeViewMode,
            }))
        );

    const handleViewModeChange = async (mode: TreeViewMode) => {
        if (mode !== treeViewMode) {
            setIsRefreshing(true);
            await setTreeViewMode(mode);
            setIsRefreshing(false);
        }
    };

    const filteredEntities = useMemo(() => {
        if (!searchQuery.trim()) {
            return rootEntities;
        }
        return filterTree(rootEntities, searchQuery.trim());
    }, [rootEntities, searchQuery]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadRootEntities();
        setIsRefreshing(false);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
    };

    const isLoading = isConnecting || (isConnected && rootEntities.length === 0 && !searchQuery);

    return (
        <aside className="w-80 border-r bg-card flex flex-col h-full">
            {/* Header - with top padding on mobile for menu button */}
            <div className="p-4 pt-14 md:pt-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold">Entity Tree</h2>
                </div>
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    {isConnected ? (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                title="Refresh entities"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={onSettingsClick}
                                title="Server settings"
                            >
                                <Settings className="w-4 h-4" />
                            </Button>
                        </>
                    ) : (
                        <Button variant="default" size="sm" onClick={onSettingsClick}>
                            Connect
                        </Button>
                    )}
                </div>
            </div>

            {/* Connection status */}
            {isConnected && serverUrl && (
                <div className="px-4 py-2 border-b">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-muted-foreground truncate">{serverUrl}</span>
                    </div>
                </div>
            )}

            {/* View mode toggle */}
            {isConnected && (
                <div className="px-3 py-2 border-b">
                    <div className="flex rounded-md border bg-muted p-0.5">
                        <Button
                            variant={treeViewMode === 'logical' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="flex-1 h-7 text-xs gap-1.5"
                            onClick={() => handleViewModeChange('logical')}
                            disabled={isRefreshing}
                            title="Logical View: Areas → Components → Apps"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Logical
                        </Button>
                        <Button
                            variant={treeViewMode === 'functional' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="flex-1 h-7 text-xs gap-1.5"
                            onClick={() => handleViewModeChange('functional')}
                            disabled={isRefreshing}
                            title="Functional View: Functions → Apps"
                        >
                            <GitBranch className="w-3.5 h-3.5" />
                            Functional
                        </Button>
                    </div>
                </div>
            )}

            {/* Search bar */}
            {isConnected && (
                <div className="px-3 py-2 border-b">
                    <div className="relative">
                        <Search
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            type="text"
                            placeholder="Search entities... (⌘K)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-8 h-8 text-sm"
                            aria-label="Search entities"
                        />
                        {searchQuery && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                                onClick={handleClearSearch}
                                aria-label="Clear search"
                            >
                                <X className="w-3 h-3" />
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Tree content */}
            <div role="tree" aria-label="Entity tree navigation" className="flex-1 overflow-y-auto p-2">
                {!isConnected ? (
                    <EmptyState type="no-connection" />
                ) : isLoading ? (
                    <EntityTreeSkeleton />
                ) : filteredEntities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                        <Search className="w-8 h-8 mb-2 opacity-50" />
                        <p>No entities found</p>
                        {searchQuery && <p className="text-xs mt-1">Try a different search term</p>}
                    </div>
                ) : (
                    <div role="group" className="space-y-0.5">
                        {filteredEntities.map((entity) => (
                            <EntityTreeNode key={entity.path} node={entity} depth={0} />
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            {isConnected && (
                <div className="p-2 border-t flex gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-start gap-2"
                        onClick={onFaultsDashboardClick}
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Faults</span>
                        <FaultsCountBadge />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-start gap-2"
                        onClick={onUpdatesDashboardClick}
                    >
                        <Package className="w-4 h-4 text-blue-500" />
                        <span>Updates</span>
                    </Button>
                </div>
            )}
        </aside>
    );
}
