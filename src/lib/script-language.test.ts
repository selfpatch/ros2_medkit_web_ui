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

import { describe, it, expect } from 'vitest';
import { languageForFilename, hasExtension, templateFor } from './script-language';

describe('languageForFilename', () => {
    it('returns python for .py', () => {
        expect(languageForFilename('check.py')).toBe('python');
    });

    it('returns shell for .sh and .bash', () => {
        expect(languageForFilename('check.sh')).toBe('shell');
        expect(languageForFilename('check.bash')).toBe('shell');
    });

    it('returns plain for an unknown extension and for no extension', () => {
        expect(languageForFilename('check.exe')).toBe('plain');
        expect(languageForFilename('check')).toBe('plain');
    });

    it('is case insensitive', () => {
        expect(languageForFilename('Check.PY')).toBe('python');
        expect(languageForFilename('Check.SH')).toBe('shell');
        expect(languageForFilename('Check.BASH')).toBe('shell');
    });
});

describe('hasExtension', () => {
    it('accepts a name with a non-empty extension', () => {
        expect(hasExtension('check.sh')).toBe(true);
    });

    it('rejects a name with no dot', () => {
        expect(hasExtension('check')).toBe(false);
    });

    it('rejects a name ending in a dot', () => {
        expect(hasExtension('check.')).toBe(false);
    });

    it('rejects an empty name', () => {
        expect(hasExtension('')).toBe(false);
    });

    it('rejects a dotfile with no extension', () => {
        expect(hasExtension('.bashrc')).toBe(false);
    });
});

describe('templateFor', () => {
    it('returns a python template for a .py name', () => {
        const template = templateFor('check.py');
        expect(template).toContain('sys.stdin');
    });

    it('returns a bash template otherwise', () => {
        const template = templateFor('check.sh');
        expect(template).toContain('cat');
    });
});
