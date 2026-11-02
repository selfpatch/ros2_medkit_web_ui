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

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
    /** h3 for a section of the view, h4 for a section inside a tab's own section */
    as?: 'h3' | 'h4';
}

/**
 * A section's heading inside a view, in small Inter: index.css gives h1-h3 the display face,
 * which belongs to page titles and figures, not to the labels of a view's parts.
 */
export function SectionHeading({ as: Tag = 'h3', className, ...props }: SectionHeadingProps) {
    return (
        <Tag
            className={cn(
                'flex items-center gap-2 font-sans text-[13px] font-semibold tracking-normal text-foreground',
                className
            )}
            {...props}
        />
    );
}
