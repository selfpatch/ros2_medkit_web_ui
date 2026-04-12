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
import {
    fetchUpdateIds,
    fetchUpdateStatus,
    fetchUpdateDetail,
    triggerPrepare,
    triggerExecute,
    triggerAutomated,
    deleteUpdate,
    UpdatesApiError,
} from './updates-api';

const BASE = 'http://localhost:8080/api/v1';

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('fetchUpdateIds', () => {
    it('returns array of IDs on success', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ items: ['fw-v2', 'fw-v3'] }), { status: 200 })
        );
        const ids = await fetchUpdateIds(BASE);
        expect(ids).toEqual(['fw-v2', 'fw-v3']);
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates`, { signal: undefined });
    });

    it('returns empty array when no updates', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        const ids = await fetchUpdateIds(BASE);
        expect(ids).toEqual([]);
    });

    it('throws UpdatesApiError with status 501 when backend not configured', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error_code: 'not_implemented', message: 'not configured' }), { status: 501 })
        );
        await expect(fetchUpdateIds(BASE)).rejects.toThrow(UpdatesApiError);
        await expect(fetchUpdateIds(BASE)).rejects.toMatchObject({ status: 501 });
    });

    it('passes AbortSignal to fetch', async () => {
        const controller = new AbortController();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        await fetchUpdateIds(BASE, controller.signal);
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates`, { signal: controller.signal });
    });
});

describe('fetchUpdateStatus', () => {
    it('returns status object on success', async () => {
        const status = { status: 'inProgress', progress: 45 };
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }));
        const result = await fetchUpdateStatus(BASE, 'fw-v2');
        expect(result).toEqual(status);
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates/fw-v2/status`, { signal: undefined });
    });

    it('throws on 404 (update not found)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
        );
        await expect(fetchUpdateStatus(BASE, 'missing')).rejects.toThrow(UpdatesApiError);
    });
});

describe('fetchUpdateDetail', () => {
    it('returns arbitrary JSON detail object', async () => {
        const detail = { id: 'fw-v2', custom_field: 'value', nested: { a: 1 } };
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));
        const result = await fetchUpdateDetail(BASE, 'fw-v2');
        expect(result).toEqual(detail);
    });
});

describe('triggerPrepare', () => {
    it('sends PUT and resolves on 202', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
        await expect(triggerPrepare(BASE, 'fw-v2')).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates/fw-v2/prepare`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
    });

    it('throws on 409 (already in progress)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ message: 'in progress' }), { status: 409 })
        );
        await expect(triggerPrepare(BASE, 'fw-v2')).rejects.toMatchObject({ status: 409 });
    });
});

describe('triggerExecute', () => {
    it('sends PUT and resolves on 202', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
        await expect(triggerExecute(BASE, 'fw-v2')).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates/fw-v2/execute`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
    });
});

describe('triggerAutomated', () => {
    it('sends PUT and resolves on 202', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
        await expect(triggerAutomated(BASE, 'fw-v2')).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates/fw-v2/automated`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
    });
});

describe('deleteUpdate', () => {
    it('sends DELETE and resolves on 204', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
        await expect(deleteUpdate(BASE, 'fw-v2')).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledWith(`${BASE}/updates/fw-v2`, { method: 'DELETE' });
    });

    it('throws on 409 (in progress)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ message: 'in progress' }), { status: 409 })
        );
        await expect(deleteUpdate(BASE, 'fw-v2')).rejects.toMatchObject({ status: 409 });
    });
});
