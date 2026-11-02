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

import type { SovdResourceEntityType } from '@/lib/types';

/** The parts of a bulk-data address, as the store's `downloadBulkData` takes them */
export interface BulkDataTarget {
    entityType: SovdResourceEntityType;
    entityId: string;
    category: string;
    id: string;
}

/** "/apps/motor/bulk-data/rosbags/rb-1" → its parts; null for an address of another shape */
export function parseBulkDataUri(uri: string): BulkDataTarget | null {
    const match = uri.match(/^\/(apps|components|areas|functions)\/([^/]+)\/bulk-data\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
        entityType: match[1] as SovdResourceEntityType,
        entityId: match[2]!,
        category: match[3]!,
        id: match[4]!,
    };
}

/** Hands a downloaded blob to the browser to save under `filename` */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
