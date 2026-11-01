import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@/lib/store';
import { useLiveFaultReadings } from './useLiveFaultReadings';

describe('useLiveFaultReadings', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reads one topic at a time and starts no round while one is still out', async () => {
        let inFlight = 0;
        let mostAtOnce = 0;
        let calls = 0;
        // Each read takes 4 s: a 3-topic round outlasts the 5 s between rounds.
        const readFaultTopic = vi.fn(async (_type: string, _id: string, topic: string) => {
            calls += 1;
            inFlight += 1;
            mostAtOnce = Math.max(mostAtOnce, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            inFlight -= 1;
            return { topic };
        });
        useAppStore.setState({ readFaultTopic } as never);

        const { result, unmount } = renderHook(() =>
            useLiveFaultReadings('apps', 'lane-navigator', ['/a', '/b', '/c'], true)
        );

        // 12 s covers the first round; the reads at 5 s and 10 s find it still out and skip
        await act(async () => {
            await vi.advanceTimersByTimeAsync(12_000);
        });

        expect(mostAtOnce).toBe(1);
        expect(calls).toBe(3);
        expect(result.current.values.get('/c')).toEqual({ topic: '/c' });
        unmount();
    });

    it('stops reading when the page closes', async () => {
        const readFaultTopic = vi.fn(async () => ({ value: 1 }));
        useAppStore.setState({ readFaultTopic } as never);

        const { unmount } = renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a'], true));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        const before = readFaultTopic.mock.calls.length;
        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000);
        });

        expect(readFaultTopic.mock.calls.length).toBe(before);
    });
});
