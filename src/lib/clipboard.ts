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

/**
 * Copy text to the clipboard; true when it got there.
 *
 * The Clipboard API exists only in secure contexts, and a gateway's web UI is often served
 * over plain http on a robot's address, where `navigator.clipboard` is undefined. There the
 * text goes through a selected, off-screen text field and the older copy command, which
 * browsers still honour inside a user gesture.
 */
export async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Refused (no permission, document not focused): try the old way below
        }
    }
    return copyThroughSelection(text);
}

function copyThroughSelection(text: string): boolean {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.focus();
    field.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        field.remove();
        previous?.focus();
    }
}
