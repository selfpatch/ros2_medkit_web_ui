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

import { useCallback, useRef, useState, type RefCallback } from 'react';

/**
 * Something measured of an element (its width, whether the layout shows it), measured
 * again as it resizes. A callback ref, so the element can come and go with its data.
 * `measure` must keep its identity across renders (a module-level function); `empty`
 * stands while there is no element.
 */
export function useMeasured<T extends HTMLElement, V>(measure: (node: T) => V, empty: V): [RefCallback<T>, V] {
    const [value, setValue] = useState(empty);
    const watching = useRef<ResizeObserver | null>(null);
    const ref = useCallback(
        (node: T | null) => {
            watching.current?.disconnect();
            watching.current = null;
            if (!node) {
                setValue(empty);
                return;
            }
            const observer = new ResizeObserver(() => setValue(measure(node)));
            observer.observe(node);
            watching.current = observer;
        },
        [measure, empty]
    );
    return [ref, value];
}
