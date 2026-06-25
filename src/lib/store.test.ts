import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock api-dispatch so the store's getStatus call hits our spy. A namespace
// spy (vi.spyOn) does not patch the store's named-import binding, so mock the
// module instead and drive the return value per-test.
vi.mock('./api-dispatch', () => ({
    getStatus: vi.fn(),
    setStatus: vi.fn(),
}));

import { useAppStore, entityStatusKey } from './store';
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
