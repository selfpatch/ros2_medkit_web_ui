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

/**
 * Entity-type dispatch helpers for the generated openapi-fetch client.
 *
 * The generated client uses per-entity-type paths (/apps/{app_id}/configurations,
 * /components/{component_id}/configurations, etc.) rather than generic
 * /{entity_type}/{entity_id}/... paths. These helpers route calls to the correct
 * typed path based on the entity type string.
 */

import type { MedkitClient } from '@selfpatch/ros2-medkit-client-ts';
import type { SovdResourceEntityType } from './types';
import type { LogsQueryParams, LogsConfiguration } from './log-types';

// =============================================================================
// Entity Detail
// =============================================================================

export function getEntityDetail(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}', { params: { path: { component_id: entityId } } });
        case 'areas':
            return client.GET('/areas/{area_id}', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}', { params: { path: { function_id: entityId } } });
    }
}

// =============================================================================
// Configurations
// =============================================================================

export function getEntityConfigurations(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/configurations', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}/configurations', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/configurations', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}/configurations', {
                params: { path: { function_id: entityId } },
            });
    }
}

export function getEntityConfiguration(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    configId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/configurations/{config_id}', {
                params: { path: { app_id: entityId, config_id: configId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/configurations/{config_id}', {
                params: { path: { component_id: entityId, config_id: configId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/configurations/{config_id}', {
                params: { path: { area_id: entityId, config_id: configId } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/configurations/{config_id}', {
                params: { path: { function_id: entityId, config_id: configId } },
            });
    }
}

export function putEntityConfiguration(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    configId: string,
    body: { value: unknown }
) {
    switch (entityType) {
        case 'apps':
            return client.PUT('/apps/{app_id}/configurations/{config_id}', {
                params: { path: { app_id: entityId, config_id: configId } },
                body,
            });
        case 'components':
            return client.PUT('/components/{component_id}/configurations/{config_id}', {
                params: { path: { component_id: entityId, config_id: configId } },
                body,
            });
        case 'areas':
            return client.PUT('/areas/{area_id}/configurations/{config_id}', {
                params: { path: { area_id: entityId, config_id: configId } },
                body,
            });
        case 'functions':
            return client.PUT('/functions/{function_id}/configurations/{config_id}', {
                params: { path: { function_id: entityId, config_id: configId } },
                body,
            });
    }
}

export function deleteEntityConfiguration(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    configId: string
) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/configurations/{config_id}', {
                params: { path: { app_id: entityId, config_id: configId } },
            });
        case 'components':
            return client.DELETE('/components/{component_id}/configurations/{config_id}', {
                params: { path: { component_id: entityId, config_id: configId } },
            });
        case 'areas':
            return client.DELETE('/areas/{area_id}/configurations/{config_id}', {
                params: { path: { area_id: entityId, config_id: configId } },
            });
        case 'functions':
            return client.DELETE('/functions/{function_id}/configurations/{config_id}', {
                params: { path: { function_id: entityId, config_id: configId } },
            });
    }
}

export function deleteEntityConfigurations(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/configurations', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.DELETE('/components/{component_id}/configurations', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.DELETE('/areas/{area_id}/configurations', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.DELETE('/functions/{function_id}/configurations', {
                params: { path: { function_id: entityId } },
            });
    }
}

// =============================================================================
// Data
// =============================================================================

export function getEntityData(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/data', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}/data', { params: { path: { component_id: entityId } } });
        case 'areas':
            return client.GET('/areas/{area_id}/data', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}/data', { params: { path: { function_id: entityId } } });
    }
}

