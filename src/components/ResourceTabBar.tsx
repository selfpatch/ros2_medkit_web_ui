import type { LucideIcon } from 'lucide-react';
import { SEGMENT_GROUP, segmentClass } from '@/components/SegmentedSwitch';
import { cn } from '@/lib/utils';

export interface ResourceTabBarTab<T extends string> {
    id: T;
    label: string;
    icon: LucideIcon;
}

interface ResourceTabBarProps<T extends string> {
    tabs: readonly ResourceTabBarTab<T>[];
    /** The open tab; one that is not among `tabs` (a tab that just went away) shows the first as open */
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
    // The parent drops a vanished tab in an effect, after this render: never show none open meanwhile
    const shownTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;
    return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className={SEGMENT_GROUP}>
                {tabs.map(({ id, label, icon: Icon }) => {
                    const isActive = id === shownTab;
                    const count = counts?.[id] ?? 0;
                    return (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => onTabChange(id)}
                            className={segmentClass(isActive, 'lg')}
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
