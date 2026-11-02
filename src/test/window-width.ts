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

import { act } from '@testing-library/react';

const realMatchMedia = window.matchMedia;

/**
 * jsdom has no matchMedia: a window as wide as the test says (every query answers `desktop`),
 * resizable mid-test. Call `restoreWindowWidth` after the test.
 */
export function stubWindowWidth(desktop: boolean) {
    let wide = desktop;
    const listeners = new Set<() => void>();
    const queries: string[] = [];
    window.matchMedia = (query: string) => {
        queries.push(query);
        return {
            get matches() {
                return wide;
            },
            media: query,
            addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        } as unknown as MediaQueryList;
    };
    return {
        queries,
        listeners,
        resize(next: boolean) {
            wide = next;
            act(() => listeners.forEach((listener) => listener()));
        },
    };
}

export function restoreWindowWidth() {
    window.matchMedia = realMatchMedia;
}