export function getEntityDataItem(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    dataId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/data/{data_id}', {
                params: { path: { app_id: entityId, data_id: dataId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/data/{data_id}', {
                params: { path: { component_id: entityId, data_id: dataId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/data/{data_id}', {
                params: { path: { area_id: entityId, data_id: dataId } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/data/{data_id}', {
                params: { path: { function_id: entityId, data_id: dataId } },
            });
    }
}

export function putEntityDataItem(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    dataId: string,
    body: { value: unknown }
) {
    switch (entityType) {
        case 'apps':
            return client.PUT('/apps/{app_id}/data/{data_id}', {
                params: { path: { app_id: entityId, data_id: dataId } },
                body,
            });
        case 'components':
            return client.PUT('/components/{component_id}/data/{data_id}', {
                params: { path: { component_id: entityId, data_id: dataId } },
                body,
            });
        case 'areas':
            return client.PUT('/areas/{area_id}/data/{data_id}', {
                params: { path: { area_id: entityId, data_id: dataId } },
                body,
            });
        case 'functions':
            return client.PUT('/functions/{function_id}/data/{data_id}', {
                params: { path: { function_id: entityId, data_id: dataId } },
                body,
            });
    }
}

// =============================================================================
// Operations
// =============================================================================

export function getEntityOperations(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/operations', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}/operations', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/operations', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}/operations', {
                params: { path: { function_id: entityId } },
            });
    }
}

// =============================================================================
// Executions
// =============================================================================

export function postEntityExecution(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    operationId: string,
    body: { input?: unknown }
) {
    switch (entityType) {
        case 'apps':
            return client.POST('/apps/{app_id}/operations/{operation_id}/executions', {
                params: { path: { app_id: entityId, operation_id: operationId } },
                body,
            });
        case 'components':
            return client.POST('/components/{component_id}/operations/{operation_id}/executions', {
                params: { path: { component_id: entityId, operation_id: operationId } },
                body,
            });
        case 'areas':
            return client.POST('/areas/{area_id}/operations/{operation_id}/executions', {
                params: { path: { area_id: entityId, operation_id: operationId } },
                body,
            });
        case 'functions':
            return client.POST('/functions/{function_id}/operations/{operation_id}/executions', {
                params: { path: { function_id: entityId, operation_id: operationId } },
                body,
            });
    }
}

export function getEntityExecution(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    operationId: string,
    executionId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/operations/{operation_id}/executions/{execution_id}', {
                params: { path: { app_id: entityId, operation_id: operationId, execution_id: executionId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/operations/{operation_id}/executions/{execution_id}', {
                params: {
                    path: { component_id: entityId, operation_id: operationId, execution_id: executionId },
                },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/operations/{operation_id}/executions/{execution_id}', {
                params: { path: { area_id: entityId, operation_id: operationId, execution_id: executionId } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/operations/{operation_id}/executions/{execution_id}', {
                params: {
                    path: { function_id: entityId, operation_id: operationId, execution_id: executionId },
                },
            });
    }
}

export function deleteEntityExecution(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    operationId: string,
    executionId: string
) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/operations/{operation_id}/executions/{execution_id}', {
                params: { path: { app_id: entityId, operation_id: operationId, execution_id: executionId } },
            });
        case 'components':
            return client.DELETE('/components/{component_id}/operations/{operation_id}/executions/{execution_id}', {
                params: {
                    path: { component_id: entityId, operation_id: operationId, execution_id: executionId },
                },
            });
        case 'areas':
            return client.DELETE('/areas/{area_id}/operations/{operation_id}/executions/{execution_id}', {
                params: { path: { area_id: entityId, operation_id: operationId, execution_id: executionId } },
            });
        case 'functions':
            return client.DELETE('/functions/{function_id}/operations/{operation_id}/executions/{execution_id}', {
                params: {
                    path: { function_id: entityId, operation_id: operationId, execution_id: executionId },
                },
            });
    }
}

// =============================================================================
// Faults
// =============================================================================

export function getEntityFaults(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/faults', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}/faults', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/faults', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}/faults', {
                params: { path: { function_id: entityId } },
            });
    }
}

export function getEntityFaultDetail(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    faultCode: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/faults/{fault_code}', {
                params: { path: { app_id: entityId, fault_code: faultCode } },
            });
        case 'components':
            return client.GET('/components/{component_id}/faults/{fault_code}', {
                params: { path: { component_id: entityId, fault_code: faultCode } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/faults/{fault_code}', {
                params: { path: { area_id: entityId, fault_code: faultCode } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/faults/{fault_code}', {
                params: { path: { function_id: entityId, fault_code: faultCode } },
            });
    }
}

