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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseBulkDataUri, saveBlob } from './bulk-data';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('parseBulkDataUri', () => {
    it('reads the entity, the category and the id out of a recording address', () => {
        expect(parseBulkDataUri('/apps/motor/bulk-data/rosbags/rb-1')).toEqual({
            entityType: 'apps',
            entityId: 'motor',
            category: 'rosbags',
            id: 'rb-1',
        });
        expect(parseBulkDataUri('/components/base/bulk-data/rosbags/a/b')).toEqual({
            entityType: 'components',
            entityId: 'base',
            category: 'rosbags',
            id: 'a/b',
        });
    });

    it('reads nothing out of an address of another shape', () => {
        expect(parseBulkDataUri('')).toBeNull();
        expect(parseBulkDataUri('/robots/motor/bulk-data/rosbags/rb-1')).toBeNull();
        expect(parseBulkDataUri('/apps/motor/data/rosbags/rb-1')).toBeNull();
        expect(parseBulkDataUri('/apps/motor/bulk-data/rosbags/')).toBeNull();
    });
});

describe('saveBlob', () => {
    it('saves the blob under its name through a link it leaves no trace of', () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/1');
        const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement
        ) {
            expect(this.download).toBe('MOTOR_OVERHEAT.mcap');
            expect(this.href).toBe('blob:http://localhost/1');
            expect(this.isConnected).toBe(true);
        });

        saveBlob(new Blob(['bag']), 'MOTOR_OVERHEAT.mcap');

        expect(clicked).toHaveBeenCalledTimes(1);
        expect(revoked).toHaveBeenCalledWith('blob:http://localhost/1');
        expect(document.querySelector('a[download]')).toBeNull();
    });
});
