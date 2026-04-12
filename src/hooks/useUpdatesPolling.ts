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

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUpdateIds, fetchUpdateStatus, UpdatesApiError } from '@/lib/updates-api';
import type { UpdateEntry } from '@/lib/types';

export interface UseUpdatesPollingResult {
    updates: UpdateEntry[];
    isLoading: boolean;
    error: string | null;
    notAvailable: boolean;
    refresh: () => void;
    effectiveInterval: number;
}

const IDLE_INTERVAL_MS = 5000;
const ACTIVE_INTERVAL_MS = 2000;

export function useUpdatesPolling(baseUrl: string | null, intervalMs?: number): UseUpdatesPollingResult {
    const [updates, setUpdates] = useState<UpdateEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notAvailable, setNotAvailable] = useState(false);
    const [isVisible, setIsVisible] = useState(
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    );

    // Tracks whether we have ever successfully loaded data (for isLoading semantics)
    const hasLoadedRef = useRef(false);
    // AbortController for in-flight fetches
    const abortRef = useRef<AbortController | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);

    const doFetch = useCallback(
        async (isInitial: boolean) => {
            if (!baseUrl) return;

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            if (isInitial && !hasLoadedRef.current) {
                setIsLoading(true);
            }

            try {
                const ids = await fetchUpdateIds(baseUrl, controller.signal);

                if (controller.signal.aborted) return;

                // Fetch status for each ID individually; failures yield null status
                const entries: UpdateEntry[] = await Promise.all(
                    ids.map(async (id) => {
                        try {
                            const status = await fetchUpdateStatus(baseUrl, id, controller.signal);
                            return { id, status };
                        } catch {
                            return { id, status: null };
                        }
                    })
                );

                if (controller.signal.aborted) return;

                setUpdates(entries);
                setError(null);
                setNotAvailable(false);
                hasLoadedRef.current = true;
            } catch (err) {
                if ((err as { name?: string }).name === 'AbortError') return;

                if (err instanceof UpdatesApiError && err.status === 501) {
                    setNotAvailable(true);
                    setUpdates([]);
                } else {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        },
        [baseUrl]
    );

    // Listen for visibility changes
    useEffect(() => {
        const onVisibilityChange = () => {
            setIsVisible(document.visibilityState === 'visible');
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    // Fetch on becoming visible (after being hidden), on refreshTick, and on baseUrl change
    useEffect(() => {
        if (!baseUrl) return;
        if (!isVisible) return;

        const isInitial = !hasLoadedRef.current;
        void doFetch(isInitial);

        return () => {
            abortRef.current?.abort();
        };
    }, [baseUrl, isVisible, refreshTick, doFetch]);

    // Adaptive polling: 2s when any update is active, 5s otherwise
    const hasActiveUpdate = updates.some((u) => u.status?.status === 'inProgress' || u.status?.status === 'pending');
    const effectiveInterval = intervalMs ?? (hasActiveUpdate ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);

    // Interval polling (only when visible and baseUrl is set)
    useEffect(() => {
        if (!baseUrl || !isVisible) return;

        const id = setInterval(() => {
            void doFetch(false);
        }, effectiveInterval);

        return () => clearInterval(id);
    }, [baseUrl, isVisible, effectiveInterval, doFetch]);

    // Reset state when baseUrl changes to null
    useEffect(() => {
        if (!baseUrl) {
            hasLoadedRef.current = false;
            setUpdates([]);
            setError(null);
            setNotAvailable(false);
            setIsLoading(false);
        }
    }, [baseUrl]);

    const refresh = useCallback(() => {
        setRefreshTick((t) => t + 1);
    }, []);

    return { updates, isLoading, error, notAvailable, refresh, effectiveInterval };
}