export function deleteEntityFault(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    faultCode: string
) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/faults/{fault_code}', {
                params: { path: { app_id: entityId, fault_code: faultCode } },
            });
        case 'components':
            return client.DELETE('/components/{component_id}/faults/{fault_code}', {
                params: { path: { component_id: entityId, fault_code: faultCode } },
            });
        case 'areas':
            return client.DELETE('/areas/{area_id}/faults/{fault_code}', {
                params: { path: { area_id: entityId, fault_code: faultCode } },
            });
        case 'functions':
            return client.DELETE('/functions/{function_id}/faults/{fault_code}', {
                params: { path: { function_id: entityId, fault_code: faultCode } },
            });
    }
}

export function deleteEntityFaults(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/faults', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.DELETE('/components/{component_id}/faults', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.DELETE('/areas/{area_id}/faults', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.DELETE('/functions/{function_id}/faults', {
                params: { path: { function_id: entityId } },
            });
    }
}

// =============================================================================
// Bulk Data
// =============================================================================

export function getEntityBulkDataCategories(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/bulk-data', { params: { path: { app_id: entityId } } });
        case 'components':
            return client.GET('/components/{component_id}/bulk-data', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/bulk-data', { params: { path: { area_id: entityId } } });
        case 'functions':
            return client.GET('/functions/{function_id}/bulk-data', {
                params: { path: { function_id: entityId } },
            });
    }
}

export function getEntityBulkData(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    categoryId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/bulk-data/{category_id}', {
                params: { path: { app_id: entityId, category_id: categoryId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/bulk-data/{category_id}', {
                params: { path: { component_id: entityId, category_id: categoryId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/bulk-data/{category_id}', {
                params: { path: { area_id: entityId, category_id: categoryId } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/bulk-data/{category_id}', {
                params: { path: { function_id: entityId, category_id: categoryId } },
            });
    }
}

// =============================================================================
// Logs
// =============================================================================

export function getEntityLogs(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    params: LogsQueryParams,
    signal?: AbortSignal
) {
    const query: Record<string, string> = {};
    if (params.severity) query.severity = params.severity;
    if (params.context) query.context = params.context;

    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/logs', {
                params: { path: { app_id: entityId }, query },
                signal,
            });
        case 'components':
            return client.GET('/components/{component_id}/logs', {
                params: { path: { component_id: entityId }, query },
                signal,
            });
        case 'areas':
            return client.GET('/areas/{area_id}/logs', {
                params: { path: { area_id: entityId }, query },
                signal,
            });
        case 'functions':
            return client.GET('/functions/{function_id}/logs', {
                params: { path: { function_id: entityId }, query },
                signal,
            });
    }
}

export function getEntityLogsConfiguration(client: MedkitClient, entityType: SovdResourceEntityType, entityId: string) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/logs/configuration', {
                params: { path: { app_id: entityId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/logs/configuration', {
                params: { path: { component_id: entityId } },
            });
        case 'areas':
            return client.GET('/areas/{area_id}/logs/configuration', {
                params: { path: { area_id: entityId } },
            });
        case 'functions':
            return client.GET('/functions/{function_id}/logs/configuration', {
                params: { path: { function_id: entityId } },
            });
    }
}

export function putEntityLogsConfiguration(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    config: LogsConfiguration
) {
    switch (entityType) {
        case 'apps':
            return client.PUT('/apps/{app_id}/logs/configuration', {
                params: { path: { app_id: entityId } },
                body: config,
            });
        case 'components':
            return client.PUT('/components/{component_id}/logs/configuration', {
                params: { path: { component_id: entityId } },
                body: config,
            });
        case 'areas':
            return client.PUT('/areas/{area_id}/logs/configuration', {
                params: { path: { area_id: entityId } },
                body: config,
            });
        case 'functions':
            return client.PUT('/functions/{function_id}/logs/configuration', {
                params: { path: { function_id: entityId } },
                body: config,
            });
    }
}
