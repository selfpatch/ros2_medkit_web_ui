import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataPanel } from './DataPanel';
import type { ComponentTopic } from '@/lib/types';

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector: (s: { isConnected: boolean }) => unknown) => selector({ isConnected: true })),
}));

// Capture the latest `initialValue` so tests can assert what the form would
// receive when the user clicks "Copy to Publish".
const publishFormInitialValues: unknown[] = [];
vi.mock('@/components/TopicPublishForm', () => ({
    TopicPublishForm: ({ initialValue }: { initialValue: unknown }) => {
        publishFormInitialValues.push(initialValue);
        return <div data-testid="topic-publish-form" />;
    },
}));

vi.mock('@/components/JsonFormViewer', () => ({
    JsonFormViewer: () => <div data-testid="json-form-viewer" />,
}));

beforeEach(() => {
    publishFormInitialValues.length = 0;
});

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

describe('DataPanel publishValue initialization', () => {
    it('preserves a scalar zero data value as the initial publish value when no default is set', () => {
        // `||` would have collapsed `0` to `{}`; `??` keeps the falsy scalar.
        render(<DataPanel topic={makeTopic({ access: 'write', data: 0 })} entityId="motor" />);
        expect(publishFormInitialValues.at(-1)).toBe(0);
    });

    it('prefers type_info.default_value over data when both are present', () => {
        render(
            <DataPanel
                topic={makeTopic({
                    access: 'write',
                    data: 0,
                    type_info: { schema: {}, default_value: 42 as unknown as Record<string, unknown> },
                })}
                entityId="motor"
            />
        );
        expect(publishFormInitialValues.at(-1)).toBe(42);
    });
});

describe('DataPanel Copy to Publish', () => {
    it('copies a scalar zero value from the last received data into the publish form', async () => {
        // With the previous truthy guard, clicking Copy did nothing for a
        // valid reading of exactly 0 (or false / ''). Presence check fixes it.
        render(
            <DataPanel
                topic={makeTopic({
                    access: 'write',
                    data: 0,
                    type_info: { schema: {}, default_value: 42 as unknown as Record<string, unknown> },
                })}
                entityId="motor"
            />
        );

        expect(publishFormInitialValues.at(-1)).toBe(42);

        await userEvent.click(screen.getByRole('button', { name: /copy to publish/i }));

        expect(publishFormInitialValues.at(-1)).toBe(0);
    });
});
