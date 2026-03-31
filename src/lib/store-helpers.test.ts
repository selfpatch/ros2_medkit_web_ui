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

import { describe, it, expect } from 'vitest';
import { toTreeNode, updateNodeInTree, findNode, inferEntityTypeFromDepth, parseTreePath } from './store';
import type { SovdEntity, EntityTreeNode } from './types';

// =============================================================================
// Helper factories
// =============================================================================

function makeEntity(overrides: Partial<SovdEntity> = {}): SovdEntity {
    return {
        id: 'test-entity',
        name: 'Test Entity',
        type: 'component',
        href: '/api/v1/components/test-entity',
        ...overrides,
    };
}

function makeTreeNode(overrides: Partial<EntityTreeNode> = {}): EntityTreeNode {
    return {
        id: 'node-a',
        name: 'Node A',
        type: 'component',
        href: '/api/v1/components/node-a',
        path: '/node-a',
        children: undefined,
        isLoading: false,
        isExpanded: false,
        hasChildren: true,
        ...overrides,
    };
}

// =============================================================================
// toTreeNode
// =============================================================================

describe('toTreeNode', () => {
    it('creates a tree node with correct path from entity id', () => {
        const entity = makeEntity({ id: 'engine' });
        const node = toTreeNode(entity);
        expect(node.path).toBe('/engine');
    });

    it('prepends parentPath to the node path', () => {
        const entity = makeEntity({ id: 'engine' });
        const node = toTreeNode(entity, '/powertrain');
        expect(node.path).toBe('/powertrain/engine');
    });

    it('sets children to undefined for lazy loading', () => {
        const entity = makeEntity();
        const node = toTreeNode(entity);
        expect(node.children).toBeUndefined();
    });

    it('sets isLoading to false', () => {
        const entity = makeEntity();
        const node = toTreeNode(entity);
        expect(node.isLoading).toBe(false);
    });

    it('sets isExpanded to false', () => {
        const entity = makeEntity();
        const node = toTreeNode(entity);
        expect(node.isExpanded).toBe(false);
    });

    it('sets hasChildren to false for app type', () => {
        const entity = makeEntity({ type: 'app' });
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(false);
    });

    it('sets hasChildren to true for component type', () => {
        const entity = makeEntity({ type: 'component' });
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(true);
    });

    it('sets hasChildren to true for area type', () => {
        const entity = makeEntity({ type: 'area' });
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(true);
    });

    it('uses explicit hasChildren metadata when provided', () => {
        const entity = { ...makeEntity({ type: 'component' }), hasChildren: false } as SovdEntity;
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(false);
    });

    it('uses explicit hasChildren=true metadata even for app type', () => {
        const entity = { ...makeEntity({ type: 'app' }), hasChildren: true } as SovdEntity;
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(true);
    });

    it('detects non-empty children array as hasChildren=true', () => {
        const entity = { ...makeEntity({ type: 'app' }), children: [{ id: 'child' }] } as unknown as SovdEntity;
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(true);
    });

    it('detects empty children array as hasChildren=false', () => {
        const entity = { ...makeEntity({ type: 'component' }), children: [] } as unknown as SovdEntity;
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(false);
    });

    it('preserves entity properties via spread', () => {
        const entity = makeEntity({ id: 'sensor', name: 'Sensor', href: '/sensors/sensor' });
        const node = toTreeNode(entity);
        expect(node.id).toBe('sensor');
        expect(node.name).toBe('Sensor');
        expect(node.href).toBe('/sensors/sensor');
    });

    it('handles empty parentPath as root level', () => {
        const entity = makeEntity({ id: 'root-item' });
        const node = toTreeNode(entity, '');
        expect(node.path).toBe('/root-item');
    });

    it('is case-insensitive for type check (App vs app)', () => {
        const entity = makeEntity({ type: 'App' });
        const node = toTreeNode(entity);
        expect(node.hasChildren).toBe(false);
    });
});

// =============================================================================
// updateNodeInTree
// =============================================================================

