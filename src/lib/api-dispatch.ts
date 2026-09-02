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

import type { MedkitClient, paths } from '@selfpatch/ros2-medkit-client-ts';
import type { SovdResourceEntityType, LifecycleAction, ScriptEntityType, StartScriptExecutionRequest } from './types';
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

export function getEntityConfigurations(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/configurations', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/configurations', {
                params: { path: { component_id: entityId } },
                signal,
            });
        case 'areas':
            return client.GET('/areas/{area_id}/configurations', {
                params: { path: { area_id: entityId } },
                signal,
            });
        case 'functions':
            return client.GET('/functions/{function_id}/configurations', {
                params: { path: { function_id: entityId } },
                signal,
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

export function getEntityData(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/data', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/data', {
                params: { path: { component_id: entityId } },
                signal,
            });
        case 'areas':
            return client.GET('/areas/{area_id}/data', { params: { path: { area_id: entityId } }, signal });
        case 'functions':
            return client.GET('/functions/{function_id}/data', {
                params: { path: { function_id: entityId } },
                signal,
            });
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
    body: { type: string; data: unknown }
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

export function getEntityOperations(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/operations', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/operations', {
                params: { path: { component_id: entityId } },
                signal,
            });
        case 'areas':
            return client.GET('/areas/{area_id}/operations', {
                params: { path: { area_id: entityId } },
                signal,
            });
        case 'functions':
            return client.GET('/functions/{function_id}/operations', {
                params: { path: { function_id: entityId } },
                signal,
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

export function getEntityFaults(
    client: MedkitClient,
    entityType: SovdResourceEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/faults', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/faults', {
                params: { path: { component_id: entityId } },
                signal,
            });
        case 'areas':
            return client.GET('/areas/{area_id}/faults', { params: { path: { area_id: entityId } }, signal });
        case 'functions':
            return client.GET('/functions/{function_id}/faults', {
                params: { path: { function_id: entityId } },
                signal,
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

// =============================================================================
// Lifecycle Status
//
// The gateway 0.6.0 lifecycle API exists ONLY for apps and components. There is
// no areas/functions equivalent, so these helpers narrow the entity type to
// 'apps' | 'components'. Each transition is a distinct PUT path (the action is
// part of the URL, not a path parameter), so setStatus maps the action string
// to the matching typed path.
// =============================================================================

/** Entity types that expose the lifecycle status collection. */
export type LifecycleEntityType = Extract<SovdResourceEntityType, 'apps' | 'components'>;

export function getStatus(
    client: MedkitClient,
    entityType: LifecycleEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/status', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/status', {
                params: { path: { component_id: entityId } },
                signal,
            });
    }
}

export function setStatus(
    client: MedkitClient,
    entityType: LifecycleEntityType,
    entityId: string,
    action: LifecycleAction,
    signal?: AbortSignal
) {
    if (entityType === 'apps') {
        const params = { path: { app_id: entityId } };
        switch (action) {
            case 'start':
                return client.PUT('/apps/{app_id}/status/start', { params, signal });
            case 'restart':
                return client.PUT('/apps/{app_id}/status/restart', { params, signal });
            case 'force-restart':
                return client.PUT('/apps/{app_id}/status/force-restart', { params, signal });
            case 'shutdown':
                return client.PUT('/apps/{app_id}/status/shutdown', { params, signal });
            case 'force-shutdown':
                return client.PUT('/apps/{app_id}/status/force-shutdown', { params, signal });
        }
    }
    const params = { path: { component_id: entityId } };
    switch (action) {
        case 'start':
            return client.PUT('/components/{component_id}/status/start', { params, signal });
        case 'restart':
            return client.PUT('/components/{component_id}/status/restart', { params, signal });
        case 'force-restart':
            return client.PUT('/components/{component_id}/status/force-restart', { params, signal });
        case 'shutdown':
            return client.PUT('/components/{component_id}/status/shutdown', { params, signal });
        case 'force-shutdown':
            return client.PUT('/components/{component_id}/status/force-shutdown', { params, signal });
    }
}

// =============================================================================
// Scripts
// =============================================================================

export function getEntityScripts(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/scripts', { params: { path: { app_id: entityId } }, signal });
        case 'components':
            return client.GET('/components/{component_id}/scripts', {
                params: { path: { component_id: entityId } },
                signal,
            });
    }
}

export function getEntityScript(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/scripts/{script_id}', {
                params: { path: { app_id: entityId, script_id: scriptId } },
            });
        case 'components':
            return client.GET('/components/{component_id}/scripts/{script_id}', {
                params: { path: { component_id: entityId, script_id: scriptId } },
            });
    }
}

