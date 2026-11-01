import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { Server, Settings, RefreshCw, Search, X, AlertTriangle, Layers, GitBranch, Package } from 'lucide-react';
import { Brand } from '@/components/Brand';
import { SidebarToggle } from '@/components/SidebarToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntityTreeNode } from '@/components/EntityTreeNode';
import { EntityTreeSkeleton } from '@/components/EntityTreeSkeleton';
import { FaultsCountBadge } from '@/components/FaultsDashboard';
import { useAppStore, type TreeViewMode } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { EntityTreeNode as EntityTreeNodeType } from '@/lib/types';

interface EntityTreeSidebarProps {
    /** The view the main pane shows, so its place in the sidebar reads as the current one */
    viewMode?: 'entity' | 'faults-dashboard' | 'updates-dashboard';
    onSettingsClick: () => void;
    /** Closes the sidebar where it lies over the view (a phone) */
    onClose?: () => void;
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
    viewMode = 'entity',
    onSettingsClick,
    onClose,
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

    const navItemClass = (active: boolean) =>
        cn(
            'flex h-[34px] items-center gap-[11px] rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-[18px] [&_svg]:stroke-[1.8]',
            active
                ? 'raised text-foreground [&_svg]:text-foreground'
                : 'text-body hover:bg-graphite/5 hover:text-foreground [&_svg]:text-muted-foreground'
        );

    const segmentClass = (active: boolean) =>
        cn(
            'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 [&_svg]:size-3.5',
            active ? 'raised text-foreground' : 'text-muted-foreground hover:text-foreground'
        );

    return (
        <aside className="flex h-full w-72 flex-col bg-canvas pr-2 pb-2 pl-2.5">
            {/* The brand; on a phone also the way back to the view */}
            <div className="flex h-14 shrink-0 items-center pl-2">
                <Brand />
                <SidebarToggle className="ml-auto hidden md:grid" />
                {onClose && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-9 md:hidden"
                        onClick={onClose}
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                )}
            </div>

            {/* The gateway's main view beside the tree */}
            {isConnected && onFaultsDashboardClick && (
                <nav aria-label="Views" className="grid gap-px">
                    <button
                        type="button"
                        className={navItemClass(viewMode === 'faults-dashboard')}
                        aria-current={viewMode === 'faults-dashboard' ? 'page' : undefined}
                        onClick={onFaultsDashboardClick}
                    >
                        <AlertTriangle aria-hidden />
                        <span>Faults Dashboard</span>
                        <FaultsCountBadge />
                    </button>
                </nav>
            )}

            {isConnected && (
                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                    {/* How the tree is built, and its refresh */}
                    <div className="flex items-center gap-1">
                        <div role="group" aria-label="Tree view" className="flex flex-1 rounded-lg bg-graphite/5 p-0.5">
                            <button
                                type="button"
                                aria-pressed={treeViewMode === 'logical'}
                                className={segmentClass(treeViewMode === 'logical')}
                                onClick={() => handleViewModeChange('logical')}
                                disabled={isRefreshing}
                                title="Logical View: Areas → Components → Apps"
                            >
                                <Layers aria-hidden />
                                Logical
                            </button>
                            <button
                                type="button"
                                aria-pressed={treeViewMode === 'functional'}
                                className={segmentClass(treeViewMode === 'functional')}
                                onClick={() => handleViewModeChange('functional')}
                                disabled={isRefreshing}
                                title="Functional View: Functions → Apps"
                            >
                                <GitBranch aria-hidden />
                                Functional
                            </button>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            title="Refresh entities"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>

                    {/* Search bar */}
                    <div className="relative mt-2">
                        <Search
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            type="text"
                            placeholder="Search entities... (⌘K)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 border-graphite/12 bg-white pl-8 pr-8 text-sm"
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

                    {/* Tree content */}
                    <div
                        role="tree"
                        aria-label="Entity tree navigation"
                        className="-mx-1 mt-2 flex-1 overflow-y-auto px-1 pb-1"
                    >
                        {isLoading ? (
                            <EntityTreeSkeleton />
                        ) : filteredEntities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                                <Search className="w-8 h-8 mb-2 opacity-50" />
                                <p>No entities found</p>
                                {searchQuery && <p className="text-xs mt-1">Try a different search term</p>}
                            </div>
                        ) : (
                            <div role="group" className="space-y-px">
                                {filteredEntities.map((entity) => (
                                    <EntityTreeNode key={entity.path} node={entity} depth={0} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* The foot: the gateway this page talks to (press it to connect or change it), then
                software updates, there when needed but not a main place */}
            <div className="mt-auto grid gap-px border-t border-hairline pt-2">
                <button
                    type="button"
                    onClick={onSettingsClick}
                    title={isConnected ? 'Server settings' : 'Connect to a gateway'}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-graphite/5 focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <span className="grid size-7 shrink-0 place-items-center rounded-[8.5px] bg-white text-muted-foreground shadow-[0_0_0_1px_rgb(18_20_19/0.08),0_1px_2px_rgb(18_20_19/0.06)]">
                        <Server className="size-4" aria-hidden />
                    </span>
                    <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="truncate text-sm font-semibold text-foreground">
                            {serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'No gateway'}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-faint">
                            <span
                                aria-hidden
                                className={cn(
                                    'size-1.5 shrink-0 rounded-full',
                                    isConnected ? 'bg-state-ok' : isConnecting ? 'bg-acid' : 'bg-state-off'
                                )}
                            />
                            {isConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'Not connected'}
                        </span>
                    </span>
                    <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                {isConnected && onUpdatesDashboardClick && (
                    <button
                        type="button"
                        className={cn(
                            'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:stroke-[1.8]',
                            viewMode === 'updates-dashboard'
                                ? 'raised text-foreground'
                                : 'text-muted-foreground hover:bg-graphite/5 hover:text-foreground'
                        )}
                        aria-current={viewMode === 'updates-dashboard' ? 'page' : undefined}
                        onClick={onUpdatesDashboardClick}
                    >
                        <Package aria-hidden />
                        <span>Updates</span>
                    </button>
                )}
            </div>
        </aside>
    );
}
