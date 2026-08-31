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

/**
 * What the shared fault list is allowed to do while it refreshes. The list has
 * two writers - polling and the SSE stream - and a refresh can outlive the
 * connection that started it, so a late answer must not decide what is on screen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore, FAULTS_REQUEST_TIMEOUT_MS } from './store';
import type { Fault } from './types';

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function raw(overrides: Record<string, unknown> = {}) {
    return {
        fault_code: 'LIDAR_RANGE_INVALID',
        description: 'range invalid',
        severity: 2,
        severity_label: 'ERROR',
        status: 'CONFIRMED',
        first_occurred: 1756636800,
        last_occurred: 1756636800,
        occurrence_count: 1,
        reporting_sources: ['/lidar_front'],
        ...overrides,
    };
}

/** A client whose answers are under the test's control, however many are in flight. */
function deferredClient() {
    const pending: ((items: unknown[]) => void)[] = [];
    const GET = vi.fn(
        () =>
            new Promise((resolve) => {
                pending.push((items: unknown[]) => resolve({ data: { items }, error: undefined }));
            })
    );
    return {
        client: { GET },
        release: (items: unknown[]) => {
            while (pending.length > 0) {
                pending.shift()!(items);
            }
        },
    };
}

function clientReturning(items: unknown[]) {
    return { GET: vi.fn(async () => ({ data: { items }, error: undefined })) };
}

function connected(client: unknown) {
    useAppStore.setState({
        isConnected: true,
        client,
        faults: [],
        faultsLoaded: false,
        isLoadingFaults: false,
        faultStreamCleanup: null,
    } as never);
}

beforeEach(() => {
    connected(null);
});

afterEach(() => {
    useAppStore.setState({ isConnected: false, client: null, faults: [] } as never);
});

describe('subscribeFaultStream', () => {
    it('hands refreshing back to polling when the stream closes without an error', async () => {
        const streamClient = {
            GET: vi.fn(async () => ({ data: { items: [] }, error: undefined })),
            streams: {
                faults: () => ({
                    close: vi.fn(),
                    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
                }),
            },
        };
        connected(streamClient);

        useAppStore.getState().subscribeFaultStream();
        expect(useAppStore.getState().faultStreamCleanup).not.toBeNull();

        await vi.waitFor(() => expect(useAppStore.getState().faultStreamCleanup).toBeNull());
    });
});

describe('fetchFaults change detection', () => {
    it('takes up a fault that is now reported by a different entity', async () => {
        connected(clientReturning([raw()]));
        await useAppStore.getState().fetchFaults();

        useAppStore.setState({ client: clientReturning([raw({ reporting_sources: ['/lidar_rear'] })]) } as never);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults[0]?.entity_id).toBe('lidar_rear');
    });

    it('takes up a changed fault description', async () => {
        connected(clientReturning([raw()]));
        await useAppStore.getState().fetchFaults();

        useAppStore.setState({ client: clientReturning([raw({ description: '3 sectors blind' })]) } as never);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults[0]?.message).toBe('3 sectors blind');
    });
});

describe('fetchFaults error reporting', () => {
    it('records why the gateway could not answer, instead of an empty list', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const refusing = {
            GET: vi.fn(async () => ({
                data: undefined,
                error: {
                    error_code: 'service-unavailable',
                    message: 'Failed to get faults',
                    parameters: { details: 'ListFaults service not available' },
                },
            })),
        };
        connected(refusing);

        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faultsError).toBe('Failed to get faults: ListFaults service not available');
        expect(useAppStore.getState().faults).toEqual([]);
        logged.mockRestore();
    });

    it('clears the error once the gateway answers again', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        connected({ GET: vi.fn(async () => ({ data: undefined, error: { message: 'Failed to get faults' } })) });
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faultsError).not.toBeNull();

        useAppStore.setState({ client: clientReturning([raw()]) } as never);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faultsError).toBeNull();
        logged.mockRestore();
    });
});

describe('fetchFaults against a moving connection', () => {
    it('ignores an answer that arrives after the session was disconnected', async () => {
        const { client, release } = deferredClient();
        connected(client);

        const pending = useAppStore.getState().fetchFaults();
        useAppStore.getState().disconnect();
        release([raw({ fault_code: 'FROM_PREVIOUS_GATEWAY' })]);
        await pending;

        expect(useAppStore.getState().faults).toHaveLength(0);
        expect(useAppStore.getState().faultsLoaded).toBe(false);
    });

    it('ignores an answer that the fault stream has already overtaken', async () => {
        const { client, release } = deferredClient();
        connected(client);

        const pending = useAppStore.getState().fetchFaults();
        const fromStream: Fault = {
            code: 'STREAM_FAULT',
            message: 'reported over the stream',
            severity: 'error',
            status: 'active',
            timestamp: '2026-08-31T10:00:00.000Z',
            entity_id: 'lidar_front',
            entity_type: 'app',
        };
        useAppStore.setState({ faults: [fromStream] } as never);
        release([raw({ fault_code: 'FROM_THE_POLL' })]);
        await pending;

        expect(useAppStore.getState().faults.map((f) => f.code)).toEqual(['STREAM_FAULT']);
        expect(useAppStore.getState().faultsLoaded).toBe(true);
    });

    it('runs one request when several views ask for a refresh at the same time', async () => {
        const { client, release } = deferredClient();
        connected(client);

        const first = useAppStore.getState().fetchFaults();
        const second = useAppStore.getState().fetchFaults();
        release([raw()]);
        await Promise.all([first, second]);

        expect(client.GET).toHaveBeenCalledTimes(1);
    });

    it('is not wedged by a request that never answers', async () => {
        const hung = { GET: vi.fn(() => new Promise(() => {})) };
        connected(hung);
        void useAppStore.getState().fetchFaults();

        useAppStore.getState().disconnect();
        const healthy = clientReturning([raw()]);
        connected(healthy);
        await useAppStore.getState().fetchFaults();

        expect(healthy.GET).toHaveBeenCalledTimes(1);
        expect(useAppStore.getState().faults).toHaveLength(1);
    });

    it('gives up on a request the gateway never answers', async () => {
        // The abort is the behaviour under test, so its own log line is not a surprise.
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
        try {
            const hung = {
                GET: vi.fn((_path: string, init: { signal?: AbortSignal }) => {
                    return new Promise((_resolve, reject) => {
                        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                    });
                }),
            };
            connected(hung);
            const first = useAppStore.getState().fetchFaults();
            await vi.advanceTimersByTimeAsync(FAULTS_REQUEST_TIMEOUT_MS + 100);
            await first;

            const healthy = clientReturning([raw()]);
            useAppStore.setState({ client: healthy } as never);
            await useAppStore.getState().fetchFaults();

            expect(healthy.GET).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
            logged.mockRestore();
        }
    });

    it('lets a forced refresh through so a cleared fault is not read back from an older answer', async () => {
        const { client, release } = deferredClient();
        connected(client);

        const polling = useAppStore.getState().fetchFaults();
        const forced = useAppStore.getState().fetchFaults({ force: true });
        release([]);
        await Promise.all([polling, forced]);

        expect(client.GET).toHaveBeenCalledTimes(2);
    });
});
