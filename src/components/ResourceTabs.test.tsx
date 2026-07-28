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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isResourceTabId, renderResourceTabContent, RESOURCE_TABS, SCRIPTS_TAB } from './ResourceTabs';

vi.mock('@/components/ScriptsPanel', () => ({
    ScriptsPanel: ({ entityId, entityType }: { entityId: string; entityType: string }) => (
        <div data-testid="scripts-panel">{`${entityType}:${entityId}`}</div>
    ),
}));

describe('isResourceTabId', () => {
    it('accepts scripts', () => expect(isResourceTabId('scripts')).toBe(true));
    it('rejects unknown ids', () => expect(isResourceTabId('nope')).toBe(false));
});

describe('RESOURCE_TABS', () => {
    it('does not include scripts so areas and functions never show it', () => {
        expect(RESOURCE_TABS.map((t) => t.id)).toEqual(['data', 'operations', 'configurations', 'faults', 'logs']);
        expect(SCRIPTS_TAB.id).toBe('scripts');
    });
});

describe('renderResourceTabContent for scripts', () => {
    it.each(['apps', 'components'] as const)('renders the scripts panel for %s', (entityType) => {
        render(<>{renderResourceTabContent('scripts', 'e1', entityType)}</>);
        expect(screen.getByTestId('scripts-panel')).toHaveTextContent(`${entityType}:e1`);
    });

    it.each(['areas', 'functions'] as const)('renders nothing for %s', (entityType) => {
        const { container } = render(<>{renderResourceTabContent('scripts', 'e1', entityType)}</>);
        expect(container).toBeEmptyDOMElement();
    });
});
