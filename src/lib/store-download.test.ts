// Copyright 2026 mfaferek93
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

import { describe, expect, it } from 'vitest';

import { filenameFromContentDisposition } from './store';

describe('filenameFromContentDisposition', () => {
    it('takes the quoted filename the gateway sends for a rosbag', () => {
        // The extension is the point: only the server knows the storage format,
        // and a bag saved without `.mcap` is one the OS and `ros2 bag play`
        // cannot open until the user renames it by hand.
        expect(filenameFromContentDisposition('attachment; filename="fault_MOTOR_OVERHEAT_1738664999000.mcap"')).toBe(
            'fault_MOTOR_OVERHEAT_1738664999000.mcap'
        );
    });

    it('accepts an unquoted filename', () => {
        expect(filenameFromContentDisposition('attachment; filename=bag.db3')).toBe('bag.db3');
    });

    it('prefers the RFC 5987 form, which is the one that survives non-ASCII', () => {
        expect(
            filenameFromContentDisposition('attachment; filename="fallback.mcap"; filename*=UTF-8\'\'r%C3%B6ntgen.mcap')
        ).toBe('röntgen.mcap');
    });

    it('falls back to the plain form when the extended one is malformed', () => {
        // A truncated percent-escape throws inside decodeURIComponent; the plain
        // filename is still perfectly usable and must not be lost with it.
        expect(filenameFromContentDisposition('attachment; filename="good.mcap"; filename*=UTF-8\'\'bad%ZZ')).toBe(
            'good.mcap'
        );
    });

    it('returns null rather than a filename when the header says nothing', () => {
        // Null is what lets the caller fall back to the recording id. Returning
        // an empty string here would save the file as "" instead.
        expect(filenameFromContentDisposition(null)).toBeNull();
        expect(filenameFromContentDisposition('attachment')).toBeNull();
        expect(filenameFromContentDisposition('attachment; filename=""')).toBeNull();
    });

    it('is case-insensitive about the parameter name', () => {
        expect(filenameFromContentDisposition('attachment; FileName="x.mcap"')).toBe('x.mcap');
    });
});
