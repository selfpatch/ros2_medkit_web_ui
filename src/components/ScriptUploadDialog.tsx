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

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { scriptErrorMessage } from '@/lib/scripts';
import { hasExtension, templateFor } from '@/lib/script-language';
import type { ScriptEntityType, ScriptUploadMetadata } from '@/lib/types';

// Defined once at module scope: creating the lazy wrapper inside the component
// would hand React a new component identity on every render and remount the
// editor (and its internal CodeMirror state) each time.
const ScriptEditor = lazy(() => import('@/components/ScriptEditor'));

type DialogMode = 'upload' | 'write';

interface ScriptUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityId: string;
    entityType: ScriptEntityType;
    onUploaded: () => void;
}

/**
 * Dialog for adding a new script to an app or component, either by uploading
 * a file that already exists on disk or by writing one directly in the
 * browser with a CodeMirror editor.
 *
 * The gateway exposes no flag telling the UI whether uploads are enabled, so
 * the Upload button is always available and a rejected request (400 disabled,
 * 413 too large, ...) is the only signal. Errors are shown inline and the
 * dialog stays open on failure so the user can pick a different file (or
 * fix what they wrote), without losing what they already typed.
 */
export function ScriptUploadDialog({ open, onOpenChange, entityId, entityType, onUploaded }: ScriptUploadDialogProps) {
    const uploadScript = useAppStore((state) => state.uploadScript);

    const [mode, setMode] = useState<DialogMode>('upload');

    const [file, setFile] = useState<File | null>(null);

    const [writeFileName, setWriteFileName] = useState('');
    const [writeContent, setWriteContent] = useState('');
    // True once the user has actually typed in the editor. Guards the
    // auto-template effect below: it may fill a still-pristine editor when
    // the file name changes, but must never clobber real content.
    const contentTouchedRef = useRef(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setMode('upload');
            setFile(null);
            setWriteFileName('');
            setWriteContent('');
            contentTouchedRef.current = false;
            setName('');
            setDescription('');
            setError(null);
            setSubmitting(false);
        }
    }, [open]);

    // Seeds the editor with a starter template while it is still pristine.
    // Runs again whenever the file name changes so that switching a name
    // between, say, check.py and check.sh keeps the template's language in
    // sync - but only until the user actually types, at which point
    // contentTouchedRef stops it from ever overwriting their work.
    useEffect(() => {
        if (mode !== 'write') return;
        if (contentTouchedRef.current) return;
        setWriteContent(templateFor(writeFileName));
    }, [mode, writeFileName]);

    const switchMode = (next: DialogMode) => {
        if (next === mode) return;
        setMode(next);
        setFile(null);
        setWriteFileName('');
        setWriteContent('');
        contentTouchedRef.current = false;
        setError(null);
    };

    const handleContentChange = (value: string) => {
        contentTouchedRef.current = true;
        setWriteContent(value);
        setError(null);
    };

    const metadataFor = (): ScriptUploadMetadata | undefined => {
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        return trimmedName || trimmedDescription
            ? { name: trimmedName || undefined, description: trimmedDescription || undefined }
            : undefined;
    };

    const submitFile = async (fileToUpload: File) => {
        const metadata = metadataFor();
        setSubmitting(true);
        try {
            if (metadata) {
                await uploadScript(entityType, entityId, fileToUpload, metadata);
            } else {
                await uploadScript(entityType, entityId, fileToUpload);
            }
            onUploaded();
            onOpenChange(false);
        } catch (err) {
            setError(scriptErrorMessage(err, 'Upload failed'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleUploadSubmit = async () => {
        if (!file) return;
        setError(null);

        // The gateway does not reject an empty file; it would store it as an
        // unusable script, so catch it here before the request is made.
        if (file.size === 0) {
            setError('The selected file is empty');
            return;
        }

        await submitFile(file);
    };

    const handleWriteSubmit = async () => {
        setError(null);

        if (writeContent.trim() === '') {
            setError('Script content is empty');
            return;
        }
        const trimmedFileName = writeFileName.trim();
        if (!hasExtension(trimmedFileName)) {
            setError('File name needs an extension, e.g. check.sh or check.py');
            return;
        }

        const file = new File([writeContent], trimmedFileName, { type: 'text/plain' });
        await submitFile(file);
    };

    const handleSubmit = () => (mode === 'write' ? handleWriteSubmit() : handleUploadSubmit());

    const submitDisabled =
        submitting || (mode === 'write' ? !writeFileName.trim() || writeContent.length === 0 : !file);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next || submitting) return;
                onOpenChange(false);
            }}
        >
            <DialogContent
                className="max-h-[80vh] overflow-y-auto"
                onEscapeKeyDown={(e) => submitting && e.preventDefault()}
                onPointerDownOutside={(e) => submitting && e.preventDefault()}
                onInteractOutside={(e) => submitting && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Upload Script</DialogTitle>
                    <DialogDescription>
                        {mode === 'write'
                            ? 'Write a new script for this entity. Name and description are optional and shown alongside the script.'
                            : 'Upload a new script file for this entity. Name and description are optional and shown alongside the script.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="flex gap-1 rounded-md border p-1">
                        <Button
                            type="button"
                            variant={mode === 'upload' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="flex-1"
                            disabled={submitting}
                            onClick={() => switchMode('upload')}
                        >
                            From file
                        </Button>
                        <Button
                            type="button"
                            variant={mode === 'write' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="flex-1"
                            disabled={submitting}
                            onClick={() => switchMode('write')}
                        >
                            Write script
                        </Button>
                    </div>

                    {mode === 'upload' ? (
                        <div>
                            <Label htmlFor="script-upload-file">File</Label>
                            <input
                                id="script-upload-file"
                                type="file"
                                onChange={(e) => {
                                    setFile(e.target.files?.[0] ?? null);
                                    setError(null);
                                }}
                                aria-invalid={!!error}
                                aria-describedby={error ? 'script-upload-error' : undefined}
                                className="border-input file:text-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent text-sm shadow-xs outline-none file:mr-3 file:h-full file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    ) : (
                        <>
                            <div>
                                <Label htmlFor="script-write-filename">File name</Label>
                                <Input
                                    id="script-write-filename"
                                    placeholder="check-sensors.sh"
                                    value={writeFileName}
                                    onChange={(e) => {
                                        setWriteFileName(e.target.value);
                                        setError(null);
                                    }}
                                    aria-invalid={!!error}
                                    aria-describedby={error ? 'script-upload-error' : undefined}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    The extension selects the interpreter: .py runs under python3, .bash under bash,
                                    anything else under sh.
                                </p>
                            </div>
                            <div>
                                {/* Not htmlFor-associated: CodeMirror's contenteditable carries its
                                    own accessible name via ScriptEditor's ariaLabel prop, so this is
                                    a plain visual caption rather than a functional label target. */}
                                <Label>Script</Label>
                                <Suspense fallback={<div className="h-[240px] w-full rounded-md border bg-muted/30" />}>
                                    <ScriptEditor
                                        value={writeContent}
                                        onChange={handleContentChange}
                                        filename={writeFileName}
                                        // Not just "Script": that is a substring of "Description"
                                        // ("de-script-ion"), which made the two fields ambiguous
                                        // under substring-based accessible-name matching.
                                        ariaLabel="Script content"
                                        disabled={submitting}
                                    />
                                </Suspense>
                            </div>
                        </>
                    )}

                    <div>
                        <Label htmlFor="script-upload-name">Name</Label>
                        <Input id="script-upload-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="script-upload-description">Description</Label>
                        <Input
                            id="script-upload-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                    {error && (
                        <p id="script-upload-error" role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={submitDisabled}>
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            'Upload'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
