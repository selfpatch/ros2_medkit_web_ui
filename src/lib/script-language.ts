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
 * `.py` runs under python3, `.bash` under bash, and everything else -
 * including no extension at all - under sh. `languageForFilename` does not
 * mirror that split one-to-one: `.sh` and `.bash` both highlight as `shell`,
 * since both are shell syntax, but an unrecognised extension (or none)
 * returns `plain` rather than guessing `shell` too. The file would still run
 * under sh either way, but highlighting arbitrary, unrecognised content as
 * shell would be wrong often enough to mislead - sh is just the gateway's
 * fallback for "could be anything", not a signal that it looks like shell.
 */
export type ScriptLanguage = 'python' | 'shell' | 'plain';

/**
 * Last path segment of `filename`. `extensionOf` must look here rather than
 * at the whole string: a name like `my.dir/check` has a dot before the last
 * separator but no extension at all, and reading the extension from the full
 * string would report `dir/check` as one.
 */
function lastPathSegment(filename: string): string {
    const separator = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
    return separator === -1 ? filename : filename.slice(separator + 1);
}

function extensionOf(filename: string): string {
    const base = lastPathSegment(filename);
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return '';
    return base.slice(dot + 1).toLowerCase();
}

/**
 * True when `filename` is a plain basename: non-empty, containing no forward
 * or back slash, and not `.` or `..`. Write mode puts this string verbatim
 * into the multipart upload's filename field, which the gateway uses to name
 * a file - and ultimately an executable script - on the robot; this repo
 * must reject anything that looks like a path before it ever reaches that
 * request, regardless of what the gateway itself does with it afterwards.
 */
export function isPlainBasename(filename: string): boolean {
    if (filename === '' || filename === '.' || filename === '..') return false;
    return !filename.includes('/') && !filename.includes('\\');
}

export function languageForFilename(filename: string): ScriptLanguage {
    const ext = extensionOf(filename);
    if (ext === 'py') return 'python';
    if (ext === 'sh' || ext === 'bash') return 'shell';
    return 'plain';
}

/**
 * True when `filename` has a non-empty extension after a non-leading dot in
 * its last path segment. A leading dot alone (`.bashrc`) does not count: the
 * gateway needs a real suffix to pick an interpreter, not a hidden-file
 * marker. Does not by itself guarantee `filename` is a safe upload name -
 * pair with `isPlainBasename` for that.
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
