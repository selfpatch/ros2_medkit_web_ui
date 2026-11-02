import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppStore } from '@/lib/store';
import type { FaultTopicRead } from '@/lib/types';
import { useLiveFaultReadings } from './useLiveFaultReadings';

type Read = (type: string, id: string, topic: string, signal?: AbortSignal) => Promise<FaultTopicRead>;

function useReads(read: Read) {
    const readFaultTopic = vi.fn(read);
    useAppStore.setState({ readFaultTopic } as never);
    return readFaultTopic;
}

async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe('useLiveFaultReadings', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('reads one topic at a time and starts no round while one is still out', async () => {
        let inFlight = 0;
        let mostAtOnce = 0;
        let calls = 0;
        // Each read takes 4 s: a 3-topic round outlasts the 5 s between rounds.
        useReads(async (_type, _id, topic) => {
            calls += 1;
            inFlight += 1;
            mostAtOnce = Math.max(mostAtOnce, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            inFlight -= 1;
            return { message: { topic } };
        });

        const { result, unmount } = renderHook(() =>
            useLiveFaultReadings('apps', 'lane-navigator', ['/a', '/b', '/c'], true)
        );

        // 12 s covers the first round; the reads at 5 s and 10 s find it still out and skip
        await advance(12_000);

        expect(mostAtOnce).toBe(1);
        expect(calls).toBe(3);
        expect(result.current.values.get('/c')).toEqual({ topic: '/c' });
        unmount();
    });

    it('says it has asked only once a whole round of reads has finished', async () => {
        useReads(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return { failed: 'no sample' };
        });

        const { result, unmount } = renderHook(() =>
            useLiveFaultReadings('apps', 'lane-navigator', ['/a', '/b'], true)
        );

        await advance(3000);
        expect(result.current.asked).toBe(false);
        await advance(2000);
        expect(result.current.asked).toBe(true);
        unmount();
    });

    it('reads nothing while not enabled', async () => {
        const readFaultTopic = useReads(async () => ({ message: 1 }));

        renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a'], false));
        await advance(20_000);

        expect(readFaultTopic).not.toHaveBeenCalled();
    });

    it('reads nothing while the tab is hidden', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        const readFaultTopic = useReads(async () => ({ message: 1 }));

        renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a'], true));
        await advance(20_000);

        expect(readFaultTopic).not.toHaveBeenCalled();
    });

    it('keeps the last answer of a topic that stops answering, marked stale, and says so once', async () => {
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let answering = true;
        useReads(async (_type, _id, topic) =>
            answering || topic === '/b'
                ? { message: { topic, answering } }
                : { failed: 'App not found: lane-navigator' }
        );

        const { result } = renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a', '/b'], true));
        await advance(0);
        const firstAnswer = result.current.readAt;
        expect(result.current.stale.size).toBe(0);
        expect(result.current.answeredAt.get('/a')).toBe(firstAnswer);

        answering = false;
        await advance(5_000);
        await advance(5_000);

        expect(result.current.values.get('/a')).toEqual({ topic: '/a', answering: true });
        expect([...result.current.stale]).toEqual(['/a']);
        expect(result.current.answeredAt.get('/a')).toBe(firstAnswer);
        // /b still answers, so the topics were read just now.
        expect(result.current.readAt).toBeGreaterThan(firstAnswer!);
        expect(result.current.failing).toBe(false);
        // Two failed rounds, one warning, with the reason.
        expect(warned).toHaveBeenCalledTimes(1);
        expect(String(warned.mock.calls[0])).toContain('App not found: lane-navigator');
        expect(String(warned.mock.calls[0])).toContain('/a');
    });

    it('moves the read time only for a round some topic answered, and says when none did', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let answering = false;
        useReads(async () => (answering ? { message: 1 } : { failed: 'no sample' }));

        const { result } = renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a'], true));
        await advance(0);
        expect(result.current.readAt).toBeNull();
        expect(result.current.failing).toBe(true);
        expect(result.current.stale.size).toBe(0);

        answering = true;
        await advance(5_000);
        const answeredAt = result.current.readAt;
        expect(answeredAt).not.toBeNull();
        expect(result.current.failing).toBe(false);

        answering = false;
        await advance(5_000);
        expect(result.current.readAt).toBe(answeredAt);
        expect(result.current.failing).toBe(true);
        expect([...result.current.stale]).toEqual(['/a']);
    });

    it('stops reading when the page closes, and calls off the read still out', async () => {
        const signals: AbortSignal[] = [];
        const readFaultTopic = useReads(
            (_type, _id, _topic, signal) =>
                new Promise((resolve) => {
                    signals.push(signal!);
                    signal?.addEventListener('abort', () => resolve({ failed: 'aborted' }));
                })
        );

        const { unmount } = renderHook(() => useLiveFaultReadings('apps', 'lane-navigator', ['/a'], true));
        await advance(0);
        const before = readFaultTopic.mock.calls.length;
        expect(signals[0]?.aborted).toBe(false);
        unmount();
        await advance(20_000);

        expect(signals[0]?.aborted).toBe(true);
        expect(readFaultTopic.mock.calls.length).toBe(before);
    });

    it('calls off the read of the fault it left when the fault changes, and keeps nothing of it', async () => {
        const signals = new Map<string, AbortSignal>();
        useReads(
            (_type, id, _topic, signal) =>
                new Promise((resolve) => {
                    signals.set(id, signal!);
                    if (id === 'b') resolve({ message: { from: id } });
                    signal?.addEventListener('abort', () => resolve({ failed: 'aborted' }));
                })
        );

        const { result, rerender } = renderHook(({ id }) => useLiveFaultReadings('apps', id, ['/a'], true), {
            initialProps: { id: 'a' },
        });
        await advance(0);
        rerender({ id: 'b' });
        await advance(0);

        expect(signals.get('a')?.aborted).toBe(true);
        expect(result.current.values.get('/a')).toEqual({ from: 'b' });
    });

    it('starts over for a new list of the same topics only when the topics change', async () => {
        const readFaultTopic = useReads(async () => ({ message: 1 }));

        const { rerender } = renderHook(({ topics }) => useLiveFaultReadings('apps', 'x', topics, true), {
            initialProps: { topics: ['/a'] },
        });
        await advance(0);
        rerender({ topics: ['/a'] });
        await advance(0);
        expect(readFaultTopic).toHaveBeenCalledTimes(1);

        // A topic name holding the old separator is still one topic.
        rerender({ topics: ['/a|/b'] });
        await advance(0);
        expect(readFaultTopic).toHaveBeenCalledTimes(2);
        expect(readFaultTopic.mock.calls[1]?.[2]).toBe('/a|/b');
    });
});
