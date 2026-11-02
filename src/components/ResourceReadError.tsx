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

import { Button } from '@/components/ui/button';

interface ResourceReadErrorProps {
    /** What could not be read, as the sentence names it: "topics", "operations" */
    what: string;
    /** Why, as the read failed */
    reason: string;
    onRetry: () => void;
}

/**
 * A resource that could not be read, where its list or its empty state would be: an empty
 * list there would say the entity has none, which nobody knows.
 */
export function ResourceReadError({ what, reason, onRetry }: ResourceReadErrorProps) {
    return (
        <div
            role="alert"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-6 text-center text-sm"
        >
            <span className="text-destructive">
                Could not load {what}: {reason}
            </span>
            <Button variant="outline" size="sm" className="h-8" onClick={onRetry}>
                Retry
            </Button>
        </div>
    );
}

/** The words of a failed read, from an Error or whatever else was thrown */
// eslint-disable-next-line react-refresh/only-export-components
export function readFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
