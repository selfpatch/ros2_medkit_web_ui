// Copyright 2026 bburda
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataPanel } from './DataPanel';
import type { ComponentTopic } from '@/lib/types';

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: { isConnected: boolean }) => unknown) => selector({ isConnected: true })),
}));

vi.mock('@/components/TopicPublishForm', () => ({
    TopicPublishForm: () => <div data-testid="topic-publish-form" />,
}));

vi.mock('@/components/JsonFormViewer', () => ({
    JsonFormViewer: () => <div data-testid="json-form-viewer" />,
}));

function makeTopic(overrides: Partial<ComponentTopic> = {}): ComponentTopic {
    return {
        topic: '/test/data',
        timestamp: 0,
        data: null,
        status: 'data',
        ...overrides,
    };
}

describe('DataPanel canWrite', () => {
    it('shows write form when access is write even if data is 0 and no type is present', () => {
        // Regression for the falsy-scalar bug: a counter reading of exactly 0
        // with an explicit `access: 'write'` must not hide the write section.
        render(<DataPanel topic={makeTopic({ access: 'write', data: 0 })} entityId="motor" />);
        expect(screen.getByText('Write Value')).toBeInTheDocument();
        expect(screen.getByTestId('topic-publish-form')).toBeInTheDocument();
    });

    it('shows write form when access is readwrite even if data is false and no type is present', () => {
        render(<DataPanel topic={makeTopic({ access: 'readwrite', data: false })} entityId="motor" />);
        expect(screen.getByText('Write Value')).toBeInTheDocument();
    });

    it('hides write form when access is read regardless of data or type', () => {
        render(
            <DataPanel
                topic={makeTopic({ access: 'read', type: 'sensor_msgs/msg/Temperature', data: { value: 23 } })}
                entityId="motor"
            />
        );
        expect(screen.queryByText('Write Value')).not.toBeInTheDocument();
        expect(screen.queryByText('Publish Message')).not.toBeInTheDocument();
    });

    it('falls back to typed-topic heuristic when access is absent', () => {
        render(<DataPanel topic={makeTopic({ type: 'std_msgs/msg/String', data: null })} entityId="motor" />);
        expect(screen.getByText('Publish Message')).toBeInTheDocument();
    });

    it('hides write form when access is absent and there is no type hint and no value', () => {
        render(<DataPanel topic={makeTopic({ data: null })} entityId="motor" />);
        expect(screen.queryByText('Publish Message')).not.toBeInTheDocument();
        expect(screen.queryByText('Write Value')).not.toBeInTheDocument();
    });
});
