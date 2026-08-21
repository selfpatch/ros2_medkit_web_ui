import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock api-dispatch so the store's getStatus call hits our spy. A namespace
// spy (vi.spyOn) does not patch the store's named-import binding, so mock the
// module instead and drive the return value per-test.
vi.mock('./api-dispatch', () => ({
    getStatus: vi.fn(),
    setStatus: vi.fn(),
}));

import { useAppStore, entityStatusKey, __resetStatusRequestCache } from './store';
import * as api from './api-dispatch';

const getStatusMock = vi.mocked(api.getStatus);

describe('entityStatusKey', () => {
    it('joins type and id with a colon', () => {
        expect(entityStatusKey('components', 'host1')).toBe('components:host1');
        expect(entityStatusKey('apps', 'planner')).toBe('apps:planner');
    });
});

describe('fetchEntityStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAppStore.setState({ statusByEntity: {}, client: {} as never });
    });

    it('maps a 200 ready response into the cache', async () => {
        getStatusMock.mockResolvedValue({ data: { status: 'ready' }, response: { status: 200 } } as never);
        await useAppStore.getState().fetchEntityStatus('components', 'host1');
        expect(useAppStore.getState().statusByEntity[entityStatusKey('components', 'host1')]).toBe('ready');
    });

    it('maps a 501 response to "unavailable"', async () => {
        getStatusMock.mockResolvedValue({ data: undefined, response: { status: 501 } } as never);
        await useAppStore.getState().fetchEntityStatus('apps', 'planner');
        expect(useAppStore.getState().statusByEntity[entityStatusKey('apps', 'planner')]).toBe('unavailable');
    });

    it('de-dupes concurrent in-flight calls for the same key', async () => {
        getStatusMock.mockResolvedValue({ data: { status: 'notReady' }, response: { status: 200 } } as never);
        await Promise.all([
            useAppStore.getState().fetchEntityStatus('apps', 'planner'),
            useAppStore.getState().fetchEntityStatus('apps', 'planner'),
        ]);
        expect(getStatusMock).toHaveBeenCalledTimes(1);
    });
});

describe('lifecycle status cache across sessions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetStatusRequestCache();
        useAppStore.setState({ statusByEntity: {}, client: {} as never });
    });

    it('disconnect clears the cached statuses', () => {
        useAppStore.setState({ statusByEntity: { 'components:host1': 'ready' } });
        useAppStore.getState().disconnect();
        expect(useAppStore.getState().statusByEntity).toEqual({});
    });

    it('connect clears the cached statuses before it reaches the network', async () => {
        useAppStore.setState({ statusByEntity: { 'components:host1': 'ready' } });
        // The reset is in connect's first synchronous `set`, so it is observable
        // without waiting for (or reaching) the health check.
        const pending = useAppStore.getState().connect('http://127.0.0.1:1/');
        expect(useAppStore.getState().statusByEntity).toEqual({});
        await pending;
    });

    it('a fetch left in flight by the previous session does not satisfy the next one', async () => {
        // Entity ids collide across gateways ('components:host1' is not unique
        // per robot), so a promise held over a reconnect would answer the new
        // session with the old gateway's readiness and never hit the network.
        getStatusMock.mockReturnValue(new Promise(() => {}) as never);
        void useAppStore.getState().fetchEntityStatus('components', 'host1');
        expect(getStatusMock).toHaveBeenCalledTimes(1);

        useAppStore.getState().disconnect();
        useAppStore.setState({ client: {} as never });
        getStatusMock.mockResolvedValue({ data: { status: 'notReady' }, response: { status: 200 } } as never);

        await useAppStore.getState().fetchEntityStatus('components', 'host1');

        expect(getStatusMock).toHaveBeenCalledTimes(2);
        expect(useAppStore.getState().statusByEntity[entityStatusKey('components', 'host1')]).toBe('notReady');
    });

    it('a late response from the previous session is not written into the new one', async () => {
        let settle: (value: unknown) => void = () => {};
        getStatusMock.mockReturnValue(new Promise((resolve) => (settle = resolve)) as never);
        const stale = useAppStore.getState().fetchEntityStatus('components', 'host1');

        useAppStore.getState().disconnect();
        useAppStore.setState({ client: {} as never, statusByEntity: { 'components:host1': 'notReady' } });

        settle({ data: { status: 'ready' }, response: { status: 200 } });
        await stale;

        expect(useAppStore.getState().statusByEntity[entityStatusKey('components', 'host1')]).toBe('notReady');
    });
});

