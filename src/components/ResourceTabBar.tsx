import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResourceTabBarTab<T extends string> {
    id: T;
    label: string;
    icon: LucideIcon;
}

interface ResourceTabBarProps<T extends string> {
    tabs: ResourceTabBarTab<T>[];
    activeTab: T;
    onTabChange: (id: T) => void;
    /** How many items each tab holds; a tab without a count, or at 0, shows none */
    counts?: Partial<Record<T, number>>;
    /** The tab whose count is a problem (faults): its count reads in the fault red */
    alarmTab?: T;
}

/**
 * An entity's tabs as one segmented control, as the selfpatch platform draws a page's
 * switch: the open tab raised in white on a quiet ground. Too wide for the pane, it
 * scrolls sideways on its own instead of pushing the page.
 */
export function ResourceTabBar<T extends string>({
    tabs,
    activeTab,
    onTabChange,
    counts,
    alarmTab,
}: ResourceTabBarProps<T>) {
    return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-px rounded-[9px] bg-canvas-2 p-0.5">
                {tabs.map(({ id, label, icon: Icon }) => {
                    const isActive = id === activeTab;
                    const count = counts?.[id] ?? 0;
                    return (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => onTabChange(id)}
                            className={cn(
                                'flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                                isActive ? 'raised text-foreground' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Icon className="size-4" aria-hidden />
                            {label}
                            {count > 0 && (
                                <span
                                    className={cn(
                                        'tabular-nums text-xs',
                                        id === alarmTab
                                            ? 'rounded-full bg-state-fault-bg px-1.5 font-semibold text-state-fault-text'
                                            : 'text-faint'
                                    )}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
