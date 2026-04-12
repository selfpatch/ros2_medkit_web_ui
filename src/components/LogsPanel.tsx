// Copyright 2026 bburda
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { Download, Loader2, RefreshCw, ScrollText, Search, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/lib/store';
import type { LogCollection, LogEntry, LogSeverity, LogsFetchResult, SovdResourceEntityType } from '@/lib/types';

interface LogsPanelProps {
    entityId: string;
    entityType: SovdResourceEntityType;
}

export function LogsPanel({ entityId, entityType }: LogsPanelProps) {
    const { fetchEntityLogs, getLogsConfiguration, updateLogsConfiguration } = useAppStore(
        useShallow((state) => ({
            fetchEntityLogs: state.fetchEntityLogs,
            getLogsConfiguration: state.getLogsConfiguration,
            updateLogsConfiguration: state.updateLogsConfiguration,
        }))
    );

    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [aggregation, setAggregation] = useState<LogCollection['x-medkit']>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [lastRefreshFailed, setLastRefreshFailed] = useState(false);

    const [severity, setSeverity] = useState<LogSeverity>('debug');
    const [contextFilter, setContextFilter] = useState('');
    const [contextDraft, setContextDraft] = useState('');
    const [messageSearch, setMessageSearch] = useState('');

    const [isCleared, setIsCleared] = useState(false);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const [configOpen, setConfigOpen] = useState(false);
    const [configLoaded, setConfigLoaded] = useState(false);
    const [configLoading, setConfigLoading] = useState(false);
    const [configSeverity, setConfigSeverity] = useState<LogSeverity>('debug');
    const [configMaxEntries, setConfigMaxEntries] = useState<number>(100);
    const [configSaving, setConfigSaving] = useState(false);

    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
    const [refreshIntervalMs, setRefreshIntervalMs] = useState(5000);
    const [isDocumentVisible, setIsDocumentVisible] = useState(
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    );

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const abortRef = useRef<AbortController | null>(null);

    const doFetch = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const result: LogsFetchResult = await fetchEntityLogs(
                entityType,
                entityId,
                { severity, context: contextFilter },
                controller.signal
            );
            if (controller.signal.aborted) return;

            if (result.errorStatus !== undefined) {
                // 404 = entity has no /logs endpoint on this gateway.
                // 503 = LogManager feature not available on this gateway.
                // Both are "logs not available" states - show the unavailable card.
                // Any other error (network failure, 5xx) keeps last-known entries
                // and surfaces a "Last refresh failed" warning in the toolbar.
                if (result.errorStatus === 503 || result.errorStatus === 404) {
                    setErrorStatus(result.errorStatus);
                    setEntries([]);
                    setAggregation(undefined);
                } else {
                    setLastRefreshFailed(true);
                }
            } else {
                setEntries(result.items);
                setAggregation(result['x-medkit']);
                setErrorStatus(null);
                setLastRefreshFailed(false);
                setIsCleared(false);
            }
        } catch (err) {
            if ((err as { name?: string }).name === 'AbortError') return;
            setLastRefreshFailed(true);
        } finally {
            if (!controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    }, [fetchEntityLogs, entityType, entityId, severity, contextFilter]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setContextFilter(contextDraft);
        }, 300);
        return () => clearTimeout(timer);
    }, [contextDraft]);

    useEffect(() => {
        void doFetch();
        return () => {
            abortRef.current?.abort();
        };
    }, [doFetch]);

    useEffect(() => {
        const onVisibilityChange = () => {
            setIsDocumentVisible(document.visibilityState === 'visible');
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    useEffect(() => {
        if (!autoRefreshEnabled || !isDocumentVisible) return;
        const id = setInterval(() => {
            void doFetch();
        }, refreshIntervalMs);
        return () => clearInterval(id);
    }, [autoRefreshEnabled, isDocumentVisible, refreshIntervalMs, doFetch]);

    // Reset ALL local state when the entity changes so nothing from the
    // previous entity leaks into the new one (config, toolbar filters,
    // expanded rows, display cap).
    useEffect(() => {
        setConfigOpen(false);
        setConfigLoaded(false);
        setConfigLoading(false);
        setConfigSeverity('debug');
        setConfigMaxEntries(100);
        setConfigSaving(false);
        setSeverity('debug');
        setContextDraft('');
        setContextFilter('');
        setMessageSearch('');
        setExpandedIds(new Set());
        setShowAllEntries(false);
    }, [entityId, entityType]);

    const trimmedSearch = messageSearch.trim().toLowerCase();
    const filteredEntries = trimmedSearch
        ? entries.filter((e) => e.message.toLowerCase().includes(trimmedSearch))
        : entries;

    const DISPLAY_CAP = 200;
    const [showAllEntries, setShowAllEntries] = useState(false);
    const displayedEntries =
        showAllEntries || filteredEntries.length <= DISPLAY_CAP
            ? filteredEntries
            : filteredEntries.slice(0, DISPLAY_CAP);
    const isCapped = !showAllEntries && filteredEntries.length > DISPLAY_CAP;

    const handleClear = useCallback(() => {
        setEntries([]);
        setIsCleared(true);
    }, []);

    const handleDownload = useCallback(() => {
        const payload = JSON.stringify(displayedEntries, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        // Replace `:` and `.` with `-` to keep the filename valid on Windows
        // NTFS and avoid browser-specific sanitization surprises.
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${entityType}-${entityId}-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [displayedEntries, entityType, entityId]);

    const configEntityRef = useRef({ entityId, entityType });
    configEntityRef.current = { entityId, entityType };

    const loadConfig = useCallback(async () => {
        setConfigLoading(true);
        const cfg = await getLogsConfiguration(entityType, entityId);
        // Guard: if the entity changed while the GET was in-flight, discard
        // the result so we don't apply config from the wrong entity.
        if (configEntityRef.current.entityId !== entityId || configEntityRef.current.entityType !== entityType) {
            return;
        }
        if (cfg) {
            setConfigSeverity(cfg.severity_filter);
            setConfigMaxEntries(cfg.max_entries);
            setConfigLoaded(true);
        }
        setConfigLoading(false);
    }, [getLogsConfiguration, entityType, entityId]);

    const toggleConfig = useCallback(async () => {
        const next = !configOpen;
        setConfigOpen(next);
        if (next && !configLoaded) {
            await loadConfig();
        }
    }, [configOpen, configLoaded, loadConfig]);

    const configValid = configMaxEntries >= 1 && configMaxEntries <= 10000;

    const handleConfigSave = useCallback(async () => {
        if (!configValid) return;
        setConfigSaving(true);
        const ok = await updateLogsConfiguration(entityType, entityId, {
            severity_filter: configSeverity,
            max_entries: configMaxEntries,
        });
        setConfigSaving(false);
        if (ok) {
            setConfigOpen(false);
            void doFetch();
        }
    }, [configValid, updateLogsConfiguration, entityType, entityId, configSeverity, configMaxEntries, doFetch]);

    const showContextFilter = entityType !== 'apps';

    const toolbar = (
        <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">Severity:</span>
                <select
                    aria-label="severity"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as LogSeverity)}
                >
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="error">error</option>
                    <option value="fatal">fatal</option>
                </select>
            </label>
            {showContextFilter && (
                <Input
                    type="text"
                    placeholder="Context filter"
                    value={contextDraft}
                    onChange={(e) => setContextDraft(e.target.value)}
                    className="h-8 w-40 text-xs"
                />
            )}
            <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search messages"
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    className="h-8 w-48 text-xs pl-7"
                />
            </div>
            <button
                type="button"
                onClick={() => void doFetch()}
                aria-label="Refresh"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent"
            >
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <label className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Auto-refresh</span>
                <Switch
                    checked={autoRefreshEnabled}
                    onCheckedChange={setAutoRefreshEnabled}
                    aria-label="Auto-refresh"
                />
            </label>
            <label className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">Interval:</span>
                <select
                    aria-label="Refresh interval"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={refreshIntervalMs}
                    onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                >
                    <option value="2000">2s</option>
                    <option value="5000">5s</option>
                    <option value="10000">10s</option>
                    <option value="30000">30s</option>
                </select>
            </label>
            {lastRefreshFailed && <span className="text-xs text-destructive">Last refresh failed</span>}
            <button
                type="button"
                onClick={handleClear}
                aria-label="Clear"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
                type="button"
                onClick={handleDownload}
                aria-label="Download"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                disabled={displayedEntries.length === 0}
            >
                <Download className="w-3.5 h-3.5" />
            </button>
            <button
                type="button"
                onClick={() => void toggleConfig()}
                aria-label="Settings"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent"
            >
                <Settings className="w-3.5 h-3.5" />
            </button>
        </div>
    );

    let body: React.JSX.Element;
    if (isLoading) {
        body = (
            <Card>
                <CardContent className="py-8 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading logs...</span>
                </CardContent>
            </Card>
        );
    } else if (errorStatus === 503 || errorStatus === 404) {
        const message =
            errorStatus === 503 ? 'Logs not available on this gateway' : 'Logs not available for this entity';
        body = (
            <Card>
                <CardContent className="py-8 text-center">
                    <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm text-muted-foreground">{message}</p>
                    <button
                        type="button"
                        onClick={() => void doFetch()}
                        className="mt-3 text-xs underline text-muted-foreground"
                    >
                        Retry
                    </button>
                </CardContent>
            </Card>
        );
    } else if (isCleared && entries.length === 0) {
        body = (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Cleared - next refresh will repopulate.
                </CardContent>
            </Card>
        );
    } else if (displayedEntries.length === 0) {
        body = (
            <Card>
                <CardContent className="py-8 text-center">
                    <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm text-muted-foreground">No log entries</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Try a lower severity filter or wait for new logs
                    </p>
                </CardContent>
            </Card>
        );
    } else {
        body = (
            <Card>
                <CardContent className="p-0">
                    {aggregation?.aggregation_level && (
                        <div
                            className="px-4 py-2 text-xs text-muted-foreground border-b"
                            title={aggregation.aggregation_sources?.join('\n')}
                        >
                            Aggregated from {aggregation.host_count ?? aggregation.aggregation_sources?.length ?? 0}{' '}
                            sources
                        </div>
                    )}
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs uppercase text-muted-foreground border-b sticky top-0 bg-card z-10">
                                <tr>
                                    <th className="text-left px-3 py-2 w-28">Time</th>
                                    <th className="text-left px-3 py-2 w-20">Severity</th>
                                    <th className="text-left px-3 py-2 w-48">Node</th>
                                    <th className="text-left px-3 py-2">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedEntries.map((entry) => {
                                    const isExpanded = expandedIds.has(entry.id);
                                    return (
                                        <Fragment key={entry.id}>
                                            <tr
                                                className="border-b hover:bg-accent/30 cursor-pointer focus:outline-none focus:bg-accent/40"
                                                onClick={() => toggleExpand(entry.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        toggleExpand(entry.id);
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                aria-expanded={isExpanded}
                                            >
                                                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                                                    {formatTime(entry.timestamp)}
                                                </td>
                                                <td className="px-3 py-1.5 text-xs uppercase">{entry.severity}</td>
                                                <td
                                                    className="px-3 py-1.5 font-mono text-xs truncate max-w-48"
                                                    title={entry.context.node}
                                                >
                                                    {entry.context.node}
                                                </td>
                                                <td className="px-3 py-1.5 text-xs truncate" title={entry.message}>
                                                    {entry.message}
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="border-b bg-muted/30">
                                                    <td colSpan={4} className="px-6 py-2 text-xs text-muted-foreground">
                                                        {entry.context.function || entry.context.file ? (
                                                            <div className="space-y-1">
                                                                {entry.context.function && (
                                                                    <div>
                                                                        Function:{' '}
                                                                        <span className="font-mono">
                                                                            {entry.context.function}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {entry.context.file && (
                                                                    <div>
                                                                        Location:{' '}
                                                                        <span className="font-mono">
                                                                            {entry.context.file}
                                                                            {entry.context.line
                                                                                ? `:${entry.context.line}`
                                                                                : ''}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    Full timestamp:{' '}
                                                                    <span className="font-mono">{entry.timestamp}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>No source location</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {isCapped && (
                            <div className="px-4 py-2 text-center border-t">
                                <button
                                    type="button"
                                    onClick={() => setShowAllEntries(true)}
                                    className="text-xs underline text-muted-foreground hover:text-foreground"
                                >
                                    Showing {DISPLAY_CAP} of {filteredEntries.length} entries - click to show all
                                </button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            {toolbar}
            {configOpen && (
                <div className="rounded-md border border-input bg-muted/30 p-3 flex items-center gap-3 flex-wrap">
                    {configLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading configuration...
                        </div>
                    ) : !configLoaded ? (
                        <div className="flex items-center gap-3 text-xs">
                            <span className="text-destructive">Failed to load configuration.</span>
                            <button
                                type="button"
                                onClick={() => void loadConfig()}
                                className="underline text-muted-foreground hover:text-foreground"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            <label className="flex items-center gap-1 text-xs">
                                <span className="text-muted-foreground">Saved severity:</span>
                                <select
                                    aria-label="saved severity"
                                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                    value={configSeverity}
                                    onChange={(e) => setConfigSeverity(e.target.value as LogSeverity)}
                                >
                                    <option value="debug">debug</option>
                                    <option value="info">info</option>
                                    <option value="warning">warning</option>
                                    <option value="error">error</option>
                                    <option value="fatal">fatal</option>
                                </select>
                            </label>
                            <label className="flex items-center gap-1 text-xs">
                                <span className="text-muted-foreground">Max entries:</span>
                                <Input
                                    type="number"
                                    aria-label="max entries"
                                    className="h-8 w-24 text-xs"
                                    value={configMaxEntries}
                                    onChange={(e) => setConfigMaxEntries(Number(e.target.value))}
                                    min={1}
                                    max={10000}
                                />
                            </label>
                            <Button
                                size="sm"
                                onClick={() => void handleConfigSave()}
                                disabled={!configValid || configSaving || !configLoaded}
                            >
                                Save
                            </Button>
                            {!configValid && (
                                <span className="text-xs text-destructive">max_entries must be 1..10000</span>
                            )}
                        </>
                    )}
                </div>
            )}
            {body}
        </div>
    );
}

/**
 * Format an ISO 8601 timestamp as `HH:MM:SS.sss` (UTC).
 *
 * Gateway timestamps have nanosecond precision (e.g. `...56.789000000Z`).
 * `new Date()` parsing of sub-millisecond fractional seconds is unreliable
 * across JS engines, so we first normalize by truncating fractional seconds
 * to 3 digits. On any parsing failure we return `--:--:--.---` instead of
 * the raw ISO string, which would overflow the fixed-width Time column.
 */
function formatTime(isoTimestamp: string): string {
    const normalized = isoTimestamp.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:?\d{2})/, '$1$2');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '--:--:--.---';
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}
