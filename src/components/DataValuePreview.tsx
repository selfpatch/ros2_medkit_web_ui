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

import type { ComponentTopic } from '@/lib/types';

const MAX_LENGTH = 60;

/** One-line value of a data item for a list row. Renders nothing when the item has no value. */
export function DataValuePreview({ topic }: { topic: ComponentTopic }) {
    if (topic.status !== 'data' || topic.data === undefined) return null;
    const full = typeof topic.data === 'string' ? topic.data : JSON.stringify(topic.data);
    const text = full.length > MAX_LENGTH ? `${full.slice(0, MAX_LENGTH - 1)}…` : full;
    return (
        <span className="font-mono text-xs text-foreground truncate max-w-[240px]" title={full}>
            {text}
        </span>
    );
}
