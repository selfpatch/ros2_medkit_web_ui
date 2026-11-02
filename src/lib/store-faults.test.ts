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
import {
    useAppStore,
    FAULT_APPS_REREAD_MS,
    FAULT_APPS_RETRY_MS,
    __resetAppsRequestCache,
    __resetFaultAppsIndex,
} from './store';
import type { Fault } from './types';
import { transformFault, type RawFaultItem } from './transforms';

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

/**
 * Reads of the fault list. The store also reads `GET /apps` to learn which app each
 * fault's node runs as; those reads are left out.
 */
function faultReads(client: { GET: { mock: { calls: unknown[][] } } }): number {
    return client.GET.mock.calls.filter((args) => args[0] !== '/apps').length;
}

/**
 * A client whose fault list answers are under the test's control, however many are in
 * flight. Its app list answers at once, with no app owning these faults' nodes.
 */
function deferredClient() {
    const pending: ((items: unknown[]) => void)[] = [];
    const GET = vi.fn((path: string) =>
        path === '/apps'
            ? Promise.resolve({ data: { items: [] }, error: undefined })
            : new Promise((resolve) => {
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
    __resetAppsRequestCache();
    __resetFaultAppsIndex();
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
        await vi.waitFor(() => expect(faultReads(client)).toBe(1));

        // Cleared because a read succeeded, not because an event arrived.
        await vi.waitFor(() => expect(useAppStore.getState().faultsError).toBeNull());
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

    it('ignores a refresh the fault stream has already overtaken', async () => {
        const { client, release } = deferredClient();
        connected(client);
        useAppStore.setState({ faultsLoaded: true } as never);

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

    it('does not lose the faults that were there before the stream, on the first read', async () => {
        // The stream carries what happens next, not what is already raised. Dropping the
        // first read because an event landed during it hides every fault that predates
        // the subscription until something reads again.
        let call = 0;
        const client = {
            GET: vi.fn(() => {
                call += 1;
                return call === 1
                    ? new Promise((resolve) => {
                          setTimeout(() => resolve({ data: { items: [raw()] }, error: undefined }), 20);
                      })
                    : Promise.resolve({ data: { items: [raw()] }, error: undefined });
            }),
        };
        connected(client);

        const first = useAppStore.getState().fetchFaults();
        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', {
            code: 'RAISED_WHILE_READING',
            message: 'arrived over the stream',
            severity: 'error',
            status: 'active',
            timestamp: '2026-08-31T10:00:00.000Z',
            entity_id: 'lidar_front',
            entity_type: 'app',
        });
        await first;

        await vi.waitFor(() => {
            expect(useAppStore.getState().faults.map((f) => f.code)).toContain('LIDAR_RANGE_INVALID');
        });
    });

    it('runs one request when several views ask for a refresh at the same time', async () => {
        const { client, release } = deferredClient();
        connected(client);

        const first = useAppStore.getState().fetchFaults();
        const second = useAppStore.getState().fetchFaults();
        release([raw()]);
        await Promise.all([first, second]);

        expect(faultReads(client)).toBe(1);
    });

    it('is not wedged by a request that never answers', async () => {
        const hung = { GET: vi.fn(() => new Promise(() => {})) };
        connected(hung);
        void useAppStore.getState().fetchFaults();

        useAppStore.getState().disconnect();
        const healthy = clientReturning([raw()]);
        connected(healthy);
        await useAppStore.getState().fetchFaults();

        expect(faultReads(healthy)).toBe(1);
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
        expect(faultReads(healthy)).toBe(1);
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

describe('placing faults on the apps the gateway lists', () => {
    // A manifest gateway names apps apart from the nodes they run as. Asked for a fault
    // under the node's name, it answers 404 - so no snapshots, and a clear that misses.
    const LANE_BLOCKED = raw({ fault_code: 'LANE_BLOCKED', reporting_sources: ['/lane_navigator'] });
    const LANE_NAVIGATOR = {
        id: 'lane-navigator',
        'x-medkit': { ros2: { node: '/lane_navigator' }, component_id: 'amr-07', is_online: true },
    };

    /** Answers `GET /apps` with `apps.list` and every fault read with `faults.list`. */
    function manifestGateway(faults: { list: unknown[] }, apps: { list: unknown[] }) {
        return {
            GET: vi.fn(async (path: string) => ({
                data: { items: path === '/apps' ? apps.list : faults.list },
                error: undefined,
            })),
        };
    }

    function appReads(client: { GET: { mock: { calls: unknown[][] } } }): number {
        return client.GET.mock.calls.filter((args) => args[0] === '/apps').length;
    }

    /** As `manifestGateway`, but `GET /apps` answers only once `releaseApps` is called. */
    function heldAppsGateway(faults: { list: unknown[] }, apps: { list: unknown[] }) {
        let releaseApps!: () => void;
        const appsHeld = new Promise<void>((resolve) => {
            releaseApps = resolve;
        });
        const GET = vi.fn(async (path: string) => {
            if (path === '/apps') await appsHeld;
            return { data: { items: path === '/apps' ? apps.list : faults.list }, error: undefined };
        });
        return { client: { GET }, releaseApps };
    }

    /** Lets every pending callback run, so a caller that does not wait has already answered. */
    function settle(): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('places an entity panel read that overlaps the first apps read', async () => {
        const { client, releaseApps } = heldAppsGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] });
        connected(client);

        const dashboard = useAppStore.getState().fetchFaults();
        await vi.waitFor(() => expect(appReads(client)).toBe(1));
        const panel = useAppStore.getState().listEntityFaults('components', 'amr-07');
        await settle();
        releaseApps();
        const [, result] = await Promise.all([dashboard, panel]);

        expect(result.items.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(appReads(client)).toBe(1);
    });

    it('places a forced refresh that overlaps a background apps read', async () => {
        const { client, releaseApps } = heldAppsGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] });
        connected(client);
        useAppStore.setState({ faultsLoaded: true } as never);

        const background = useAppStore.getState().fetchFaults();
        await vi.waitFor(() => expect(appReads(client)).toBe(1));
        // The user presses Refresh while the background read waits for the apps.
        const forced = useAppStore.getState().fetchFaults({ force: true });
        await settle();
        releaseApps();
        await Promise.all([background, forced]);

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
    });

    it('files a fault under the app its node runs as', async () => {
        connected(manifestGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] }));

        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
    });

    it('reads the apps once for nodes it knows, not on every refresh', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const client = manifestGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] });
        connected(client);

        // Refreshes a minute apart: the wait between reads does not hold them back, so
        // what does is that every fault is already placed.
        await useAppStore.getState().fetchFaults();
        now.mockReturnValue(1_000_000 + FAULT_APPS_REREAD_MS);
        await useAppStore.getState().fetchFaults();
        now.mockReturnValue(1_000_000 + 2 * FAULT_APPS_REREAD_MS);
        await useAppStore.getState().fetchFaults();

        expect(appReads(client)).toBe(1);
    });

    it('does not read the apps for an empty list', async () => {
        const client = manifestGateway({ list: [] }, { list: [LANE_NAVIGATOR] });
        connected(client);

        await useAppStore.getState().fetchFaults();

        expect(appReads(client)).toBe(0);
    });

    it('falls back to the last segment for a source no app owns, and asks again only after a while', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const client = manifestGateway(
            { list: [raw({ reporting_sources: ['/test_publisher'] })] },
            { list: [LANE_NAVIGATOR] }
        );
        connected(client);

        await useAppStore.getState().fetchFaults();
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults[0]?.entity_id).toBe('test_publisher');
        expect(appReads(client)).toBe(1);

        // The node may have started since; a minute on, it is worth one more look.
        now.mockReturnValue(1_000_000 + FAULT_APPS_REREAD_MS);
        await useAppStore.getState().fetchFaults();
        expect(appReads(client)).toBe(2);
    });

    it('says when the apps cannot be read, and tries again soon', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(9_000_000);
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let appsFail = true;
        const client = {
            GET: vi.fn(async (path: string) => {
                if (path !== '/apps') return { data: { items: [LANE_BLOCKED] }, error: undefined };
                return appsFail
                    ? { data: undefined, error: { status: 503, message: 'busy' } }
                    : { data: { items: [LANE_NAVIGATOR] }, error: undefined };
            }),
        };
        connected(client);

        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane_navigator']);
        expect(warned).toHaveBeenCalledTimes(1);
        expect(warned).toHaveBeenCalledWith(
            '[store] GET /apps failed; retrying. Until it answers, faults from nodes not seen before cannot be placed on their apps.'
        );

        // The gateway recovers a moment later; the retry waits its short while, not a minute.
        appsFail = false;
        now.mockReturnValue(9_000_000 + FAULT_APPS_RETRY_MS - 1);
        await useAppStore.getState().fetchFaults();
        expect(appReads(client)).toBe(1);

        now.mockReturnValue(9_000_000 + FAULT_APPS_RETRY_MS);
        await useAppStore.getState().fetchFaults();
        expect(appReads(client)).toBe(2);
        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(useAppStore.getState().faultsError).toBeNull();
        expect(warned).toHaveBeenCalledTimes(1);
    });

    it('backs off while the apps keep failing, and warns once for each run of failures', async () => {
        const start = 9_000_000;
        const now = vi.spyOn(Date, 'now').mockReturnValue(start);
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const faults = { list: [LANE_BLOCKED] as unknown[] };
        let appsFail = true;
        const client = {
            GET: vi.fn(async (path: string) => {
                if (path !== '/apps') return { data: { items: faults.list }, error: undefined };
                return appsFail
                    ? { data: undefined, error: { status: 503, message: 'busy' } }
                    : { data: { items: [LANE_NAVIGATOR] }, error: undefined };
            }),
        };
        connected(client);
        let t = start;
        /** One dashboard poll, 5 s after the previous one. */
        const poll = async () => {
            t += 5_000;
            now.mockReturnValue(t);
            await useAppStore.getState().fetchFaults();
        };
        /** Polls until the store reads the apps again, at most a minute and a half of polls. */
        const pollUntilAppsRead = async () => {
            const reads = appReads(client);
            for (let i = 0; i < 18 && appReads(client) === reads; i++) await poll();
        };

        // A minute of polls while GET /apps keeps failing.
        await useAppStore.getState().fetchFaults();
        for (let i = 0; i < 12; i++) await poll();
        // Fast failures: reads at 0, 5, 15 and 35 s, then the next waits 40 s.
        expect(appReads(client)).toBe(4);
        expect(warned).toHaveBeenCalledTimes(1);

        // The gateway recovers: the next read the store allows itself places the fault.
        appsFail = false;
        const readsBeforeRecovery = appReads(client);
        await pollUntilAppsRead();
        expect(appReads(client)).toBe(readsBeforeRecovery + 1);
        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(warned).toHaveBeenCalledTimes(1);

        // A later failure starts a new run, which is reported again.
        appsFail = true;
        faults.list = [LANE_BLOCKED, raw({ fault_code: 'CAMERA_STALE', reporting_sources: ['/perception'] })];
        const readsBeforeNewFailure = appReads(client);
        await pollUntilAppsRead();
        expect(appReads(client)).toBe(readsBeforeNewFailure + 1);
        expect(warned).toHaveBeenCalledTimes(2);
    });

    it('keeps a fault on its app while the gateway lists the app without a node', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const faults = { list: [LANE_BLOCKED] };
        const apps = { list: [LANE_NAVIGATOR] as unknown[] };
        connected(manifestGateway(faults, apps));
        await useAppStore.getState().fetchFaults();

        // The navigator goes down - the gateway lists it without a node - and a fault
        // from a node seen for the first time makes the store read the apps again.
        apps.list = [
            { id: 'lane-navigator', 'x-medkit': { component_id: 'amr-07', is_online: false } },
            { id: 'perception', 'x-medkit': { ros2: { node: '/perception' } } },
        ];
        faults.list = [LANE_BLOCKED, raw({ fault_code: 'CAMERA_STALE', reporting_sources: ['/perception'] })];
        now.mockReturnValue(1_000_000 + FAULT_APPS_REREAD_MS);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator', 'perception']);
    });

    it('learns the apps afresh on another gateway', async () => {
        connected(manifestGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] }));
        await useAppStore.getState().fetchFaults();

        // Same node name, its own app id: what one gateway taught must not carry over.
        const other = manifestGateway(
            { list: [LANE_BLOCKED] },
            { list: [{ id: 'navigator-b', 'x-medkit': { ros2: { node: '/lane_navigator' } } }] }
        );
        connected(other);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['navigator-b']);
    });

    /**
     * A gateway whose fault reads (list, entity panels, counts) answer only once
     * `release` is called, and whose app list answers at once with no apps.
     */
    function gatewayLeftBehind() {
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const GET = vi.fn(async (path: string) => {
            if (path === '/apps') return { data: { items: [] }, error: undefined };
            await held;
            return { data: { items: [raw({ fault_code: 'FROM_GATEWAY_A', reporting_sources: ['/lane_navigator'] })] } };
        });
        return { client: { GET }, release };
    }

    /** We move to a gateway that learns its navigator, which then goes down. */
    async function moveToGatewayWhoseNavigatorGoesDown() {
        const apps = { list: [LANE_NAVIGATOR] as unknown[] };
        const client = manifestGateway({ list: [LANE_BLOCKED] }, apps);
        connected(client);
        await useAppStore.getState().fetchFaults();
        apps.list = [{ id: 'lane-navigator', 'x-medkit': { component_id: 'amr-07', is_online: false } }];
        return client;
    }

    it('keeps what this gateway learned when a late answer from the one we left arrives', async () => {
        const left = gatewayLeftBehind();
        connected(left.client);
        const late = useAppStore.getState().fetchFaults();
        await settle();

        const current = await moveToGatewayWhoseNavigatorGoesDown();
        left.release();
        await late;
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(appReads(current)).toBe(1);
        expect(appReads(left.client)).toBe(0);
    });

    it('keeps what this gateway learned when late panel reads from the one we left arrive', async () => {
        const left = gatewayLeftBehind();
        connected(left.client);
        const lateList = useAppStore.getState().listEntityFaults('apps', 'lane-navigator');
        const lateCounts = useAppStore.getState().prefetchResourceCounts('apps', 'lane-navigator');
        await settle();

        const current = await moveToGatewayWhoseNavigatorGoesDown();
        left.release();
        await Promise.all([lateList, lateCounts]);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(appReads(current)).toBe(1);
        expect(appReads(left.client)).toBe(0);
    });

    it('drops a list from the gateway we left that was waiting for its apps', async () => {
        const left = heldAppsGateway(
            { list: [raw({ fault_code: 'FROM_GATEWAY_A', reporting_sources: ['/lane_navigator'] })] },
            { list: [LANE_NAVIGATOR] }
        );
        connected(left.client);
        const late = useAppStore.getState().fetchFaults();
        await vi.waitFor(() => expect(appReads(left.client)).toBe(1));

        const current = manifestGateway(
            { list: [LANE_BLOCKED] },
            { list: [{ id: 'navigator-b', 'x-medkit': { ros2: { node: '/lane_navigator' } } }] }
        );
        // Only the client changes, so the list the late read started from is still the one
        // on screen: what drops its answer is that it belongs to the gateway we left.
        useAppStore.setState({ client: current } as never);
        left.releaseApps();
        await late;
        expect(useAppStore.getState().faults).toEqual([]);

        // The current gateway learns its own apps, not the ones the other one listed.
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['navigator-b']);
        expect(appReads(current)).toBe(1);
    });

    it('does not let apps read from the gateway we left into the current index', async () => {
        const left = heldAppsGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] });
        connected(left.client);
        const late = useAppStore.getState().fetchFaults();
        await vi.waitFor(() => expect(appReads(left.client)).toBe(1));

        // The current gateway lists its navigator without a node, so the fault keeps its node name.
        const current = manifestGateway(
            { list: [LANE_BLOCKED] },
            { list: [{ id: 'navigator-b', 'x-medkit': { is_online: false } }] }
        );
        connected(current);
        await useAppStore.getState().fetchFaults();
        left.releaseApps();
        await late;
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane_navigator']);
    });

    /** A fault stream that yields `event` once `emit` is called. */
    function streamOnce(event: unknown) {
        let emit!: () => void;
        const emitted = new Promise<void>((resolve) => {
            emit = resolve;
        });
        return {
            emit,
            streams: {
                faults: () => ({
                    close: vi.fn(),
                    async *[Symbol.asyncIterator]() {
                        await emitted;
                        yield event;
                    },
                }),
            },
        };
    }

    /**
     * The list is read while the navigator is down, so its fault is filed under the node's
     * name. More than a minute later the node is back and `event` arrives over the stream,
     * which makes the store read the apps again and place the event on `lane-navigator`.
     */
    async function streamAfterTheNodeComesBack(event: unknown) {
        const now = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
        const apps = {
            list: [{ id: 'lane-navigator', 'x-medkit': { component_id: 'amr-07', is_online: false } }] as unknown[],
        };
        const stream = streamOnce(event);
        const client = { ...manifestGateway({ list: [LANE_BLOCKED] }, apps), streams: stream.streams };
        connected(client);
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane_navigator']);
        useAppStore.getState().subscribeFaultStream();

        apps.list = [LANE_NAVIGATOR];
        now.mockReturnValue(5_000_000 + FAULT_APPS_REREAD_MS + 1_000);
        stream.emit();
        await vi.waitFor(() => expect(appReads(client)).toBe(2));
    }

    it('updates the listed row when its node comes back after the list was read', async () => {
        await streamAfterTheNodeComesBack({
            event: 'fault_updated',
            data: { fault: { ...LANE_BLOCKED, description: 'lane blocked again', status: 'PREFAILED' } },
        });
        await vi.waitFor(() =>
            expect(useAppStore.getState().faults.some((f) => f.entity_id === 'lane-navigator')).toBe(true)
        );
        useAppStore.getState().unsubscribeFaultStream();

        expect(
            useAppStore.getState().faults.map((f) => ({ entity_id: f.entity_id, message: f.message, status: f.status }))
        ).toEqual([{ entity_id: 'lane-navigator', message: 'lane blocked again', status: 'pending' }]);
    });

    it('clears the listed row when its node comes back after the list was read', async () => {
        await streamAfterTheNodeComesBack({
            event: 'fault_cleared',
            data: { fault: { ...LANE_BLOCKED, status: 'CLEARED' } },
        });
        await vi.waitFor(() => expect(useAppStore.getState().faults).toEqual([]));
        useAppStore.getState().unsubscribeFaultStream();
    });

    it('moves the listed row to its app when the event changes nothing else', async () => {
        await streamAfterTheNodeComesBack({ event: 'fault_confirmed', data: { fault: LANE_BLOCKED } });
        await vi.waitFor(() =>
            expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator'])
        );
        useAppStore.getState().unsubscribeFaultStream();
    });

    it('folds every row a streamed fault is about into the one it updates', () => {
        connected(clientReturning([]));
        const byNodeName = transformFault(LANE_BLOCKED as RawFaultItem);
        const byApp = transformFault(
            LANE_BLOCKED as RawFaultItem,
            undefined,
            new Map([['/lane_navigator', 'lane-navigator']])
        );
        useAppStore.setState({ faults: [byNodeName, byApp] } as never);

        useAppStore.getState().applyFaultStreamEvent('fault_updated', { ...byApp, status: 'pending' });

        expect(useAppStore.getState().faults.map((f) => `${f.entity_id}:${f.status}`)).toEqual([
            'lane-navigator:pending',
        ]);
    });

    /** Streams one fault while `GET /apps` is held; resolves once the stream waits for the apps. */
    async function streamedFaultWaitingForApps() {
        const { client, releaseApps } = heldAppsGateway({ list: [] }, { list: [LANE_NAVIGATOR] });
        const stream = streamOnce({ event: 'fault_confirmed', data: { fault: LANE_BLOCKED } });
        stream.emit();
        connected({ ...client, streams: stream.streams });
        useAppStore.getState().subscribeFaultStream();
        await vi.waitFor(() => expect(appReads(client)).toBe(1));
        return releaseApps;
    }

    it('drops a streamed fault still waiting for the apps when the stream is closed', async () => {
        const releaseApps = await streamedFaultWaitingForApps();

        useAppStore.getState().unsubscribeFaultStream();
        releaseApps();
        await settle();

        expect(useAppStore.getState().faults).toEqual([]);
    });

    it('applies a streamed fault once the apps it was waiting for arrive', async () => {
        const releaseApps = await streamedFaultWaitingForApps();

        releaseApps();
        await settle();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['lane-navigator']);
    });

    it("files an app's own faults under that app when the index cannot place them", async () => {
        connected(
            manifestGateway(
                { list: [LANE_BLOCKED] },
                { list: [{ id: 'lane-navigator', 'x-medkit': { component_id: 'amr-07', is_online: false } }] }
            )
        );

        // The gateway filed these under the app it was asked about.
        const own = await useAppStore.getState().listEntityFaults('apps', 'lane-navigator');
        // A component's list does not say which of its apps reported a fault.
        const component = await useAppStore.getState().listEntityFaults('components', 'amr-07');

        expect(own.items.map((f) => f.entity_id)).toEqual(['lane-navigator']);
        expect(component.items.map((f) => f.entity_id)).toEqual(['lane_navigator']);
    });

    /**
     * `bridge` runs as `/bridge` and `anomaly-detector` as `/bridge/anomaly_detector`, which
     * `GET /apps` leaves out unless `detectorUp`. Every fault read answers `faults`; an app's
     * own list also names the app's node in `x-medkit.source_id`, as the gateway does, when
     * `sourceId` is given.
     */
    function bridgeGateway(options: { detectorUp: boolean; faults: unknown[]; sourceId?: string }) {
        const apps = [
            { id: 'bridge', 'x-medkit': { ros2: { node: '/bridge' } } },
            options.detectorUp
                ? { id: 'anomaly-detector', 'x-medkit': { ros2: { node: '/bridge/anomaly_detector' } } }
                : { id: 'anomaly-detector', 'x-medkit': { is_online: false } },
        ];
        return {
            GET: vi.fn(async (path: string) => {
                if (path === '/apps') return { data: { items: apps }, error: undefined };
                const named =
                    path === '/apps/{app_id}/faults' && options.sourceId !== undefined
                        ? { 'x-medkit': { source_id: options.sourceId } }
                        : {};
                return { data: { items: options.faults, ...named }, error: undefined };
            }),
        };
    }

    const DETECTOR_FAULT = raw({ fault_code: 'ANOMALY', reporting_sources: ['/bridge/anomaly_detector'] });

    it("files an app's own faults under that app while a node above it is known", async () => {
        connected(bridgeGateway({ detectorUp: false, faults: [DETECTOR_FAULT], sourceId: '/bridge/anomaly_detector' }));

        const own = await useAppStore.getState().listEntityFaults('apps', 'anomaly-detector');

        expect(own.items.map((f) => f.entity_id)).toEqual(['anomaly-detector']);
    });

    it("still files a fault from a deeper node on that node's app in an app's own list", async () => {
        connected(
            bridgeGateway({
                detectorUp: true,
                faults: [raw({ fault_code: 'ANOMALY', reporting_sources: ['/bridge/anomaly_detector/goal_status'] })],
                sourceId: '/bridge',
            })
        );

        const own = await useAppStore.getState().listEntityFaults('apps', 'bridge');

        expect(own.items.map((f) => f.entity_id)).toEqual(['anomaly-detector']);
    });

    it("places an app's own list as before when the gateway does not name the app's node", async () => {
        // Without it the fault cannot be told from one of the node above.
        connected(bridgeGateway({ detectorUp: false, faults: [DETECTOR_FAULT] }));

        const own = await useAppStore.getState().listEntityFaults('apps', 'anomaly-detector');

        expect(own.items.map((f) => f.entity_id)).toEqual(['bridge']);
    });

    it("keeps the node an app's own list names out of the index the other lists use", async () => {
        connected(bridgeGateway({ detectorUp: false, faults: [DETECTOR_FAULT], sourceId: '/bridge/anomaly_detector' }));
        await useAppStore.getState().listEntityFaults('apps', 'anomaly-detector');

        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults.map((f) => f.entity_id)).toEqual(['bridge']);
    });

    it("counts an entity's faults without reading the apps", async () => {
        // The count is read alongside the entity's data, which must not wait for GET /apps.
        const { client, releaseApps } = heldAppsGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] });
        connected(client);

        const counted = useAppStore.getState().prefetchResourceCounts('components', 'amr-07');
        const first = await Promise.race([counted.then(() => 'counted'), settle().then(() => 'still waiting')]);
        releaseApps();

        expect(first).toBe('counted');
        expect(appReads(client)).toBe(0);
    });

    it("counts an entity's faults the way its Faults tab lists them once the apps are known", async () => {
        // With a cold index an aggregating gateway's repeated code can count twice until the apps are read.
        // One node reporting one code under its own name and under a name of its own.
        connected(
            manifestGateway(
                {
                    list: [
                        raw({ fault_code: 'ANOMALY', reporting_sources: ['/bridge/anomaly_detector'] }),
                        raw({ fault_code: 'ANOMALY', reporting_sources: ['/bridge/anomaly_detector/goal_status'] }),
                    ],
                },
                { list: [{ id: 'anomaly-detector', 'x-medkit': { ros2: { node: '/bridge/anomaly_detector' } } }] }
            )
        );

        // The tab's read teaches the index; the count places faults with what it knows.
        const listed = await useAppStore.getState().listEntityFaults('components', 'bridge');
        const counts = await useAppStore.getState().prefetchResourceCounts('components', 'bridge');

        expect(listed.items.map((f) => f.entity_id)).toEqual(['anomaly-detector']);
        expect(counts.faults).toBe(listed.items.length);
    });

    it("files an entity panel's faults the same way", async () => {
        connected(manifestGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] }));

        const result = await useAppStore.getState().listEntityFaults('components', 'amr-07');

        expect(result.items.map((f) => f.entity_id)).toEqual(['lane-navigator']);
    });

    it('files a streamed fault under the same app, so it lands on the row it is about', async () => {
        const stream = streamOnce({
            event: 'fault_updated',
            data: { fault: { ...LANE_BLOCKED, status: 'PREFAILED' } },
        });
        connected({
            ...manifestGateway({ list: [LANE_BLOCKED] }, { list: [LANE_NAVIGATOR] }),
            streams: stream.streams,
        });
        await useAppStore.getState().fetchFaults();

        useAppStore.getState().subscribeFaultStream();
        stream.emit();

        await vi.waitFor(() =>
            expect(useAppStore.getState().faults.map((f) => `${f.entity_id}:${f.status}`)).toEqual([
                'lane-navigator:pending',
            ])
        );
    });
});