describe('updateNodeInTree', () => {
    it('updates a top-level node matching the target path', () => {
        const nodes = [makeTreeNode({ path: '/a' }), makeTreeNode({ path: '/b' })];
        const result = updateNodeInTree(nodes, '/a', (n) => ({ ...n, isExpanded: true }));
        expect(result[0]?.isExpanded).toBe(true);
        expect(result[1]?.isExpanded).toBe(false);
    });

    it('updates a nested node matching the target path', () => {
        const child = makeTreeNode({ id: 'child', path: '/parent/child' });
        const parent = makeTreeNode({
            id: 'parent',
            path: '/parent',
            children: [child],
        });
        const result = updateNodeInTree([parent], '/parent/child', (n) => ({
            ...n,
            isLoading: true,
        }));
        expect(result[0]?.children?.[0]?.isLoading).toBe(true);
    });

    it('updates a deeply nested node', () => {
        const grandchild = makeTreeNode({ id: 'gc', path: '/a/b/gc' });
        const child = makeTreeNode({ id: 'b', path: '/a/b', children: [grandchild] });
        const root = makeTreeNode({ id: 'a', path: '/a', children: [child] });

        const result = updateNodeInTree([root], '/a/b/gc', (n) => ({
            ...n,
            name: 'Updated',
        }));
        expect(result[0]?.children?.[0]?.children?.[0]?.name).toBe('Updated');
    });

    it('returns nodes unchanged when target path does not exist', () => {
        const nodes = [makeTreeNode({ path: '/a' })];
        const result = updateNodeInTree(nodes, '/nonexistent', (n) => ({
            ...n,
            isExpanded: true,
        }));
        expect(result[0]?.isExpanded).toBe(false);
    });

    it('does not modify the original nodes array', () => {
        const nodes = [makeTreeNode({ path: '/a' })];
        const result = updateNodeInTree(nodes, '/a', (n) => ({ ...n, isExpanded: true }));
        expect(nodes[0]?.isExpanded).toBe(false);
        expect(result[0]?.isExpanded).toBe(true);
    });

    it('handles an empty nodes array', () => {
        const result = updateNodeInTree([], '/any', (n) => ({ ...n, isExpanded: true }));
        expect(result).toEqual([]);
    });

    it('does not traverse into children when node.children is undefined', () => {
        const node = makeTreeNode({ path: '/a', children: undefined });
        const result = updateNodeInTree([node], '/a/b', (n) => ({ ...n, isExpanded: true }));
        // Should not crash; node with undefined children is returned as-is
        expect(result[0]?.children).toBeUndefined();
    });

    it('only follows path prefix matches for children traversal', () => {
        const unrelated = makeTreeNode({ id: 'x', path: '/x', children: [makeTreeNode({ id: 'y', path: '/x/y' })] });
        const target = makeTreeNode({ id: 'a', path: '/a' });
        const result = updateNodeInTree([unrelated, target], '/a', (n) => ({
            ...n,
            name: 'Hit',
        }));
        expect(result[0]?.name).toBe('Node A'); // unrelated unchanged
        expect(result[1]?.name).toBe('Hit');
    });
});

// =============================================================================
// findNode
// =============================================================================

describe('findNode', () => {
    it('finds a top-level node by path', () => {
        const nodes = [makeTreeNode({ path: '/a', id: 'a' }), makeTreeNode({ path: '/b', id: 'b' })];
        const found = findNode(nodes, '/a');
        expect(found?.id).toBe('a');
    });

    it('finds a nested node by path', () => {
        const child = makeTreeNode({ id: 'child', path: '/parent/child' });
        const parent = makeTreeNode({ id: 'parent', path: '/parent', children: [child] });
        const found = findNode([parent], '/parent/child');
        expect(found?.id).toBe('child');
    });

    it('finds a deeply nested node', () => {
        const gc = makeTreeNode({ id: 'gc', path: '/a/b/gc' });
        const child = makeTreeNode({ id: 'b', path: '/a/b', children: [gc] });
        const root = makeTreeNode({ id: 'a', path: '/a', children: [child] });
        const found = findNode([root], '/a/b/gc');
        expect(found?.id).toBe('gc');
    });

    it('returns null when node does not exist', () => {
        const nodes = [makeTreeNode({ path: '/a' })];
        expect(findNode(nodes, '/nonexistent')).toBeNull();
    });

    it('returns null for an empty nodes array', () => {
        expect(findNode([], '/any')).toBeNull();
    });

    it('does not search into undefined children', () => {
        const node = makeTreeNode({ path: '/a', children: undefined });
        expect(findNode([node], '/a/b')).toBeNull();
    });

    it('returns the first match if paths are duplicated', () => {
        const first = makeTreeNode({ path: '/dup', id: 'first' });
        const second = makeTreeNode({ path: '/dup', id: 'second' });
        const found = findNode([first, second], '/dup');
        expect(found?.id).toBe('first');
    });

    it('finds parent node, not just leaf', () => {
        const child = makeTreeNode({ id: 'child', path: '/parent/child' });
        const parent = makeTreeNode({ id: 'parent', path: '/parent', children: [child] });
        const found = findNode([parent], '/parent');
        expect(found?.id).toBe('parent');
    });
});

