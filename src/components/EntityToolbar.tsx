import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { SidebarToggle } from '@/components/SidebarToggle';
import { useSidebar } from '@/hooks/useSidebarFold';

export interface EntityToolbarCrumb {
    label: string;
    path: string;
}

interface EntityToolbarProps {
    /** The entities above this one, outermost first; none on a page of its own */
    crumbs?: EntityToolbarCrumb[];
    onNavigate?: (path: string) => void;
    /** The entity's name: the view's heading */
    title: string;
    /** A word of what it is, after the title */
    kind?: string;
    /** A word of state after the title */
    lead?: ReactNode;
    /** The view's actions, at the right end */
    actions?: ReactNode;
}

/**
 * One line on top of the pane, as the selfpatch platform's toolbar: where you are
 * (the entities above, then this one's name), what it is or a word of its state, and
 * the view's actions.
 * It stays at the top while the view scrolls under it.
 */
export function EntityToolbar({ crumbs = [], onNavigate, title, kind, lead, actions }: EntityToolbarProps) {
    const { folded } = useSidebar();
    return (
        <div className="sticky top-0 z-20 flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-hairline bg-white px-4 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-1">
                {/* While the sidebar is folded away, the way back to it */}
                {folded && <SidebarToggle className="-ml-2 mr-1" />}
                {crumbs.length > 0 && (
                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
                        {crumbs.map((crumb) => (
                            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.(crumb.path)}
                                    className="-mx-1.5 h-[26px] max-w-48 truncate rounded-md px-1.5 text-sm font-medium text-faint outline-none hover:bg-graphite/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                    {crumb.label}
                                </button>
                                <ChevronRight className="size-3.5 text-[#b5bab4]" aria-hidden />
                            </span>
                        ))}
                    </nav>
                )}
                <h1 className="min-w-0 truncate font-sans text-sm leading-5 font-semibold tracking-normal text-foreground">
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
