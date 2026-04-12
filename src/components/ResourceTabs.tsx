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
import { AlertTriangle, Database, ScrollText, Settings, Zap } from 'lucide-react';
import { ConfigurationPanel } from '@/components/ConfigurationPanel';
import { FaultsPanel } from '@/components/FaultsPanel';
import { LogsPanel } from '@/components/LogsPanel';
import { OperationsPanel } from '@/components/OperationsPanel';
import type { SovdResourceEntityType } from '@/lib/types';

/**
 * Shared resource-tab metadata for the per-entity tab bar.
 *
 * Each entity-detail panel (AppsPanel, FunctionsPanel, AreasPanel via
 * EntityResourceTabs, EntityDetailPanel component view) merges these
 * configs into its own flat tab bar so Data / Operations / Configurations
 * / Faults / Logs stay consistent across entity types.
 *
 * The `data` tab is listed here for visibility in the bar, but its content
 * rendering stays per-panel because each entity type displays data
 * differently (apps: topics list, components: DataTabContent grid,
 * areas: aggregated grid). The helper `renderResourceTabContent` below
 * therefore only handles operations / configurations / faults / logs;
 * callers are responsible for rendering their own data tab content.
 */

export type ResourceTabId = 'data' | 'operations' | 'configurations' | 'faults' | 'logs';

export interface ResourceTabConfig {
    id: ResourceTabId;
    label: string;
    icon: typeof Database;
}

export const RESOURCE_TABS: ResourceTabConfig[] = [
    { id: 'data', label: 'Data', icon: Database },
    { id: 'operations', label: 'Operations', icon: Zap },
    { id: 'configurations', label: 'Config', icon: Settings },
    { id: 'faults', label: 'Faults', icon: AlertTriangle },
    { id: 'logs', label: 'Logs', icon: ScrollText },
];

export function isResourceTabId(id: string): id is ResourceTabId {
    return id === 'data' || id === 'operations' || id === 'configurations' || id === 'faults' || id === 'logs';
}

/**
 * Render the shared content for a resource tab.
 *
 * Returns `null` for the `data` tab - callers must render their own
 * data tab content (see docblock above).
 */
export function renderResourceTabContent(
    tab: ResourceTabId,
    entityId: string,
    entityType: SovdResourceEntityType
): ReactNode {
    switch (tab) {
        case 'operations':
            return <OperationsPanel entityId={entityId} entityType={entityType} />;
        case 'configurations':
            return <ConfigurationPanel entityId={entityId} entityType={entityType} />;
        case 'faults':
            return <FaultsPanel entityId={entityId} entityType={entityType} />;
        case 'logs':
            return <LogsPanel entityId={entityId} entityType={entityType} />;
        case 'data':
            return null;
    }
}