// =============================================================================
// inferEntityTypeFromDepth
// =============================================================================

describe('inferEntityTypeFromDepth', () => {
    it('returns "areas" for depth 0', () => {
        expect(inferEntityTypeFromDepth(0)).toBe('areas');
    });

    it('returns "areas" for depth 1', () => {
        expect(inferEntityTypeFromDepth(1)).toBe('areas');
    });

    it('returns "components" for depth 2', () => {
        expect(inferEntityTypeFromDepth(2)).toBe('components');
    });

    it('returns "apps" for depth 3', () => {
        expect(inferEntityTypeFromDepth(3)).toBe('apps');
    });

    it('returns "apps" for depth greater than 3', () => {
        expect(inferEntityTypeFromDepth(5)).toBe('apps');
        expect(inferEntityTypeFromDepth(10)).toBe('apps');
    });

    it('returns "areas" for negative depth', () => {
        expect(inferEntityTypeFromDepth(-1)).toBe('areas');
    });
});

// =============================================================================
// parseTreePath
// =============================================================================

describe('parseTreePath', () => {
    it('parses a simple area path', () => {
        const result = parseTreePath('/server/powertrain');
        expect(result.entityType).toBe('areas');
        expect(result.entityId).toBe('powertrain');
        expect(result.resource).toBeUndefined();
        expect(result.resourceId).toBeUndefined();
    });

    it('parses a component path (depth 2)', () => {
        const result = parseTreePath('/server/powertrain/engine');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
    });

    it('parses an app path (depth 3)', () => {
        const result = parseTreePath('/server/powertrain/engine/controller');
        expect(result.entityType).toBe('apps');
        expect(result.entityId).toBe('controller');
    });

    it('parses a data resource path', () => {
        const result = parseTreePath('/server/powertrain/engine/data/temperature');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
        expect(result.resource).toBe('data');
        expect(result.resourceId).toBe('temperature');
    });

    it('parses an operations resource path', () => {
        const result = parseTreePath('/server/powertrain/engine/operations/calibrate');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
        expect(result.resource).toBe('operations');
        expect(result.resourceId).toBe('calibrate');
    });

    it('parses a configurations resource path', () => {
        const result = parseTreePath('/server/powertrain/engine/configurations/max_rpm');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
        expect(result.resource).toBe('configurations');
        expect(result.resourceId).toBe('max_rpm');
    });

    it('parses a faults resource path', () => {
        const result = parseTreePath('/server/powertrain/engine/faults/OVERHEAT');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
        expect(result.resource).toBe('faults');
        expect(result.resourceId).toBe('OVERHEAT');
    });

    it('parses a resource collection without specific resource id', () => {
        const result = parseTreePath('/server/powertrain/engine/data');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
        expect(result.resource).toBe('data');
        expect(result.resourceId).toBeUndefined();
    });

    it('parses app-level data resource path (depth 3)', () => {
        const result = parseTreePath('/server/powertrain/engine/controller/data/sensor_reading');
        expect(result.entityType).toBe('apps');
        expect(result.entityId).toBe('controller');
        expect(result.resource).toBe('data');
        expect(result.resourceId).toBe('sensor_reading');
    });

    it('strips /server prefix before parsing', () => {
        const result = parseTreePath('/server/my-area');
        expect(result.entityId).toBe('my-area');
        expect(result.entityType).toBe('areas');
    });

    it('handles path without /server prefix', () => {
        const result = parseTreePath('/powertrain/engine');
        expect(result.entityType).toBe('components');
        expect(result.entityId).toBe('engine');
    });

    it('decodes URL-encoded resource IDs', () => {
        const result = parseTreePath('/server/area/comp/data/%2Ftopic%2Fname');
        expect(result.resourceId).toBe('/topic/name');
    });

    it('returns empty entityId for empty path', () => {
        const result = parseTreePath('');
        expect(result.entityId).toBe('');
    });

    it('returns areas type for single-segment path after /server', () => {
        const result = parseTreePath('/server/chassis');
        expect(result.entityType).toBe('areas');
        expect(result.entityId).toBe('chassis');
    });
});