describe('readiness refresh loop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetStatusRequestCache();
        useAppStore.getState().stopStatusPolling();
        useAppStore.setState({ statusByEntity: {}, client: {} as never });
        getStatusMock.mockResolvedValue({ data: { status: 'ready' }, response: { status: 200 } } as never);
    });

    afterEach(() => {
        useAppStore.getState().stopStatusPolling();
        vi.useRealTimers();
    });

    it('re-reads a watched entity on the interval', async () => {
        vi.useFakeTimers();
        useAppStore.getState().watchEntityStatus('apps', 'talker');
        expect(getStatusMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(getStatusMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(5000);
        expect(getStatusMock).toHaveBeenCalledTimes(3);
    });

    it('stops re-reading an entity once nothing watches it', async () => {
        vi.useFakeTimers();
        const unwatch = useAppStore.getState().watchEntityStatus('apps', 'talker');
        await vi.advanceTimersByTimeAsync(5000);
        expect(getStatusMock).toHaveBeenCalledTimes(2);

        unwatch();
        await vi.advanceTimersByTimeAsync(15000);

        expect(getStatusMock).toHaveBeenCalledTimes(2);
        expect(useAppStore.getState().statusPollingIntervalId).toBeNull();
    });

    it('keeps watching while a second watcher is still mounted', async () => {
        vi.useFakeTimers();
        // The control and the tree lamp watch the same entity at once.
        const unwatchA = useAppStore.getState().watchEntityStatus('apps', 'talker');
        useAppStore.getState().watchEntityStatus('apps', 'talker');
        getStatusMock.mockClear();

        unwatchA();
        await vi.advanceTimersByTimeAsync(5000);

        expect(getStatusMock).toHaveBeenCalledTimes(1);
    });

    it('disconnect stops the loop', async () => {
        vi.useFakeTimers();
        useAppStore.getState().watchEntityStatus('apps', 'talker');
        getStatusMock.mockClear();

        useAppStore.getState().disconnect();
        await vi.advanceTimersByTimeAsync(15000);

        expect(getStatusMock).not.toHaveBeenCalled();
        expect(useAppStore.getState().statusPollingIntervalId).toBeNull();
    });

    it('splits the cache key on its first colon so ids keep their own separators', async () => {
        vi.useFakeTimers();
        useAppStore.getState().watchEntityStatus('components', 'host1');
        await vi.advanceTimersByTimeAsync(5000);

        expect(getStatusMock).toHaveBeenLastCalledWith(expect.anything(), 'components', 'host1');
    });
});

describe('invalidateEntityStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetStatusRequestCache();
        useAppStore.setState({ statusByEntity: {}, client: {} as never });
    });

    it('drops the cached value', () => {
        useAppStore.setState({ statusByEntity: { 'apps:talker': 'ready' } });
        useAppStore.getState().invalidateEntityStatus('apps', 'talker');
        expect(useAppStore.getState().statusByEntity[entityStatusKey('apps', 'talker')]).toBe('unknown');
    });

    it('a read issued before the invalidation cannot restore the old value', async () => {
        // This is the read the control's own mount effect (or the refresh loop)
        // had in flight when the transition was dispatched.
        let settle: (value: unknown) => void = () => {};
        getStatusMock.mockReturnValue(new Promise((resolve) => (settle = resolve)) as never);
        const inFlight = useAppStore.getState().fetchEntityStatus('apps', 'talker');

        useAppStore.getState().invalidateEntityStatus('apps', 'talker');
        settle({ data: { status: 'ready' }, response: { status: 200 } });
        await inFlight;

        expect(useAppStore.getState().statusByEntity[entityStatusKey('apps', 'talker')]).toBe('unknown');
    });

    it('the next read after an invalidation is a fresh request', async () => {
        getStatusMock.mockReturnValue(new Promise(() => {}) as never);
        void useAppStore.getState().fetchEntityStatus('apps', 'talker');
        expect(getStatusMock).toHaveBeenCalledTimes(1);

        useAppStore.getState().invalidateEntityStatus('apps', 'talker');
        getStatusMock.mockResolvedValue({ data: { status: 'notReady' }, response: { status: 200 } } as never);
        await useAppStore.getState().fetchEntityStatus('apps', 'talker');

        expect(getStatusMock).toHaveBeenCalledTimes(2);
        expect(useAppStore.getState().statusByEntity[entityStatusKey('apps', 'talker')]).toBe('notReady');
    });
});

describe('actuationSupported', () => {
    it('defaults to null and setActuationSupported updates it', () => {
        useAppStore.setState({ actuationSupported: null });
        useAppStore.getState().setActuationSupported(false);
        expect(useAppStore.getState().actuationSupported).toBe(false);
    });
    it('disconnect resets the flag to null', () => {
        useAppStore.setState({ actuationSupported: false });
        useAppStore.getState().disconnect();
        expect(useAppStore.getState().actuationSupported).toBeNull();
    });
});
