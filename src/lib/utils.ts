import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SovdResourceEntityType } from './types';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Map fault entity_type (may be singular or plural) to SovdResourceEntityType (always plural).
 * Shared utility used by FaultsDashboard and FaultsPanel.
 */
export function mapFaultEntityTypeToResourceType(entityType: string): SovdResourceEntityType {
    const type = entityType.toLowerCase();
    if (type === 'area' || type === 'areas') return 'areas';
    if (type === 'app' || type === 'apps') return 'apps';
    if (type === 'function' || type === 'functions') return 'functions';
    if (type === 'component' || type === 'components') return 'components';

    console.warn(
        '[mapFaultEntityTypeToResourceType] Unexpected entity_type:',
        entityType,
        '- defaulting to "components".'
    );
    return 'components';
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds as human-readable string
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

/**
 * Key for per-fault UI caches (expand state, detail cache, in-flight sets).
 *
 * A fault code is only unique within one entity - two apps can both report
 * `LIDAR_RANGE_INVALID` - so any cache keyed by code alone ties their rows
 * together: expanding one opens both, and a clear resolves to whichever
 * entity's fault happens to come first. Including the entity makes the key as
 * specific as the request that filled the cache.
 */
export function faultKey(fault: { code: string; entity_type?: string; entity_id?: string }): string {
    return `${fault.entity_type ?? ''}/${fault.entity_id ?? ''}/${fault.code}`;
}
