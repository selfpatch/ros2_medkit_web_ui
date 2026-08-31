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

/** Fallback refresh cadence used when the SSE fault stream is not delivering updates. */
export const FAULT_POLL_INTERVAL_MS = 5000;

// The fault list is one shared resource with several views on it (the dashboard,
// the sidebar badge). These module-level counters keep one timer and one initial
// fetch for all of them, so mounting a second view costs no extra request.
let subscribers = 0;
let pollers = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
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

/** Starts or stops the shared timer to match the current subscribers and stream state. */
function syncInterval(): void {
    const streamActive = useAppStore.getState().faultStreamCleanup !== null;
    const shouldRun = pollers > 0 && !streamActive;

    if (shouldRun && intervalId === null) {
        intervalId = setInterval(refreshIfVisible, FAULT_POLL_INTERVAL_MS);
    } else if (!shouldRun && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

export interface UseFaultPollingOptions {
    /** Whether this view wants the fallback timer. The shared initial fetch happens either way. */
    poll?: boolean;
}

/**
 * Keeps the shared fault list fresh for as long as at least one view is mounted.
 *
 * The list refreshes on mount, when the tab regains focus, and - only while the
 * SSE fault stream is inactive - on a timer. All of it is shared: two mounted
 * views produce one request per refresh, not two.
 */
export function useFaultPolling(options: UseFaultPollingOptions = {}): void {
    const poll = options.poll ?? true;
    const { isConnected, hasFaultStream } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            hasFaultStream: state.faultStreamCleanup !== null,
        }))
    );

    useEffect(() => {
        if (!isConnected) return;

        subscribers += 1;
        if (subscribers === 1) {
            visibilityListener = refreshIfVisible;
            document.addEventListener('visibilitychange', visibilityListener);
            refreshFaults();
        }

        return () => {
            subscribers -= 1;
            if (subscribers === 0 && visibilityListener) {
                document.removeEventListener('visibilitychange', visibilityListener);
                visibilityListener = null;
            }
        };
    }, [isConnected]);

    useEffect(() => {
        if (!isConnected || !poll) return;

        pollers += 1;
        syncInterval();

        return () => {
            pollers -= 1;
            syncInterval();
        };
        // hasFaultStream is not read here - syncInterval reads it from the store - but the
        // timer must be re-evaluated when the stream appears or dies.
    }, [isConnected, poll, hasFaultStream]);
}
