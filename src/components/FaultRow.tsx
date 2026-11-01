import type { ReactNode } from 'react';
import { ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RowGrid } from '@/components/RowGrid';
import { SnapshotCard } from '@/components/SnapshotCard';
import { cn } from '@/lib/utils';
import type { Fault, FaultResponse, FaultSeverity, FaultStatus } from '@/lib/types';

const CHIP = 'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold';

const SEVERITY_CHIP: Record<FaultSeverity, string> = {
    critical: 'bg-state-fault text-white',
    error: 'bg-state-fault-bg text-state-fault-text',
    warning: 'bg-state-warn-bg text-state-warn-text',
    info: 'bg-canvas-2 text-body',
};

// An open fault is outlined in its colour, as on the selfpatch platform's timeline; an
// ended one says how it ended: healed on its own (acid) or cleared by someone (green).
const STATUS_CHIP: Record<FaultStatus, string> = {
    active: 'bg-white text-state-fault-text shadow-[inset_0_0_0_1.5px_var(--color-state-fault)]',
    pending: 'bg-white text-state-warn-text shadow-[inset_0_0_0_1.5px_var(--color-state-warn)]',
    healed: 'bg-acid text-state-healed-text',
    cleared: 'bg-state-fixed-bg text-state-fixed-text',
};

// The same states as a small square, for a line too short for a chip.
const STATUS_SWATCH: Record<FaultStatus, string> = {
    active: 'bg-state-fault-bg shadow-[inset_0_0_0_1.5px_var(--color-state-fault)]',
    pending: 'bg-state-warn-bg shadow-[inset_0_0_0_1.5px_var(--color-state-warn)]',
    healed: 'bg-acid shadow-[inset_0_0_0_1px_rgb(18_20_19/0.14)]',
    cleared: 'bg-state-fixed-bg shadow-[inset_0_0_0_1px_rgb(29_92_51/0.3)]',
};

/** How a fault stands, as a small square in its state's colour; its words are the title */
export function StatusSwatch({ status, className }: { status: FaultStatus; className?: string }) {
    return (
        <i
            role="img"
            aria-label={status}
            title={status}
            className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', STATUS_SWATCH[status], className)}
        />
    );
}

/** A fault's severity as a chip in its colour */
export function SeverityChip({ severity, children }: { severity: FaultSeverity; children?: ReactNode }) {
    return <span className={cn(CHIP, SEVERITY_CHIP[severity])}>{children ?? severity}</span>;
}

/** Fault rows in one list: hairlines between them, one rounded edge round them all */
export function FaultList({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div className={cn('divide-y divide-hairline overflow-hidden rounded-xl ring-1 ring-graphite/8', className)}>
            {children}
        </div>
    );
}

function formatTimestamp(timestamp: string): string {
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return timestamp;
    }
}

interface FaultRowProps {
    fault: Fault;
    onClear: () => void;
    isClearing: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    environmentData?: FaultResponse['environment_data'];
    isLoadingDetails: boolean;
}

/**
 * One fault in a hairline list: its code, severity and status, what it says, when and
 * where, and Clear while it is open. It unfolds into what the gateway kept of it: when it
 * first and last occurred, and its snapshots.
 */
export function FaultRow({
    fault,
    onClear,
    isClearing,
    isExpanded,
    onToggle,
    environmentData,
    isLoadingDetails,
}: FaultRowProps) {
    const canClear = fault.status === 'active' || fault.status === 'pending';
    const records = environmentData?.extended_data_records;
    const snapshots = environmentData?.snapshots ?? [];

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle} className="bg-white">
            <CollapsibleTrigger asChild>
                <div className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                    <ChevronRight
                        className={cn(
                            'mt-0.5 size-4 shrink-0 text-faint transition-transform',
                            isExpanded && 'rotate-90'
                        )}
                        aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="mr-0.5 font-mono text-[13px] font-medium text-foreground">
                                {fault.code}
                            </span>
                            <SeverityChip severity={fault.severity} />
                            <span className={cn(CHIP, STATUS_CHIP[fault.status])}>{fault.status}</span>
                        </div>
                        <p className="text-sm text-body">{fault.message}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
                            <span>{formatTimestamp(fault.timestamp)}</span>
                            <span className="font-mono">
                                {fault.entity_type}: {fault.entity_id}
                            </span>
                        </div>
                    </div>

                    {canClear && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                            disabled={isClearing}
                            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                            title="Clear fault"
                        >
                            {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                    )}
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="space-y-4 border-t border-hairline bg-canvas/50 px-4 py-4 sm:pl-11">
                    {isLoadingDetails ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading environment data...
                        </div>
                    ) : records || snapshots.length > 0 ? (
                        <>
                            {records && (
                                <section className="space-y-2">
                                    <h5 className="text-xs font-medium text-faint">Extended Data Records</h5>
                                    <RowGrid as="dl">
                                        {[
                                            { label: 'First Occurrence', value: records.first_occurrence },
                                            { label: 'Last Occurrence', value: records.last_occurrence },
                                        ]
                                            .filter(({ value }) => value)
                                            .map(({ label, value }) => (
                                                <div key={label} className="bg-white px-3 py-2">
                                                    <dt className="text-xs text-faint">{label}</dt>
                                                    <dd className="font-mono text-xs text-foreground">
                                                        {new Date(value).toLocaleString()}
                                                    </dd>
                                                </div>
                                            ))}
                                    </RowGrid>
                                </section>
                            )}

                            {snapshots.length > 0 && (
                                <section className="space-y-2">
                                    <h5 className="text-xs font-medium text-faint">Snapshots ({snapshots.length})</h5>
                                    <div className="space-y-2">
                                        {snapshots.map((snapshot, idx) => (
                                            <SnapshotCard
                                                key={`${snapshot.name}-${idx}`}
                                                snapshot={snapshot}
                                                index={idx}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">No environment data available</p>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
