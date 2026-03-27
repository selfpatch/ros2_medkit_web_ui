import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
    beforeEach(() => {
        // Clear any previous renders
    });

    it('renders no-connection state', () => {
        render(<EmptyState type="no-connection" />);

        expect(screen.getByText('No Server Connected')).toBeInTheDocument();
        expect(screen.getByText('Connect to a ros2_medkit gateway to browse entities.')).toBeInTheDocument();
    });

    it('renders no-entities state', () => {
        render(<EmptyState type="no-entities" />);

        expect(screen.getByText('No Entities Found')).toBeInTheDocument();
    });

    it('renders no-selection state', () => {
        render(<EmptyState type="no-selection" />);

        expect(screen.getByText('Select an Entity')).toBeInTheDocument();
        expect(screen.getByText('Click on an entity in the tree to view its details.')).toBeInTheDocument();
    });

    it('renders action button for no-connection state', () => {
        render(<EmptyState type="no-connection" onAction={() => {}} />);

        expect(screen.getByRole('button', { name: 'Connect to Server' })).toBeInTheDocument();
    });

    it('calls onAction when button clicked', async () => {
        const user = userEvent.setup();
        let clicked = false;
        render(<EmptyState type="no-connection" onAction={() => (clicked = true)} />);

        await user.click(screen.getByRole('button', { name: 'Connect to Server' }));
        expect(clicked).toBe(true);
    });

    it('does not render action button without onAction', () => {
        render(<EmptyState type="no-connection" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
