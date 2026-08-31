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
import { useAppStore } from './store';
import type { Fault } from './types';
import { transformFault } from './transforms';

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

describe('a fault stream event while a read has failed', () => {
    function withFailedRead(client: unknown) {
        connected(client);
        useAppStore.setState({
            faultsError: 'Failed to get faults: ListFaults service not available',
            faultsLoaded: true,
        } as never);
    }

    const streamed: Fault = {
        code: 'LIDAR_RANGE_INVALID',
        message: 'range invalid',
        severity: 'error',
        status: 'active',
        timestamp: '2026-08-31T10:00:00.000Z',
        entity_id: 'lidar_front',
        entity_type: 'app',
    };

    it('takes the event as proof the gateway answers, and reads the list again', async () => {
        const client = clientReturning([raw()]);
        withFailedRead(client);

        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', streamed);
        await vi.waitFor(() => expect(client.GET).toHaveBeenCalledTimes(1));

        // Cleared because a read succeeded, not because an event arrived.
        expect(useAppStore.getState().faultsError).toBeNull();
    });

    it('asks once for a burst of events, not once per event', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const refusing = {
            GET: vi.fn(async () => ({ data: undefined, error: { message: 'Failed to get faults' } })),
        };
        connected(refusing);
        // The same failure the gateway keeps giving: a burst of events under one unchanged
        // reason buys one attempt. A different reason is a change, and buys its own.
        useAppStore.setState({ faultsError: 'Failed to get faults', faultsLoaded: true } as never);

        for (let i = 0; i < 5; i++) {
            useAppStore.getState().applyFaultStreamEvent('fault_confirmed', { ...streamed, code: `FAULT_${i}` });
            await Promise.resolve();
            await Promise.resolve();
        }

        // The timer is what retries a failing gateway. An event only buys the first try.
        expect(refusing.GET).toHaveBeenCalledTimes(1);
        logged.mockRestore();
    });

    it('leaves a paused list alone, event or no event', async () => {
        const client = clientReturning([raw()]);
        withFailedRead(client);
        useAppStore.setState({ faultsAutoRefresh: false } as never);

        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', streamed);
        await Promise.resolve();
        await Promise.resolve();

        expect(client.GET).not.toHaveBeenCalled();
        expect(useAppStore.getState().faultsError).not.toBeNull();
    });

    it('does not read again for an event when nothing had failed', async () => {
        const client = clientReturning([raw()]);
        connected(client);

        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', streamed);
        await Promise.resolve();
        await Promise.resolve();

        expect(client.GET).not.toHaveBeenCalled();
    });

    it('keeps one fault one row when the gateway names the entity type in neither channel', () => {
        // Both channels run through transformFault, which calls an unnamed entity type an
        // app. The list is keyed on that type, so the two channels have to agree about it:
        // a gateway that starts sending it in one and not the other would split one fault
        // into two rows, each with its own clear button.
        connected(clientReturning([]));
        const fromList = transformFault({
            fault_code: 'LIDAR_RANGE_INVALID',
            description: 'range invalid',
            severity: 2,
            severity_label: 'ERROR',
            status: 'CONFIRMED',
            first_occurred: 1756636800,
            reporting_sources: ['/lidar_front'],
        });
        useAppStore.setState({ faults: [fromList] } as never);

        useAppStore.getState().applyFaultStreamEvent('fault_cleared', { ...fromList, status: 'cleared' });

        expect(useAppStore.getState().faults).toHaveLength(0);
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

    it('lets the newest read decide, not the one that happens to finish last', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        // One connection, two reads: the first is slow and fails, the second is the
        // one the user asked for and succeeds.
        let call = 0;
        const client = {
            GET: vi.fn(() => {
                call += 1;
                return call === 1
                    ? new Promise((resolve) => {
                          setTimeout(
                              () => resolve({ data: undefined, error: { message: 'Failed to get faults' } }),
                              50
                          );
                      })
                    : Promise.resolve({ data: { items: [raw()] }, error: undefined });
            }),
        };
        connected(client);
        const stale = useAppStore.getState().fetchFaults();

        await useAppStore.getState().fetchFaults({ force: true });
        expect(useAppStore.getState().faultsError).toBeNull();

        await stale;

        expect(useAppStore.getState().faultsError).toBeNull();
        expect(useAppStore.getState().faults).toHaveLength(1);
        logged.mockRestore();
    });

    it('reports a failure the user asked for even while a later read is still out', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        let call = 0;
        const client = {
            GET: vi.fn(() => {
                call += 1;
                // 1: the refresh the user pressed, fails. 2: a background read, never answers.
                return call === 1
                    ? Promise.resolve({ data: undefined, error: { message: 'Failed to get faults' } })
                    : new Promise(() => {});
            }),
        };
        connected(client);

        const forced = useAppStore.getState().fetchFaults({ force: true });
        void useAppStore.getState().fetchFaults();
        await forced;

        expect(useAppStore.getState().faultsError).toBe('Failed to get faults');
        logged.mockRestore();
    });

    it('clears a fault the stream reports under a different entity type only once', async () => {
        connected(clientReturning([]));
        useAppStore.setState({
            faults: [
                {
                    code: 'OVERHEAT',
                    message: 'app fault',
                    severity: 'error',
                    status: 'active',
                    timestamp: '2026-08-31T10:00:00.000Z',
                    entity_id: 'motor',
                    entity_type: 'app',
                },
                {
                    code: 'OVERHEAT',
                    message: 'component fault',
                    severity: 'error',
                    status: 'active',
                    timestamp: '2026-08-31T10:00:00.000Z',
                    entity_id: 'motor',
                    entity_type: 'component',
                },
            ],
        } as never);

        useAppStore.getState().applyFaultStreamEvent('fault_cleared', {
            code: 'OVERHEAT',
            message: 'component fault',
            severity: 'error',
            status: 'cleared',
            timestamp: '2026-08-31T10:00:00.000Z',
            entity_id: 'motor',
            entity_type: 'component',
        });

        expect(useAppStore.getState().faults.map((f) => f.entity_type)).toEqual(['app']);
    });

    it('says the gateway went quiet when the request is aborted', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const abandoning = {
            GET: vi.fn(async () => {
                // What the generated client does when its own deadline runs out.
                throw new DOMException('The operation was aborted.', 'AbortError');
            }),
        };
        connected(abandoning);

        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faultsError).toBe('The gateway did not answer in time');

        // And the shared refresh is free again, so the next read is not swallowed.
        const healthy = clientReturning([raw()]);
        useAppStore.setState({ client: healthy } as never);
        await useAppStore.getState().fetchFaults();
        expect(healthy.GET).toHaveBeenCalledTimes(1);
        logged.mockRestore();
    });

    it('re-reads the list when clearing a fault failed, so no ghost row is left', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        const client = {
            GET: vi.fn(async () => ({ data: { items: [] }, error: undefined })),
            DELETE: vi.fn(async () => ({ data: undefined, error: { message: 'fault already cleared' } })),
        };
        connected(client);

        await useAppStore.getState().clearFault('apps', 'lidar_front', 'LIDAR_RANGE_INVALID');

        expect(client.GET).toHaveBeenCalledTimes(1);
        logged.mockRestore();
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
