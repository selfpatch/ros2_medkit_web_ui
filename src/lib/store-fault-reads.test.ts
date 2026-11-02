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
 * What the fault page reads beyond the list: a topic now, through the app that reports
 * the fault, and the fault's own times, which the page's story is told from.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from './store';
import { transformFault } from './transforms';
import type { Fault } from './types';

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function raw(overrides: Record<string, unknown> = {}) {
    return {
        fault_code: 'LANE_BLOCKED',
        description: 'Lane blocked by a forklift',
        severity: 2,
        severity_label: 'ERROR',
        status: 'CONFIRMED',
        first_occurred: 1756636800,
        last_occurred: 1756636800,
        occurrence_count: 1,
        reporting_sources: ['/lane_navigator'],
        ...overrides,
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

/** A client whose one data read answers what the test says. */
function dataClient(answer: () => Promise<unknown>) {
    return { GET: vi.fn(answer) };
}

beforeEach(() => {
    connected(null);
});

afterEach(() => {
    useAppStore.setState({ isConnected: false, client: null, faults: [] } as never);
});

describe('readFaultTopic', () => {
    it("hands over the message the gateway sampled, and passes the page's signal on", async () => {
        const client = dataClient(async () => ({
            data: { id: '/scan', data: { ranges: [0.96] }, 'x-medkit': { status: 'data' } },
            error: undefined,
        }));
        connected(client);
        const controller = new AbortController();

        const read = await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan', controller.signal);

        expect(read).toEqual({ message: { ranges: [0.96] } });
        const [path, options] = client.GET.mock.calls[0] as unknown as [
            string,
            { params: { path: Record<string, string> }; signal?: AbortSignal },
        ];
        expect(path).toBe('/apps/{app_id}/data/{data_id}');
        expect(options.params.path).toEqual({ app_id: 'lane-navigator', data_id: '/scan' });
        expect(options.signal).toBe(controller.signal);
    });

    it('says a topic gave no sample instead of handing over the empty placeholder', async () => {
        // What the gateway answers for a topic with no publisher, or one that sent nothing in time.
        connected(
            dataClient(async () => ({
                data: { id: '/scan', data: {}, 'x-medkit': { status: 'metadata_only', publisher_count: 0 } },
                error: undefined,
            }))
        );

        const read = await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan');

        expect(read).toEqual({ failed: 'no sample: the topic has no publisher or sent nothing in time' });
    });

    it("says why in the gateway's words when it answers with an error", async () => {
        connected(
            dataClient(async () => ({
                data: undefined,
                error: { error_code: 'entity-not-found', message: 'App not found: lane-navigator' },
            }))
        );

        const read = await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan');

        expect(read).toEqual({ failed: 'App not found: lane-navigator' });
    });

    it('says a read that threw failed, with the reason, aborts included', async () => {
        connected(
            dataClient(async () => {
                throw new DOMException('The operation was aborted.', 'AbortError');
            })
        );

        const read = await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan');

        expect(read).toEqual({ failed: 'The operation was aborted.' });
    });

    it('says there is nothing to read from without a gateway, or from an empty answer', async () => {
        expect(await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan')).toEqual({
            failed: expect.any(String),
        });

        connected(dataClient(async () => ({ data: undefined, error: undefined })));
        expect(await useAppStore.getState().readFaultTopic('apps', 'lane-navigator', '/scan')).toEqual({
            failed: expect.any(String),
        });
    });
});

describe("the fault list takes up a change of the fault's times", () => {
    it('replaces the list when only the newest report moved', async () => {
        connected(clientReturning([raw()]));
        await useAppStore.getState().fetchFaults();
        const before = useAppStore.getState().faults;

        useAppStore.setState({ client: clientReturning([raw({ last_occurred: 1756636860 })]) } as never);
        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults).not.toBe(before);
        expect(useAppStore.getState().faults[0]?.parameters?.last_occurred).toBe(1756636860);
    });

    it('replaces the list when only the last pass or the count moved', async () => {
        connected(clientReturning([raw()]));
        await useAppStore.getState().fetchFaults();

        useAppStore.setState({ client: clientReturning([raw({ last_passed: 1756636900 })]) } as never);
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults[0]?.parameters?.last_passed).toBe(1756636900);

        useAppStore.setState({
            client: clientReturning([raw({ last_passed: 1756636900, occurrence_count: 2 })]),
        } as never);
        await useAppStore.getState().fetchFaults();
        expect(useAppStore.getState().faults[0]?.parameters?.occurrence_count).toBe(2);
    });

    it('keeps the list as it is for an answer that changed nothing', async () => {
        connected(clientReturning([raw()]));
        await useAppStore.getState().fetchFaults();
        const before = useAppStore.getState().faults;

        await useAppStore.getState().fetchFaults();

        expect(useAppStore.getState().faults).toBe(before);
    });

    it('takes up a stream event that only moved the newest report', () => {
        const fault: Fault = transformFault(raw());
        useAppStore.setState({ faults: [fault] } as never);

        const reported: Fault = { ...fault, parameters: { ...fault.parameters, last_occurred: 1756636860 } };
        useAppStore.getState().applyFaultStreamEvent('fault_updated', reported);

        expect(useAppStore.getState().faults[0]?.parameters?.last_occurred).toBe(1756636860);
    });

    it('raises no toast for the stream events a confirmed fault sends on every report', async () => {
        // The fault manager sends fault_updated for each report of a confirmed fault, FAILED
        // or PASSED: a node that reports once a second would raise a toast a second.
        const { toast } = await import('react-toastify');
        const fault: Fault = transformFault(raw());
        useAppStore.setState({ faults: [fault] } as never);
        vi.mocked(toast.warning).mockClear();

        for (let i = 1; i <= 5; i += 1) {
            useAppStore.getState().applyFaultStreamEvent('fault_updated', {
                ...fault,
                parameters: { ...fault.parameters, last_occurred: 1756636800 + i, last_passed: 1756636800 + i },
            });
        }

        expect(toast.warning).not.toHaveBeenCalled();
        expect(useAppStore.getState().faults[0]?.parameters?.last_occurred).toBe(1756636805);
    });

    it('still raises a toast when a stream event changes what the fault is', async () => {
        const { toast } = await import('react-toastify');
        const fault: Fault = transformFault(raw());
        useAppStore.setState({ faults: [fault] } as never);
        vi.mocked(toast.warning).mockClear();

        useAppStore.getState().applyFaultStreamEvent('fault_updated', { ...fault, severity: 'critical' });

        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('raises no toast for an open fault that only counts on in its message', async () => {
        // M1-2's anomaly detector writes how long it has been stuck into the message.
        const { toast } = await import('react-toastify');
        const fault: Fault = { ...transformFault(raw()), message: 'No navigation progress for 28.1s' };
        useAppStore.setState({ faults: [fault] } as never);
        vi.mocked(toast.warning).mockClear();

        useAppStore
            .getState()
            .applyFaultStreamEvent('fault_updated', { ...fault, message: 'No navigation progress for 34.1s' });

        expect(toast.warning).not.toHaveBeenCalled();
        expect(useAppStore.getState().faults[0]?.message).toBe('No navigation progress for 34.1s');
    });

    it('raises a toast for a fault that comes back after it healed', async () => {
        const { toast } = await import('react-toastify');
        const fault: Fault = transformFault(raw());
        useAppStore.setState({ faults: [{ ...fault, status: 'healed' }] } as never);
        vi.mocked(toast.warning).mockClear();

        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', fault);

        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('adds the row of a fault_updated for a fault the list does not hold, and raises no toast', async () => {
        const { toast } = await import('react-toastify');
        useAppStore.setState({ faults: [] } as never);
        vi.mocked(toast.warning).mockClear();

        useAppStore.getState().applyFaultStreamEvent('fault_updated', transformFault(raw()));

        expect(useAppStore.getState().faults.map((f) => f.code)).toEqual(['LANE_BLOCKED']);
        expect(toast.warning).not.toHaveBeenCalled();

        useAppStore
            .getState()
            .applyFaultStreamEvent('fault_confirmed', transformFault(raw({ fault_code: 'MOTOR_OVERHEAT' })));
        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('raises no toast for a fault a list on screen shows', async () => {
        const { toast } = await import('react-toastify');
        useAppStore.setState({ faults: [] } as never);
        vi.mocked(toast.warning).mockClear();

        const stopShowing = useAppStore.getState().showingFaults(() => true);
        useAppStore.getState().applyFaultStreamEvent('fault_confirmed', transformFault(raw()));
        expect(toast.warning).not.toHaveBeenCalled();
        expect(useAppStore.getState().faults).toHaveLength(1);

        stopShowing();
        stopShowing();
        useAppStore
            .getState()
            .applyFaultStreamEvent('fault_confirmed', transformFault(raw({ fault_code: 'MOTOR_OVERHEAT' })));
        expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it('leaves the list alone for a stream event that changed nothing', () => {
        const fault: Fault = transformFault(raw());
        useAppStore.setState({ faults: [fault] } as never);
        const before = useAppStore.getState().faults;

        useAppStore
            .getState()
            .applyFaultStreamEvent('fault_updated', { ...fault, parameters: { ...fault.parameters } });

        expect(useAppStore.getState().faults).toBe(before);
    });
});

describe('transformFault', () => {
    it("passes the fault's last pass on, as the gateway sent it", () => {
        expect(transformFault(raw({ last_passed: 1756636900 })).parameters?.last_passed).toBe(1756636900);
        expect(transformFault(raw()).parameters?.last_passed).toBeUndefined();
    });
});
