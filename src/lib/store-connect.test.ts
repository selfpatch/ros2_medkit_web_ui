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
import type { MedkitClient } from '@selfpatch/ros2-medkit-client-ts';

// -----------------------------------------------------------------------------
// connect() must not let the scripts-capability probe (GET /) stall entity
// loading: a gateway that answers /health and then hangs on GET / would
// otherwise leave the UI showing "connected" over an empty tree for the
// full 5s timeout, on every connect. createMedkitClient is mocked so the
// test can hold GET / pending indefinitely while asserting that loading the
// root entities does not wait for it.
// -----------------------------------------------------------------------------

vi.mock('@selfpatch/ros2-medkit-client-ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@selfpatch/ros2-medkit-client-ts')>();
    return {
        ...actual,
        createMedkitClient: vi.fn(),
    };
});

import { useAppStore } from './store';
import { createMedkitClient } from '@selfpatch/ros2-medkit-client-ts';

describe('connect', () => {
    const originalLoadRootEntities = useAppStore.getState().loadRootEntities;
    const originalSubscribeFaultStream = useAppStore.getState().subscribeFaultStream;

    beforeEach(() => {
        useAppStore.setState({ client: null, isConnected: false, scriptsSupported: false });
    });

    afterEach(() => {
        useAppStore.getState().stopScriptPolling();
        useAppStore.setState({
            client: null,
            isConnected: false,
            scriptsSupported: false,
            loadRootEntities: originalLoadRootEntities,
            subscribeFaultStream: originalSubscribeFaultStream,
        });
        vi.restoreAllMocks();
    });

    it('loads root entities without waiting for the capability probe to resolve', async () => {
        let resolveCaps: (() => void) | undefined;
        const capsPromise = new Promise((resolve) => {
            resolveCaps = () => resolve({ data: { capabilities: { scripts: true } } });
        });

        const mockGet = vi.fn((path: string) => {
            if (path === '/health') return Promise.resolve({ error: undefined });
            if (path === '/') return capsPromise; // Never resolves until resolveCaps() is called.
            return Promise.resolve({ data: undefined });
        });

        vi.mocked(createMedkitClient).mockReturnValue({ GET: mockGet } as unknown as MedkitClient);

        const loadRootEntities = vi.fn().mockResolvedValue(undefined);
        const subscribeFaultStream = vi.fn();
        useAppStore.setState({ loadRootEntities, subscribeFaultStream });

        // Race connect() against a short real-timer delay instead of relying
        // on vitest's global test timeout: if connect() awaited the capability
        // probe first (the bug), it would still be pending when the timer
        // fires, since resolveCaps() is deliberately never called before this
        // point.
        const raceResult = await Promise.race([
            useAppStore
                .getState()
                .connect('http://gateway.local')
                .then((result) => ({ outcome: 'connected' as const, result })),
            new Promise((resolve) => setTimeout(() => resolve({ outcome: 'timeout' as const }), 100)),
        ]);

        expect(raceResult).toEqual({ outcome: 'connected', result: true });
        expect(loadRootEntities).toHaveBeenCalledTimes(1);
        expect(subscribeFaultStream).toHaveBeenCalledTimes(1);

        // The probe itself must still land once it resolves - the client-
        // identity guard makes this late result safe, not meaningless.
        resolveCaps?.();
        await Promise.resolve();
        await Promise.resolve();
        expect(useAppStore.getState().scriptsSupported).toBe(true);
    });

    it('drops the previous gateway fault stream before serving the new one', async () => {
        const mockGet = vi.fn((path: string) => {
            if (path === '/health') return Promise.resolve({ error: undefined });
            return Promise.resolve({ data: undefined });
        });
        vi.mocked(createMedkitClient).mockReturnValue({ GET: mockGet } as unknown as MedkitClient);
        const previousStream = vi.fn();
        useAppStore.setState({
            loadRootEntities: vi.fn().mockResolvedValue(undefined),
            subscribeFaultStream: vi.fn(),
            faultStreamCleanup: previousStream,
        });

        await useAppStore.getState().connect('http://other-gateway.local');

        // Otherwise the old stream keeps writing faults into the new gateway's list for as
        // long as the connection sequence takes.
        expect(previousStream).toHaveBeenCalledTimes(1);
    });

    it('leaves no faults from the previous gateway on screen', async () => {
        const mockGet = vi.fn((path: string) => {
            if (path === '/health') return Promise.resolve({ error: undefined });
            return Promise.resolve({ data: undefined });
        });
        vi.mocked(createMedkitClient).mockReturnValue({ GET: mockGet } as unknown as MedkitClient);
        useAppStore.setState({
            loadRootEntities: vi.fn().mockResolvedValue(undefined),
            subscribeFaultStream: vi.fn(),
            faults: [
                {
                    code: 'PREVIOUS_GATEWAY_FAULT',
                    message: 'raised on the robot we just left',
                    severity: 'error',
                    status: 'active',
                    timestamp: '2026-08-31T10:00:00.000Z',
                    entity_id: 'lidar_front',
                    entity_type: 'app',
                },
            ],
            faultsLoaded: true,
        });

        await useAppStore.getState().connect('http://other-gateway.local');

        expect(useAppStore.getState().faults).toEqual([]);
        expect(useAppStore.getState().faultsLoaded).toBe(false);
    });
});
