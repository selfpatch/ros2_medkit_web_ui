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

import { useEffect } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAppStore } from '@/lib/store';

/** Refresh cadence while the SSE fault stream is not carrying updates. */
export const FAULT_POLL_INTERVAL_MS = 5000;

/**
 * Refresh cadence while the stream is up. A stream that is connected is not proof that
 * anything comes down it - an aggregating gateway answers the subscription and then
 * fans nothing out - and from the browser that looks exactly like a quiet system. This
 * is the slow check that keeps the page from sitting unchanged for a whole session.
 */
export const FAULT_STREAM_SAFETY_NET_MS = 30000;

// The fault list is one shared resource with several views on it (the dashboard,
// the sidebar badge). These module-level counters keep one timer and one initial
// fetch for all of them, so mounting a second view costs no extra request.
let subscribers = 0;
let pollers = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentPeriod: number | null = null;
let visibilityListener: (() => void) | null = null;

function isTabVisible(): boolean {
    return typeof document === 'undefined' || !document.hidden;
}

function refreshFaults(): void {
    void useAppStore.getState().fetchFaults();
}

function refreshIfVisible(): void {
    if (isTabVisible()) {
        refreshFaults();
    }
}

/**
 * A refresh the tab's return triggered also starts the wait again: the timer was part
 * way through its period, and leaving it be puts a second request moments behind this one.
 */
function refreshAndRestartTimer(): void {
    if (!isTabVisible() || !useAppStore.getState().faultsAutoRefresh) return;
    refreshFaults();
    if (intervalId !== null) {
        stopInterval();
        syncInterval();
    }
}

/** Starts, stops or re-paces the shared timer to match the views and the stream state. */
function syncInterval(): void {
    const { faultStreamCleanup, faultsAutoRefresh } = useAppStore.getState();
    const streamActive = faultStreamCleanup !== null;
    // Switched off stops it for everyone: the list is shared, so "off" that still let
    // another view pull new rows in would not be off at all.
    const shouldRun = pollers > 0 && faultsAutoRefresh;
    const period = streamActive ? FAULT_STREAM_SAFETY_NET_MS : FAULT_POLL_INTERVAL_MS;

    if (shouldRun && period !== currentPeriod) {
        stopInterval();
    }
    if (shouldRun && intervalId === null) {
        currentPeriod = period;
        intervalId = setInterval(refreshIfVisible, period);
    } else if (!shouldRun) {
        stopInterval();
    }
}

function stopInterval(): void {
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        currentPeriod = null;
    }
}

/**
 * Keeps the shared fault list fresh for as long as at least one view is mounted.
 *
 * The list refreshes on mount, when the tab regains focus, and - only while the
 * SSE fault stream is inactive - on a timer. All of it is shared: two mounted
 * views produce one request per refresh, not two.
 */
export function useFaultPolling(): void {
    const { isConnected, client, hasFaultStream, autoRefresh } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            client: state.client,
            hasFaultStream: state.faultStreamCleanup !== null,
            autoRefresh: state.faultsAutoRefresh,
        }))
    );

    useEffect(() => {
        if (!isConnected) return;

        // Every view reads when it opens, not only the first one: the sidebar badge is
        // mounted for the whole session, so the dashboard is always a later subscriber
        // and would otherwise show the list as it stood when the session began. Views
        // opening together still cost one request - the store reuses the one in flight.
        // Re-runs when the connection is replaced (a new gateway has its own faults) and
        // when the fault stream appears or dies, which is when events may have been missed.
        subscribers += 1;
        if (subscribers === 1) {
            visibilityListener = refreshAndRestartTimer;
            document.addEventListener('visibilitychange', visibilityListener);
        }
        refreshFaults();

        return () => {
            subscribers -= 1;
            if (subscribers === 0 && visibilityListener) {
                document.removeEventListener('visibilitychange', visibilityListener);
                visibilityListener = null;
            }
        };
    }, [isConnected, client, hasFaultStream]);

    useEffect(() => {
        if (!isConnected) return;

        pollers += 1;
        syncInterval();

        return () => {
            pollers -= 1;
            syncInterval();
        };
        // syncInterval reads the stream state and the switch from the store; these deps
        // are what make it look again when either of them changes.
    }, [isConnected, hasFaultStream, autoRefresh]);
}
