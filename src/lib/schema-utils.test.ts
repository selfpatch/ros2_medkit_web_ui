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
import { convertJsonSchemaToTopicSchema } from './schema-utils';

describe('convertJsonSchemaToTopicSchema', () => {
    it('converts a flat object schema with typed properties', () => {
        const result = convertJsonSchemaToTopicSchema({
            type: 'object',
            properties: {
                verbose: { type: 'boolean' },
                retries: { type: 'integer' },
            },
        });

        expect(result).toEqual({
            verbose: { type: 'bool' },
            retries: { type: 'int32' },
        });
    });

    it('converts nested object properties', () => {
        const result = convertJsonSchemaToTopicSchema({
            type: 'object',
            properties: {
                target: {
                    type: 'object',
                    properties: {
                        host: { type: 'string' },
                        port: { type: 'integer' },
                    },
                },
            },
        });

        expect(result).toEqual({
            target: {
                type: 'object',
                fields: {
                    host: { type: 'string' },
                    port: { type: 'int32' },
                },
            },
        });
    });

    it('converts array properties through items', () => {
        const result = convertJsonSchemaToTopicSchema({
            type: 'object',
            properties: {
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
        });

        expect(result).toEqual({
            tags: {
                type: 'array',
                items: { type: 'string' },
            },
        });
    });

    it('returns undefined for null and for a non-object input', () => {
        expect(convertJsonSchemaToTopicSchema(null)).toBeUndefined();
        expect(convertJsonSchemaToTopicSchema('not an object')).toBeUndefined();
    });

    it('passes a schema without properties through unchanged', () => {
        // Documents today's pass-through behaviour: a schema with no `properties`
        // key falls through to the final `return jsonSchema as TopicSchema` line
        // unchanged, even though `{type: 'object'}` is not a valid TopicSchema
        // (its "type" entry is a bare string, not a SchemaFieldType object).
        const result = convertJsonSchemaToTopicSchema({ type: 'object' });

        expect(result).toEqual({ type: 'object' });
    });
});