/** The upload body both script paths declare: a required `file` part plus optional `metadata`. */
type ScriptUploadBody = NonNullable<
    paths['/apps/{app_id}/scripts']['post']['requestBody']
>['content']['multipart/form-data'];

/**
 * Multipart upload.
 *
 * FormData is a DOM interface, so it is never assignable to the generated body
 * object however the spec describes it - hence the cast, which names the real
 * body type so a change to the declared parts is a type error here rather than
 * a runtime 400. bodySerializer returns the FormData unchanged so fetch sets
 * Content-Type with the multipart boundary itself - the gateway rejects the
 * request without it.
 */
export function uploadEntityScript(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    form: FormData
) {
    const body = form as unknown as ScriptUploadBody;
    const bodySerializer = (value: unknown) => value as FormData;
    switch (entityType) {
        case 'apps':
            return client.POST('/apps/{app_id}/scripts', {
                params: { path: { app_id: entityId } },
                body,
                bodySerializer,
            });
        case 'components':
            return client.POST('/components/{component_id}/scripts', {
                params: { path: { component_id: entityId } },
                body,
                bodySerializer,
            });
    }
}

export function deleteEntityScript(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string
) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/scripts/{script_id}', {
                params: { path: { app_id: entityId, script_id: scriptId } },
            });
        case 'components':
            return client.DELETE('/components/{component_id}/scripts/{script_id}', {
                params: { path: { component_id: entityId, script_id: scriptId } },
            });
    }
}

/**
 * Start an execution.
 *
 * StartScriptExecutionRequest mirrors the generated ScriptExecutionRequest, so the
 * body passes straight through and a divergence between the two shows up here.
 */
export function startScriptExecution(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string,
    request: StartScriptExecutionRequest
) {
    const body = request;
    switch (entityType) {
        case 'apps':
            return client.POST('/apps/{app_id}/scripts/{script_id}/executions', {
                params: { path: { app_id: entityId, script_id: scriptId } },
                body,
            });
        case 'components':
            return client.POST('/components/{component_id}/scripts/{script_id}/executions', {
                params: { path: { component_id: entityId, script_id: scriptId } },
                body,
            });
    }
}

export function getScriptExecution(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string,
    executionId: string,
    signal?: AbortSignal
) {
    switch (entityType) {
        case 'apps':
            return client.GET('/apps/{app_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { app_id: entityId, script_id: scriptId, execution_id: executionId } },
                signal,
            });
        case 'components':
            return client.GET('/components/{component_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { component_id: entityId, script_id: scriptId, execution_id: executionId } },
                signal,
            });
    }
}

/**
 * `action` is a plain string, not a union: the gateway forwards it verbatim to
 * plugin backends, which may support control actions beyond stop and
 * forced_termination.
 */
export function controlScriptExecution(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string,
    executionId: string,
    action: string
) {
    switch (entityType) {
        case 'apps':
            return client.PUT('/apps/{app_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { app_id: entityId, script_id: scriptId, execution_id: executionId } },
                body: { action },
            });
        case 'components':
            return client.PUT('/components/{component_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { component_id: entityId, script_id: scriptId, execution_id: executionId } },
                body: { action },
            });
    }
}

export function deleteScriptExecution(
    client: MedkitClient,
    entityType: ScriptEntityType,
    entityId: string,
    scriptId: string,
    executionId: string
) {
    switch (entityType) {
        case 'apps':
            return client.DELETE('/apps/{app_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { app_id: entityId, script_id: scriptId, execution_id: executionId } },
            });
        case 'components':
            return client.DELETE('/components/{component_id}/scripts/{script_id}/executions/{execution_id}', {
                params: { path: { component_id: entityId, script_id: scriptId, execution_id: executionId } },
            });
    }
}
