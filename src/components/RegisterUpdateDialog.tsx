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

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export interface RegisterUpdateBody {
    id: string;
    update_name?: string;
    automated?: boolean;
    [key: string]: unknown;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSubmit: (body: RegisterUpdateBody) => Promise<void>;
}

export function RegisterUpdateDialog({ open, onClose, onSubmit }: Props) {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [automated, setAutomated] = useState(false);
    const [metadata, setMetadata] = useState('{}');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setError(null);
        if (!id.trim()) {
            setError('id is required');
            return;
        }
        let extras: Record<string, unknown> = {};
        if (metadata.trim()) {
            try {
                const parsed = JSON.parse(metadata);
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    throw new Error('not an object');
                }
                extras = parsed as Record<string, unknown>;
            } catch {
                setError('invalid JSON in additional metadata');
                return;
            }
        }
        const body: RegisterUpdateBody = { id: id.trim(), ...extras };
        body.update_name = name.trim() || id.trim();
        if (automated) body.automated = true;
        setSubmitting(true);
        try {
            await onSubmit(body);
            setId('');
            setName('');
            setAutomated(false);
            setMetadata('{}');
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register Update</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="reg-id">id</Label>
                        <Input id="reg-id" value={id} onChange={(e) => setId(e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor="reg-name">name</Label>
                        <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox id="reg-auto" checked={automated} onCheckedChange={(v) => setAutomated(v === true)} />
                        <Label htmlFor="reg-auto">automated</Label>
                    </div>
                    <div>
                        <Label htmlFor="reg-meta">additional metadata (JSON)</Label>
                        <Textarea
                            id="reg-meta"
                            rows={6}
                            value={metadata}
                            onChange={(e) => setMetadata(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        Register
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
