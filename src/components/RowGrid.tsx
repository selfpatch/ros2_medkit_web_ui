import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RowGridProps extends HTMLAttributes<HTMLElement> {
    /** `dl` when the rows are facts (each a div of dt and dd) */
    as?: 'div' | 'dl';
    /** 1 keeps one column at every width, for rows that need the room; 'auto' fits as many as the room holds */
    columns?: 1 | 'auto';
    /** The narrowest an automatic column may get */
    minColumn?: string;
}

/**
 * Rows in one hairline grid, the selfpatch platform's reading grid. It takes as many columns as
 * the room holds (none narrower than `minColumn`), so three short facts sit in one row on a wide
 * pane and stack on a phone, and a column never grows past the pane. Each row brings its own
 * white ground; the lines between rows are the rows' own outlines, so a short last row leaves
 * white, not a grey hole.
 */
export function RowGrid({
    as: Tag = 'div',
    columns = 'auto',
    minColumn = '17rem',
    className,
    style,
    ...props
}: RowGridProps) {
    return (
        <Tag
            className={cn(
                'grid grid-cols-1 overflow-hidden rounded-xl bg-white ring-1 ring-graphite/8 [&>*]:outline [&>*]:outline-graphite/8',
                className
            )}
            style={
                columns === 'auto'
                    ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minColumn}), 1fr))`, ...style }
                    : style
            }
            {...props}
        />
    );
}
