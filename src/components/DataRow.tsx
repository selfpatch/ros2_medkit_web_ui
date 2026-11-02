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

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface DataRowProps {
    /** The topic */
    name: string;
    /** Its message type, under the name */
    type?: string;
    onSelect: () => void;
    /** Before the name: an icon, or whether the app publishes or subscribes the topic */
    lead?: ReactNode;
    /** After the name: the last value */
    preview?: ReactNode;
}

/**
 * A data item as a row of a RowGrid that opens it. The grid draws the line between rows as
 * each row's outline, so the row has no `outline-none` and takes focus through its
 * `focus-visible:` outline classes only.
 */
export function DataRow({ name, type, onSelect, lead, preview }: DataRowProps) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="group flex min-w-0 items-center gap-3 bg-white px-4 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
            {lead}
            <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] text-foreground">{name}</span>
                {type !== undefined && <span className="block truncate text-xs text-faint">{type}</span>}
            </span>
            {preview}
            <ChevronRight
                className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
            />
        </button>
    );
}

/** The tree path of an entity's data item: its topic without the leading slash, encoded as one segment */
// eslint-disable-next-line react-refresh/only-export-components
export function topicPathOf(entityPath: string, topic: string): string {
    const name = topic.startsWith('/') ? topic.slice(1) : topic;
    return `${entityPath}/data/${encodeURIComponent(name)}`;
}
