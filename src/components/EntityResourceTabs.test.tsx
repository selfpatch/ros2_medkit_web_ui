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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EntityResourceTabs } from './EntityResourceTabs';
import type { ComponentTopic, Operation, Fault } from '@/lib/types';

// ---- store mock ----

const mockFetchEntityData = vi.fn();
const mockFetchEntityOperations = vi.fn();
const mockFetchConfigurations = vi.fn();
const mockListEntityFaults = vi.fn();
const mockSelectEntity = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            selectEntity: mockSelectEntity,
            fetchEntityData: mockFetchEntityData,
            fetchEntityOperations: mockFetchEntityOperations,
            fetchConfigurations: mockFetchConfigurations,
            listEntityFaults: mockListEntityFaults,
            configurations: new Map(),
        })
    ),
}));

// ---- helpers ----

function sampleTopics(): ComponentTopic[] {
    return [
        {
            topic: '/engine/temperature',
            timestamp: Date.now(),
            data: null,
            status: 'metadata_only',
            type: 'sensor_msgs/msg/Temperature',
        },
    ];
}

// ---- tests ----

describe('EntityResourceTabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchEntityData.mockResolvedValue([] as ComponentTopic[]);
        mockFetchEntityOperations.mockResolvedValue([] as Operation[]);
        mockFetchConfigurations.mockResolvedValue(undefined);
        mockListEntityFaults.mockResolvedValue({ items: [] as Fault[], count: 0 });
    });

    it('fetches and displays data items on first render', async () => {
        mockFetchEntityData.mockResolvedValue(sampleTopics());

        render(<EntityResourceTabs entityId="ecu-primary" entityType="components" />);

        await waitFor(() => {
            expect(mockFetchEntityData).toHaveBeenCalledWith('components', 'ecu-primary', expect.anything());
        });

        await waitFor(() => {
            expect(screen.getByText('/engine/temperature')).toBeInTheDocument();
        });
    });

    it('re-fetches data when entityId changes (loadedTabs ref race)', async () => {
        mockFetchEntityData.mockResolvedValue(sampleTopics());

        const { rerender } = render(<EntityResourceTabs entityId="ecu-primary" entityType="components" />);

        // Wait for first fetch to complete
        await waitFor(() => {
            expect(screen.getByText('/engine/temperature')).toBeInTheDocument();
        });

        // Switch to a different entity - this is the scenario that was broken:
        // the ref still had { data: true } from the first entity, so the load
        // effect returned early and data stayed empty.
        const secondTopics: ComponentTopic[] = [
            {
                topic: '/brake/pressure',
                timestamp: Date.now(),
                data: null,
                status: 'metadata_only',
                type: 'sensor_msgs/msg/FluidPressure',
            },
        ];
        mockFetchEntityData.mockResolvedValue(secondTopics);

        rerender(<EntityResourceTabs entityId="ecu-mcu" entityType="components" />);

        await waitFor(() => {
            expect(mockFetchEntityData).toHaveBeenCalledWith('components', 'ecu-mcu', expect.anything());
        });

        await waitFor(() => {
            expect(screen.getByText('/brake/pressure')).toBeInTheDocument();
        });

        // Old data should be gone
        expect(screen.queryByText('/engine/temperature')).not.toBeInTheDocument();
    });

    it('does not apply stale fetch result when entity changes mid-flight', async () => {
        // First fetch returns a promise we control, so we can switch entities
        // while it is still in-flight and verify the old result is discarded.
        let resolveFirst: (value: ComponentTopic[]) => void = () => {};
        const firstPromise = new Promise<ComponentTopic[]>((resolve) => {
            resolveFirst = resolve;
        });
        mockFetchEntityData.mockReturnValueOnce(firstPromise);

        const { rerender } = render(<EntityResourceTabs entityId="ecu-primary" entityType="components" />);

        // Switch entity while the first fetch is still pending
        const secondTopics: ComponentTopic[] = [
            {
                topic: '/brake/pressure',
                timestamp: Date.now(),
                data: null,
                status: 'metadata_only',
                type: 'sensor_msgs/msg/FluidPressure',
            },
        ];
        mockFetchEntityData.mockResolvedValueOnce(secondTopics);
        rerender(<EntityResourceTabs entityId="ecu-mcu" entityType="components" />);

        // New entity's fetch resolves and renders
        await waitFor(() => {
            expect(screen.getByText('/brake/pressure')).toBeInTheDocument();
        });

        // Late-resolve the first (aborted) fetch - it must NOT overwrite the
        // current entity's data.
        resolveFirst(sampleTopics());
        // Give the microtask queue a chance to run the (hopefully discarded) setData.
        await Promise.resolve();
        await Promise.resolve();

        expect(screen.queryByText('/engine/temperature')).not.toBeInTheDocument();
        expect(screen.getByText('/brake/pressure')).toBeInTheDocument();
    });
});
