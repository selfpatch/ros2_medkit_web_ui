import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface RowGridBaseProps extends HTMLAttributes<HTMLElement> {
    /** `dl` when the rows are facts (each a div of dt and dd) */
    as?: 'div' | 'dl';
}

interface AutoColumnsProps extends RowGridBaseProps {
    /** As many columns as the room holds (the default) */
    columns?: 'auto';
    /** The narrowest an automatic column may get */
    minColumn?: string;
}

interface OneColumnProps extends RowGridBaseProps {
    /** One column at every width, for rows that need the room */
    columns: 1;
    minColumn?: never;
}

type RowGridProps = AutoColumnsProps | OneColumnProps;

/**
 * Rows in one hairline grid, the selfpatch platform's reading grid. With automatic columns it
 * takes as many as the room holds (none narrower than `minColumn`), so three short facts sit in
 * one row on a wide pane and stack on a phone, and a column never grows past the pane. Each row
 * brings its own white ground; the lines between rows are the rows' own outlines, so a short
 * last row leaves white, not a grey hole. A row must not set `outline-none` (it would erase its
 * line): rows take focus with `focus-visible:` outline classes only.
 */
export function RowGrid({
    as: Tag = 'div',
    columns = 'auto',
    minColumn = '17rem',
    className,
    style,
    ...props
}: RowGridProps) {
    const auto = columns === 'auto';
    return (
        <Tag
            className={cn(
                'grid overflow-hidden rounded-xl bg-white ring-1 ring-graphite/8 [&>*]:outline [&>*]:outline-graphite/8',
                auto ? 'grid-cols-[repeat(auto-fit,minmax(min(100%,var(--row-grid-min)),1fr))]' : 'grid-cols-1',
                className
            )}
            style={auto ? ({ '--row-grid-min': minColumn, ...style } as CSSProperties) : style}
            {...props}
        />
    );
}
