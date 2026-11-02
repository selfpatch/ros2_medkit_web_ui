import { PanelLeft } from 'lucide-react';
import { useSidebar } from '@/hooks/useSidebarFold';
import { cn } from '@/lib/utils';

// The shortcut as it reads on this computer, and as assistive technology names it
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT = MAC ? '⌘\\' : 'Ctrl+\\';
const KEYS = MAC ? 'Meta+Backslash' : 'Control+Backslash';

/**
 * The sidebar's fold button: beside the wordmark it hides the sidebar, at the start of a view's
 * top line it brings it back.
 */
export function SidebarToggle({ className }: { className?: string }) {
    const { folded, toggle } = useSidebar();
    const label = folded ? 'Show sidebar' : 'Hide sidebar';
    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            title={`${label} (${SHORTCUT})`}
            aria-keyshortcuts={KEYS}
            data-sidebar-toggle=""
            className={cn(
                'grid size-[30px] shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-graphite/6 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
                className
            )}
        >
            <PanelLeft className="size-4 stroke-[1.8]" aria-hidden />
        </button>
    );
}

/**
 * A top line for a view that has no toolbar of its own, there only while the sidebar is folded,
 * so the way back is always one press away.
 */
export function SidebarLine() {
    const { folded } = useSidebar();
    if (!folded) return null;
    return (
        <div className="flex min-h-12 shrink-0 items-center border-b border-hairline px-2.5">
            <SidebarToggle />
        </div>
    );
}
