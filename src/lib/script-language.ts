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
 * The gateway picks the interpreter from the uploaded file's extension:
 * `.py` runs under python3, `.bash` under bash, and everything else - including
 * no extension at all - under sh. `languageForFilename` mirrors that split so
 * the editor's syntax highlighting matches what will actually execute.
 */
export type ScriptLanguage = 'python' | 'shell' | 'plain';

function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0 || dot === filename.length - 1) return '';
    return filename.slice(dot + 1).toLowerCase();
}

export function languageForFilename(filename: string): ScriptLanguage {
    const ext = extensionOf(filename);
    if (ext === 'py') return 'python';
    if (ext === 'sh' || ext === 'bash') return 'shell';
    return 'plain';
}

/**
 * True when `filename` has a non-empty extension after a non-leading dot.
 * A leading dot alone (`.bashrc`) does not count: the gateway needs a real
 * suffix to pick an interpreter, not a hidden-file marker.
 */
export function hasExtension(filename: string): boolean {
    return extensionOf(filename) !== '';
}

const PYTHON_TEMPLATE = `#!/usr/bin/env python3
import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    params = json.loads(raw) if raw.strip() else {}
    result = {"received": params}
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

const SHELL_TEMPLATE = `#!/bin/sh
set -eu

params=$(cat)

printf '{"received": %s}\\n' "\${params:-null}"
`;

/**
 * Starter content for write mode. Parameters entered in the Run form reach a
 * script as JSON on stdin, never as argv, and the gateway discards stdout
 * entirely when a script exits non-zero - so the template must read stdin,
 * print JSON on stdout, and exit zero, or it teaches the wrong thing.
 */
export function templateFor(filename: string): string {
    return languageForFilename(filename) === 'python' ? PYTHON_TEMPLATE : SHELL_TEMPLATE;
}
