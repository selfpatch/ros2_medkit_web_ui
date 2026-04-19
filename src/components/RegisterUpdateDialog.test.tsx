import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RegisterUpdateDialog } from './RegisterUpdateDialog';

describe('RegisterUpdateDialog', () => {
    it('renders the four fields when open', () => {
        render(<RegisterUpdateDialog open onClose={() => {}} onSubmit={async () => {}} />);
        expect(screen.getByLabelText(/^id$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^automated$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/additional metadata/i)).toBeInTheDocument();
    });

    it('rejects empty id', async () => {
        const onSubmit = vi.fn();
        render(<RegisterUpdateDialog open onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
        expect(await screen.findByText(/id is required/i)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON metadata', async () => {
        const onSubmit = vi.fn();
        render(<RegisterUpdateDialog open onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText(/^id$/i), { target: { value: 'x' } });
        fireEvent.change(screen.getByLabelText(/additional metadata/i), { target: { value: '{not json' } });
        fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
        expect(await screen.findByText(/invalid json/i)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('strips reserved keys from metadata so UI-validated fields win', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<RegisterUpdateDialog open onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText(/^id$/i), { target: { value: 'ui-id' } });
        fireEvent.change(screen.getByLabelText(/additional metadata/i), {
            target: { value: '{"id":"evil","update_name":"evil","automated":true,"extra":1}' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                id: 'ui-id',
                update_name: 'ui-id',
                extra: 1,
            })
        );
    });

    it('submits merged body on valid input', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<RegisterUpdateDialog open onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.change(screen.getByLabelText(/^id$/i), { target: { value: 'pkg-1' } });
        fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Pkg One' } });
        fireEvent.click(screen.getByLabelText(/^automated$/i));
        fireEvent.change(screen.getByLabelText(/additional metadata/i), {
            target: { value: '{"origins":["a"]}' },
        });
        fireEvent.click(screen.getByRole('button', { name: /^register$/i }));
        await waitFor(() =>
            expect(onSubmit).toHaveBeenCalledWith({
                id: 'pkg-1',
                update_name: 'Pkg One',
                automated: true,
                origins: ['a'],
            })
        );
    });
});
