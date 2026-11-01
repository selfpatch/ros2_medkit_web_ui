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

/**
 * A small switch between two or three ways to show one thing (Form or JSON), as the
 * selfpatch platform draws one: the picked way raised in white on a quiet ground.
 */
export function SegmentedSwitch<T extends string>({ options, value, onChange, className }: SegmentedSwitchProps<T>) {
    return (
        <div className={cn('inline-flex gap-px rounded-[9px] bg-canvas-2 p-0.5', className)}>
            {options.map(({ value: option, label, icon: Icon }) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={cn(
                        'flex h-6 items-center gap-1 rounded-[7px] px-2 text-xs font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                        value === option ? 'raised text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    {Icon && <Icon className="w-3 h-3" aria-hidden />}
                    {label}
                </button>
            ))}
        </div>
    );
}
