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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUpdatesPolling } from './useUpdatesPolling';
import type { UpdateStatus } from '@/lib/types';

vi.mock('@/lib/updates-api', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/updates-api')>();
    return {
        ...original,
        fetchUpdateIds: vi.fn(),
        fetchUpdateStatus: vi.fn(),
    };
});

const { fetchUpdateIds, fetchUpdateStatus, UpdatesApiError } = await import('@/lib/updates-api');
const mockFetchUpdateIds = vi.mocked(fetchUpdateIds);
const mockFetchUpdateStatus = vi.mocked(fetchUpdateStatus);

const BASE_URL = 'http://localhost:8080/api/v1';
const DEFAULT_INTERVAL = 2000;

const STATUS_PENDING: UpdateStatus = { status: 'pending' };
const STATUS_IN_PROGRESS: UpdateStatus = { status: 'inProgress', progress: 42 };

describe('useUpdatesPolling', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockFetchUpdateIds.mockReset();
        mockFetchUpdateStatus.mockReset();
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    // 1. Fetches update IDs and statuses on mount
    it('fetches update IDs and statuses on mount', async () => {
        mockFetchUpdateIds.mockResolvedValue(['update-1', 'update-2']);
        mockFetchUpdateStatus.mockImplementation((_baseUrl, id) =>
            Promise.resolve(id === 'update-1' ? STATUS_PENDING : STATUS_IN_PROGRESS)
        );

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.updates).toHaveLength(2);
        expect(result.current.updates[0]).toEqual({ id: 'update-1', status: STATUS_PENDING });
        expect(result.current.updates[1]).toEqual({ id: 'update-2', status: STATUS_IN_PROGRESS });
        expect(result.current.error).toBeNull();
        expect(result.current.notAvailable).toBe(false);
    });

    // 2. Returns empty updates when no IDs
    it('returns empty updates when no IDs', async () => {
        mockFetchUpdateIds.mockResolvedValue([]);

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.updates).toHaveLength(0);
        expect(result.current.error).toBeNull();
        expect(result.current.notAvailable).toBe(false);
    });

    // 3. Polls at interval
    it('polls at interval', async () => {
        mockFetchUpdateIds.mockResolvedValue(['update-1']);
        mockFetchUpdateStatus.mockResolvedValue(STATUS_PENDING);

        renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL);
        });

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(2);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL);
        });

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(3);
        });
    });

    // 4. Does not fetch when baseUrl is null
    it('does not fetch when baseUrl is null', async () => {
        const { result } = renderHook(() => useUpdatesPolling(null, DEFAULT_INTERVAL));

        // Give time for any potential spurious calls
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL * 2);
        });

        expect(mockFetchUpdateIds).not.toHaveBeenCalled();
        expect(mockFetchUpdateStatus).not.toHaveBeenCalled();
        expect(result.current.updates).toHaveLength(0);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.notAvailable).toBe(false);
    });

    // 5. Sets notAvailable on 501
    it('sets notAvailable on 501 (UpdatesApiError)', async () => {
        mockFetchUpdateIds.mockRejectedValue(new UpdatesApiError('Not implemented', 501));

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(result.current.notAvailable).toBe(true);
        });

        expect(result.current.updates).toHaveLength(0);
        expect(result.current.isLoading).toBe(false);
    });

    // 6. Swallows non-501 fetch errors, recovers on next poll
    it('swallows non-501 fetch errors, recovers on next poll', async () => {
        mockFetchUpdateIds.mockRejectedValueOnce(new Error('Network error')).mockResolvedValue(['update-1']);
        mockFetchUpdateStatus.mockResolvedValue(STATUS_PENDING);

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        // First poll fails
        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });
        expect(result.current.notAvailable).toBe(false);
        expect(result.current.updates).toHaveLength(0);

        // Next poll succeeds - error clears and updates appear
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL);
        });

        await waitFor(() => {
            expect(result.current.updates).toHaveLength(1);
        });
        expect(result.current.error).toBeNull();
    });

    // 7. Pauses polling when tab is hidden, resumes + fetches when visible
    it('pauses polling when tab is hidden, resumes and fetches when visible', async () => {
        mockFetchUpdateIds.mockResolvedValue([]);

        renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);
        });

        // Hide the tab
        await act(async () => {
            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        // Advance past several intervals - should not poll
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL * 3);
        });

        expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);

        // Show the tab again
        await act(async () => {
            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        // Should fetch immediately on becoming visible
        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(2);
        });

        // And resume interval polling
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL);
        });

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(3);
        });
    });

    // 8. Cleans up on unmount (no additional calls after)
    it('cleans up on unmount - no more calls after unmount', async () => {
        mockFetchUpdateIds.mockResolvedValue([]);

        const { unmount } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);
        });

        unmount();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL * 3);
        });

        // Only the initial call - no more after unmount
        expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);
    });

    // 9. refresh() triggers immediate fetch
    it('refresh() triggers immediate fetch', async () => {
        mockFetchUpdateIds.mockResolvedValue(['update-1']);
        mockFetchUpdateStatus.mockResolvedValue(STATUS_PENDING);

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(1);
        });

        // Call refresh before next interval
        await act(async () => {
            result.current.refresh();
        });

        await waitFor(() => {
            expect(mockFetchUpdateIds).toHaveBeenCalledTimes(2);
        });
    });

    // 10. Handles individual status fetch failures gracefully (null status for that entry)
    it('handles individual status fetch failures gracefully with null status', async () => {
        mockFetchUpdateIds.mockResolvedValue(['update-ok', 'update-fail', 'update-ok-2']);
        mockFetchUpdateStatus.mockImplementation((_baseUrl, id) => {
            if (id === 'update-fail') {
                return Promise.reject(new Error('Status fetch failed'));
            }
            return Promise.resolve(STATUS_PENDING);
        });

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.updates).toHaveLength(3);

        const okEntry = result.current.updates.find((u) => u.id === 'update-ok');
        const failEntry = result.current.updates.find((u) => u.id === 'update-fail');
        const ok2Entry = result.current.updates.find((u) => u.id === 'update-ok-2');

        expect(okEntry?.status).toEqual(STATUS_PENDING);
        expect(failEntry?.status).toBeNull();
        expect(ok2Entry?.status).toEqual(STATUS_PENDING);
    });

    // isLoading: true only on initial fetch when no existing updates
    it('shows isLoading true only on initial fetch, not on subsequent polls', async () => {
        let resolveFirst: (ids: string[]) => void = () => {};
        mockFetchUpdateIds.mockReturnValueOnce(
            new Promise<string[]>((resolve) => {
                resolveFirst = resolve;
            })
        );
        mockFetchUpdateIds.mockResolvedValue(['update-1']);
        mockFetchUpdateStatus.mockResolvedValue(STATUS_PENDING);

        const { result } = renderHook(() => useUpdatesPolling(BASE_URL, DEFAULT_INTERVAL));

        // Initial load: isLoading should be true
        expect(result.current.isLoading).toBe(true);

        resolveFirst(['update-1']);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        expect(result.current.updates).toHaveLength(1);

        // Subsequent poll: isLoading should stay false
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL);
        });

        // isLoading must not flip back to true during poll
        expect(result.current.isLoading).toBe(false);
    });
});
