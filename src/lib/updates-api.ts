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

import type { UpdateStatus } from './types';

/**
 * Error thrown by updates API helpers.
 * Carries the HTTP status code for callers to distinguish
 * 501 (no backend) from other errors.
 */
export class UpdatesApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'UpdatesApiError';
        this.status = status;
    }
}

async function ensureOk(res: Response): Promise<void> {
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const body = await res.json();
            if (body.message) message = body.message;
        } catch {
            // ignore parse errors
        }
        throw new UpdatesApiError(message, res.status);
    }
}

/** GET /updates - returns list of update IDs */
export async function fetchUpdateIds(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(`${baseUrl}/updates`, { signal });
    await ensureOk(res);
    const data: { items: string[] } = await res.json();
    return data.items;
}

/** GET /updates/{id}/status - returns update status with progress */
export async function fetchUpdateStatus(baseUrl: string, id: string, signal?: AbortSignal): Promise<UpdateStatus> {
    const res = await fetch(`${baseUrl}/updates/${id}/status`, { signal });
    await ensureOk(res);
    return res.json();
}

/** GET /updates/{id} - returns plugin-defined detail object */
export async function fetchUpdateDetail(
    baseUrl: string,
    id: string,
    signal?: AbortSignal
): Promise<Record<string, unknown>> {
    const res = await fetch(`${baseUrl}/updates/${id}`, { signal });
    await ensureOk(res);
    return res.json();
}

/** PUT /updates/{id}/prepare - start preparation (202) */
export async function triggerPrepare(baseUrl: string, id: string): Promise<void> {
    const res = await fetch(`${baseUrl}/updates/${id}/prepare`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    await ensureOk(res);
}

/** PUT /updates/{id}/execute - start execution (202) */
export async function triggerExecute(baseUrl: string, id: string): Promise<void> {
    const res = await fetch(`${baseUrl}/updates/${id}/execute`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    await ensureOk(res);
}

/** PUT /updates/{id}/automated - start automated update (202) */
export async function triggerAutomated(baseUrl: string, id: string): Promise<void> {
    const res = await fetch(`${baseUrl}/updates/${id}/automated`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    });
    await ensureOk(res);
}

/** DELETE /updates/{id} - remove update (204) */
export async function deleteUpdate(baseUrl: string, id: string): Promise<void> {
    const res = await fetch(`${baseUrl}/updates/${id}`, { method: 'DELETE' });
    await ensureOk(res);
}
