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

import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import type { Extension } from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { languageForFilename } from '@/lib/script-language';

interface ScriptEditorProps {
    value: string;
    onChange: (value: string) => void;
    filename: string;
    /**
     * Accessible name for the editor's contenteditable region. CodeMirror's
     * content element is the one that actually carries the textbox role, so
     * a wrapping <label htmlFor> does nothing for it - the name has to be
     * applied here, through the contentAttributes facet below.
     */
    ariaLabel: string;
    disabled?: boolean;
}

/**
 * Thin wrapper around `@uiw/react-codemirror` used by the Write script mode of
 * the upload dialog. Default export so it can be lazily imported and kept out
 * of the main bundle.
 */
export default function ScriptEditor({ value, onChange, filename, ariaLabel, disabled }: ScriptEditorProps) {
    const language = languageForFilename(filename);
    const extensions = useMemo<Extension[]>(() => {
        const nameExtension = EditorView.contentAttributes.of({ 'aria-label': ariaLabel });
        if (language === 'python') return [python(), nameExtension];
        if (language === 'shell') return [StreamLanguage.define(shell), nameExtension];
        return [nameExtension];
    }, [language, ariaLabel]);

    return (
        <div data-testid="script-editor">
            <CodeMirror
                value={value}
                onChange={onChange}
                height="240px"
                theme="light"
                extensions={extensions}
                editable={!disabled}
                // Tab must move focus to the next dialog control, not indent -
                // this is a modal, not a code-writing surface, and the usual
                // Escape-then-Tab escape hatch closes the dialog instead since
                // Escape isn't blocked here (see ScriptUploadDialog).
                indentWithTab={false}
                basicSetup={{ lineNumbers: true, autocompletion: false }}
            />
        </div>
    );
}
