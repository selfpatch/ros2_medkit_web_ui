import { useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import {
    ChevronRight,
    Loader2,
    Server,
    Folder,
    FolderOpen,
    FileJson,
    Box,
    MessageSquare,
    ArrowUp,
    ArrowDown,
    Zap,
    Clock,
    Sliders,
    AlertTriangle,
    Cpu,
    Layers,
    GitBranch,
    Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAppStore, entityStatusKey } from '@/lib/store';
import type { EntityTreeNode as EntityTreeNodeType, TopicNodeData, Parameter } from '@/lib/types';

interface EntityTreeNodeProps {
    node: EntityTreeNodeType;
    depth: number;
}

/**
 * Get icon for entity type
 *
 * Entity types (structural):
 * - Area: Layers (namespace grouping)
 * - Subarea: Layers (nested namespace)
 * - Component: Box (logical grouping)
 * - Subcomponent: Box (nested component)
 * - App: Cpu (ROS 2 node)
 * - Function: GitBranch (capability grouping)
 */
function getEntityIcon(type: string, isExpanded?: boolean) {
    switch ((type || '').toLowerCase()) {
        // Entity types
        case 'area':
        case 'subarea':
            return Layers;
        case 'component':
        case 'subcomponent':
        case 'ecu':
            return Box;
        case 'app':
            return Cpu;
        case 'function':
            return GitBranch;
        // Collection/folder types
        case 'folder':
            return isExpanded ? FolderOpen : Folder;
        case 'device':
        case 'server':
            return Server;
        // Resource item types
        case 'topic':
            return MessageSquare;
        case 'service':
            return Zap;
        case 'action':
            return Clock;
        case 'parameter':
            return Sliders;
        case 'fault':
            return AlertTriangle;
        case 'package':
            return Package;
        default:
            return FileJson;
    }
}

/**
 * Get color class for entity type
 */
function getEntityColor(type: string, isSelected?: boolean): string {
    if (isSelected) return 'text-primary';

    switch (type.toLowerCase()) {
        case 'area':
            return 'text-cyan-500';
        case 'subarea':
            return 'text-cyan-400';
        case 'component':
        case 'ecu':
            return 'text-indigo-500';
        case 'subcomponent':
            return 'text-indigo-400';
        case 'app':
            return 'text-emerald-500';
        case 'function':
            return 'text-violet-500';
        case 'server':
            return 'text-primary';
        case 'topic':
            return 'text-blue-400';
        case 'service':
            return 'text-amber-400';
        case 'action':
            return 'text-orange-400';
        case 'fault':
            return 'text-red-400';
        default:
            return 'text-muted-foreground';
    }
}

/**
 * Tailwind colour for the readiness lamp. Green = ready, amber = notReady,
 * grey for unavailable / unknown / not-yet-fetched.
 */
function getLampColor(status: string | undefined): string {
    switch (status) {
        case 'ready':
            return 'bg-emerald-500';
        case 'notReady':
            return 'bg-amber-500';
        default:
            return 'bg-muted-foreground/40';
    }
}

/**
 * Check if node data is TopicNodeData (from topicsInfo)
 */
function isTopicNodeData(data: unknown): data is TopicNodeData {
    return !!data && typeof data === 'object' && 'isPublisher' in data && 'isSubscriber' in data;
}

/**
 * Check if node data is Parameter
 */
function isParameterData(data: unknown): data is Parameter {
    return !!data && typeof data === 'object' && 'type' in data && 'value' in data && !('kind' in data);
}

export function EntityTreeNode({ node, depth }: EntityTreeNodeProps) {
    const { expandedPaths, loadingPaths, selectedPath, toggleExpanded, loadChildren, selectEntity } = useAppStore(
        useShallow((state) => ({
            expandedPaths: state.expandedPaths,
            loadingPaths: state.loadingPaths,
            selectedPath: state.selectedPath,
            toggleExpanded: state.toggleExpanded,
            loadChildren: state.loadChildren,
            selectEntity: state.selectEntity,
        }))
    );

    // Lifecycle readiness lamp is only meaningful for apps and components.
    // The tree uses singular node types; the lifecycle API uses plural.
    const isLifecycleEntity = node.type === 'app' || node.type === 'component';
    const lifecycleType = node.type === 'app' ? 'apps' : 'components';
    const status = useAppStore((s) =>
        isLifecycleEntity ? s.statusByEntity[entityStatusKey(lifecycleType, node.id)] : undefined
    );
    const fetchEntityStatus = useAppStore((s) => s.fetchEntityStatus);

    // Lazily fetch readiness on mount. This node only mounts when its parent is
    // expanded, so this is the on-expand fetch. The slice de-dupes with the
    // control's own fetch.
    useEffect(() => {
        if (isLifecycleEntity) {
            fetchEntityStatus(lifecycleType, node.id);
        }
    }, [isLifecycleEntity, lifecycleType, node.id, fetchEntityStatus]);

    const isExpanded = expandedPaths.includes(node.path);
    const isLoading = loadingPaths.includes(node.path);
    const isSelected = selectedPath === node.path;
    const hasChildren = node.hasChildren !== false; // Default to true if not specified
    const Icon = getEntityIcon(node.type, isExpanded);
    const iconColorClass = getEntityColor(node.type, isSelected);

    // Get topic direction info if available
    const topicData = isTopicNodeData(node.data) ? node.data : null;
    const parameterData = isParameterData(node.data) ? node.data : null;

    // Load children when expanded
    useEffect(() => {
        if (isExpanded && !node.children && !isLoading && hasChildren) {
            loadChildren(node.path);
        }
    }, [isExpanded, node, isLoading, hasChildren, loadChildren]);

    const handleToggle = () => {
        if (hasChildren) {
            toggleExpanded(node.path);
        }
    };

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectEntity(node.path);
    };

    return (
        <Collapsible open={isExpanded} onOpenChange={handleToggle}>
            <div
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={hasChildren ? isExpanded : undefined}
                aria-label={`${node.type} ${node.name}`}
                tabIndex={0}
                className={cn(
                    'flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    isSelected && 'bg-primary/10 text-primary font-medium'
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleSelect}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(e as unknown as React.MouseEvent);
                    } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
                        e.preventDefault();
                        handleToggle();
                    } else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
                        e.preventDefault();
                        handleToggle();
                    }
                }}
            >
                <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        className={cn(
                            'p-0.5 rounded hover:bg-primary/10 transition-transform',
                            !hasChildren && 'invisible'
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                            <ChevronRight
                                className={cn(
                                    'w-4 h-4 text-muted-foreground transition-transform',
                                    isExpanded && 'rotate-90',
                                    isSelected && 'text-primary'
                                )}
                            />
                        )}
                    </button>
                </CollapsibleTrigger>

                <Icon className={cn('w-4 h-4 shrink-0', iconColorClass)} />

                {isLifecycleEntity && (
                    <span
                        aria-label={`status: ${status ?? 'unknown'}`}
                        className={cn('w-2 h-2 rounded-full shrink-0', getLampColor(status))}
                    />
                )}

                <span className="text-sm truncate flex-1" title={typeof node.name === 'string' ? node.name : node.id}>
                    {(typeof node.description === 'string' && node.description) ||
                        (typeof node.name === 'string' ? node.name : String(node.name || node.id || ''))}
                </span>

                {/* Topic direction indicators */}
                {topicData && (
                    <div
                        className="flex items-center gap-0.5 mr-1"
                        title={`${topicData.isPublisher ? 'Publishes' : ''}${topicData.isPublisher && topicData.isSubscriber ? ' & ' : ''}${topicData.isSubscriber ? 'Subscribes' : ''}`}
                    >
                        {topicData.isPublisher && <ArrowUp className="w-3 h-3 text-green-500" />}
                        {topicData.isSubscriber && <ArrowDown className="w-3 h-3 text-blue-500" />}
                    </div>
                )}

                {/* Parameter value indicator */}
                {parameterData && (
                    <span
                        className="text-xs text-muted-foreground font-mono truncate max-w-[100px]"
                        title={String(parameterData.value)}
                    >
                        {String(parameterData.value)}
                    </span>
                )}

                {/* Type label badge */}
                <span
                    className={cn(
                        'text-xs shrink-0 px-1 py-0.5 rounded',
                        isSelected ? 'text-primary/70' : 'text-muted-foreground bg-muted/50'
                    )}
                >
                    {typeof node.type === 'string' ? node.type : 'unknown'}
                </span>
            </div>

            {hasChildren && (
                <CollapsibleContent>
                    {node.children && node.children.length > 0
                        ? node.children.map((child) => (
                              <EntityTreeNode key={child.path} node={child} depth={depth + 1} />
                          ))
                        : // Empty state for folders with no children (after loading)
                          !isLoading &&
                          node.children !== undefined && (
                              <div
                                  className="flex items-center gap-2 py-1.5 px-2 text-muted-foreground italic text-sm select-none"
                                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                              >
                                  <span className="text-xs">—</span>
                                  <span>Empty</span>
                              </div>
                          )}
                </CollapsibleContent>
            )}
        </Collapsible>
    );
}
