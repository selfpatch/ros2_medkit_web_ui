import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    icon?: LucideIcon;
}

interface SegmentedSwitchProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** The quiet ground the segments sit on */
export const SEGMENT_GROUP = 'inline-flex gap-px rounded-[9px] bg-canvas-2 p-0.5';

/** sm: a way to show one thing (Form or JSON); md: a page's switch (Now or History); lg: an entity's tabs */
export type SegmentSize = 'sm' | 'md' | 'lg';

const SEGMENT_SIZE: Record<SegmentSize, string> = {
    sm: 'h-6 gap-1 px-2 text-xs',
    md: 'h-7 gap-1.5 px-2.5 text-[13px]',
    lg: 'h-8 gap-1.5 px-3 text-[13px]',
};

/**
 * One segment of a segmented control: the picked one raised in white, the others quiet.
 * Tailwind 4's `outline-none` sets the outline style to none, so the focus ring needs
 * `focus-visible:outline-solid` to be drawn at all.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function segmentClass(active: boolean, size: SegmentSize): string {
    return cn(
        'flex items-center whitespace-nowrap rounded-[7px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
        SEGMENT_SIZE[size],
        active ? 'raised text-foreground' : 'text-muted-foreground hover:text-foreground'
    );
}

/**
 * A small switch between two or three ways to show one thing (Form or JSON), as the
 * selfpatch platform draws one: the picked way raised in white on a quiet ground.
 */
export function SegmentedSwitch<T extends string>({ options, value, onChange, className }: SegmentedSwitchProps<T>) {
    return (
        <div className={cn(SEGMENT_GROUP, className)}>
            {options.map(({ value: option, label, icon: Icon }) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={segmentClass(value === option, 'sm')}
                >
                    {Icon && <Icon className="w-3 h-3" aria-hidden />}
                    {label}
                </button>
            ))}
        </div>
    );
}
