import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { SidebarToggle } from '@/components/SidebarToggle';
import { useSidebar } from '@/hooks/useSidebarFold';
import { cn } from '@/lib/utils';

export interface EntityToolbarCrumb {
    label: string;
    path: string;
}

interface EntityToolbarBaseProps {
    /** The entity's name: the view's heading */
    title: string;
    /** A word of what it is, after the title */
    kind?: string;
    /** What follows the title on its line: a word of state, or the view's own switch with its count */
    lead?: ReactNode;
    /** The view's actions, at the right end */
    actions?: ReactNode;
}

interface WithCrumbsProps extends EntityToolbarBaseProps {
    /** The entities above this one, outermost first */
    crumbs: EntityToolbarCrumb[];
    /** Opens the entity a crumb names */
    onNavigate: (path: string) => void;
}

interface PageOfItsOwnProps extends EntityToolbarBaseProps {
    crumbs?: never;
    onNavigate?: never;
}

type EntityToolbarProps = WithCrumbsProps | PageOfItsOwnProps;

/**
 * One line on top of the pane, as the selfpatch platform's toolbar: where you are
 * (the entities above, then this one's name), what it is or a word of its state, and
 * the view's actions.
 * It stays at the top while the view scrolls under it. Where the room runs out the crumbs
 * scroll inside their own strip, kept at its end so the nearest entity shows, and the title
 * gives way only after them.
 */
export function EntityToolbar({ crumbs, onNavigate, title, kind, lead, actions }: EntityToolbarProps) {
    const { folded } = useSidebar();
    const trailRef = useRef<HTMLElement>(null);
    const hasCrumbs = crumbs !== undefined && crumbs.length > 0;
    // A new array of the same crumbs on every render of the parent must not scroll the trail back
    const trail = crumbs?.map((crumb) => crumb.path).join('\n') ?? '';

    useLayoutEffect(() => {
        const nav = trailRef.current;
        if (nav) nav.scrollLeft = nav.scrollWidth;
    }, [trail]);

    return (
        <div className="sticky top-0 z-20 flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-hairline bg-white px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-1">
                {/* While the sidebar is folded away, the way back to it */}
                {folded && <SidebarToggle className="-ml-2 mr-1" />}
                {hasCrumbs && (
                    // The left padding gives the first crumb's hover ground the room its negative margin takes
                    <nav
                        ref={trailRef}
                        aria-label="Breadcrumb"
                        className="-ml-1.5 flex min-w-0 items-center gap-1 overflow-x-auto pl-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {crumbs.map((crumb) => (
                            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onNavigate(crumb.path)}
                                    className="-mx-1.5 h-[26px] max-w-48 truncate rounded-md px-1.5 text-sm font-medium text-faint outline-none hover:bg-graphite/5 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
                                >
                                    {crumb.label}
                                </button>
                                <ChevronRight className="size-3.5 text-[#b5bab4]" aria-hidden />
                            </span>
                        ))}
                    </nav>
                )}
                <h1
                    title={title}
                    className={cn(
                        'min-w-0 truncate font-sans text-sm leading-5 font-semibold tracking-normal text-foreground',
                        // Beside crumbs it keeps its whole width while they can still give way, and leaves them 5rem
                        hasCrumbs && 'max-w-[calc(100%-5rem)] shrink-0'
                    )}
                >
                    {title}
                </h1>
            </div>
            {kind && (
                <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-canvas px-2 text-xs font-medium text-muted-foreground">
                    {kind}
                </span>
            )}
            {lead}
            {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
    );
}
