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
 * An entity's topics, operations and faults as the panels read them. A gateway that
 * answers with an error is not an entity without any: the read fails with the gateway's
 * own words, so a panel can say it could not tell instead of showing an empty list.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from './store';

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const UNAVAILABLE = {
    error_code: 'service-unavailable',
    message: 'Fault manager unavailable',
    parameters: { details: 'the fault_manager service is not running' },
};

function connected(client: unknown) {
    useAppStore.setState({ isConnected: true, client } as never);
}

function failing() {
    return { GET: vi.fn(async () => ({ data: undefined, error: UNAVAILABLE })) };
}

describe('entity reads', () => {
    beforeEach(() => {
        useAppStore.setState({ isConnected: false, client: null } as never);
    });

    it("fails a topics read the gateway answered with an error, in the gateway's words", async () => {
        connected(failing());
        await expect(useAppStore.getState().fetchEntityData('apps', 'nav')).rejects.toThrow(
            'Fault manager unavailable: the fault_manager service is not running'
        );
    });

    it('fails an operations read the gateway answered with an error', async () => {
        connected(failing());
        await expect(useAppStore.getState().fetchEntityOperations('apps', 'nav')).rejects.toThrow(
            'Fault manager unavailable'
        );
    });

    it('fails a faults read the gateway answered with an error', async () => {
        connected(failing());
        await expect(useAppStore.getState().listEntityFaults('apps', 'nav')).rejects.toThrow(
            'Fault manager unavailable'
        );
    });

    it('names what could not be read when the gateway gave no words', async () => {
        connected({ GET: vi.fn(async () => ({ data: undefined, error: {} })) });
        await expect(useAppStore.getState().fetchEntityData('apps', 'nav')).rejects.toThrow('Failed to load topics');
        await expect(useAppStore.getState().fetchEntityOperations('apps', 'nav')).rejects.toThrow(
            'Failed to load operations'
        );
        await expect(useAppStore.getState().listEntityFaults('apps', 'nav')).rejects.toThrow('Failed to load faults');
    });

    it("keeps why an entity's operations could not be read, until a read succeeds", async () => {
        connected(failing());
        await useAppStore.getState().fetchOperations('nav', 'apps');
        expect(useAppStore.getState().operationsErrors.get('nav')).toBe(
            'Fault manager unavailable: the fault_manager service is not running'
        );

        connected({ GET: vi.fn(async () => ({ data: { items: [] }, error: undefined })) });
        await useAppStore.getState().fetchOperations('nav', 'apps');
        expect(useAppStore.getState().operationsErrors.has('nav')).toBe(false);
    });

    it("keeps why an entity's parameters could not be read, until a read succeeds", async () => {
        connected(failing());
        await useAppStore.getState().fetchConfigurations('nav', 'apps');
        expect(useAppStore.getState().configurationsErrors.get('nav')).toBe(
            'Fault manager unavailable: the fault_manager service is not running'
        );

        connected({ GET: vi.fn(async () => ({ data: { items: [] }, error: undefined })) });
        await useAppStore.getState().fetchConfigurations('nav', 'apps');
        expect(useAppStore.getState().configurationsErrors.has('nav')).toBe(false);
    });

    it('reads nothing, and fails nothing, without a gateway', async () => {
        expect(await useAppStore.getState().fetchEntityData('apps', 'nav')).toEqual([]);
        expect(await useAppStore.getState().fetchEntityOperations('apps', 'nav')).toEqual([]);
        expect(await useAppStore.getState().listEntityFaults('apps', 'nav')).toEqual({ items: [], count: 0 });
    });
});
