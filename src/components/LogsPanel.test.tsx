import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogsPanel } from './LogsPanel';
import type { LogsFetchResult } from '@/lib/types';

const mockFetchEntityLogs = vi.fn();
const mockGetLogsConfiguration = vi.fn();
const mockUpdateLogsConfiguration = vi.fn();

vi.mock('@/lib/store', () => ({
    useAppStore: vi.fn((selector) =>
        selector({
            fetchEntityLogs: mockFetchEntityLogs,
            getLogsConfiguration: mockGetLogsConfiguration,
            updateLogsConfiguration: mockUpdateLogsConfiguration,
        })
    ),
}));

function emptyResult(): LogsFetchResult {
    return { items: [] };
}

function sampleResult(): LogsFetchResult {
    return {
        items: [
            {
                id: 'log_1',
                timestamp: '2026-04-10T12:34:56.789000000Z',
                severity: 'warning',
                message: 'Temperature above 80C',
                context: {
                    node: 'powertrain/engine/temp_sensor',
                    function: 'checkTemp',
                    file: 'temp_sensor.cpp',
                    line: 42,
                },
            },
            {
                id: 'log_2',
                timestamp: '2026-04-10T12:34:57.123000000Z',
                severity: 'error',
                message: 'Sensor timeout',
                context: { node: 'powertrain/engine/temp_sensor' },
            },
        ],
    };
}

describe('LogsPanel', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockFetchEntityLogs.mockReset();
        mockGetLogsConfiguration.mockReset();
        mockUpdateLogsConfiguration.mockReset();
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows loading state on first mount and transitions to empty when fetch resolves', async () => {
        let resolveFetch: (value: LogsFetchResult) => void = () => {};
        mockFetchEntityLogs.mockReturnValue(
            new Promise<LogsFetchResult>((resolve) => {
                resolveFetch = resolve;
            })
        );

        render(<LogsPanel entityId="motor" entityType="apps" />);

        expect(screen.getByText(/Loading logs/i)).toBeInTheDocument();

        resolveFetch(emptyResult());
        await waitFor(() => {
            expect(screen.getByText(/No log entries/i)).toBeInTheDocument();
        });
    });

    it('shows "Logs not available" state on 503 response', async () => {
        mockFetchEntityLogs.mockResolvedValue({ items: [], errorStatus: 503 });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(screen.getByText(/Logs not available on this gateway/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('shows "Logs not available for this entity" on 404 response', async () => {
        mockFetchEntityLogs.mockResolvedValue({ items: [], errorStatus: 404 });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(screen.getByText(/Logs not available for this entity/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('shows empty state when initial fetch returns no entries', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(screen.getByText(/No log entries/i)).toBeInTheDocument();
        });
    });

    it('renders table rows for entries', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        render(<LogsPanel entityId="powertrain" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
            expect(screen.getByText('Sensor timeout')).toBeInTheDocument();
        });
        expect(screen.getAllByText('powertrain/engine/temp_sensor')).toHaveLength(2);
    });

    it('calls fetchEntityLogs with default params on mount', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledWith(
                'apps',
                'motor',
                { severity: 'debug', context: '' },
                expect.any(AbortSignal)
            );
        });
    });

    it('does not call getLogsConfiguration on mount', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalled();
        });
        expect(mockGetLogsConfiguration).not.toHaveBeenCalled();
    });

    it('expands a row to show source location on click', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="powertrain" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
        });

        await user.click(screen.getByText('Temperature above 80C'));

        expect(screen.getByText(/checkTemp/)).toBeInTheDocument();
        expect(screen.getByText(/temp_sensor\.cpp:42/)).toBeInTheDocument();
    });

    it('shows "No source location" for entries with empty context', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="powertrain" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Sensor timeout')).toBeInTheDocument();
        });

        await user.click(screen.getByText('Sensor timeout'));

        expect(screen.getByText(/No source location/i)).toBeInTheDocument();
    });

    it('changes severity filter triggers refetch with new param', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        const severitySelect = screen.getByLabelText(/severity/i);
        await user.selectOptions(severitySelect, 'error');

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledWith(
                'apps',
                'motor',
                expect.objectContaining({ severity: 'error' }),
                expect.any(AbortSignal)
            );
        });
    });

    it('hides context filter input for App entities', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalled();
        });

        expect(screen.queryByPlaceholderText(/context/i)).not.toBeInTheDocument();
    });

    it('shows context filter input for Component, Area, Function entities', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const { rerender } = render(<LogsPanel entityId="c1" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/context/i)).toBeInTheDocument();
        });

        rerender(<LogsPanel entityId="a1" entityType="areas" />);
        expect(screen.getByPlaceholderText(/context/i)).toBeInTheDocument();

        rerender(<LogsPanel entityId="f1" entityType="functions" />);
        expect(screen.getByPlaceholderText(/context/i)).toBeInTheDocument();
    });

    it('debounces context filter changes by 300ms', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="c1" entityType="components" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        const contextInput = screen.getByPlaceholderText(/context/i);
        await user.type(contextInput, 'engine');

        // No additional fetch yet
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);

        // Debounce should not have fired yet (default debounce is 300ms).
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);

        // Advance fake timers past the 300ms debounce window inside act so
        // the resulting state updates are flushed cleanly.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(300);
        });

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledWith(
                'components',
                'c1',
                expect.objectContaining({ context: 'engine' }),
                expect.any(AbortSignal)
            );
        });
    });

    it('client-side message search filters loaded entries without new fetch', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="c1" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
            expect(screen.getByText('Sensor timeout')).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/search messages/i);
        await user.type(searchInput, 'timeout');

        expect(screen.queryByText('Temperature above 80C')).not.toBeInTheDocument();
        expect(screen.getByText('Sensor timeout')).toBeInTheDocument();
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1); // no extra fetch
    });

    it('manual refresh button triggers fetch with current filters', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        await user.click(screen.getByRole('button', { name: /refresh/i }));

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(2);
        });
    });

    it('auto-refresh is on by default and ticks at 5s interval', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(2);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(3);
        });
    });

    it('auto-refresh toggle pauses polling', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        await user.click(screen.getByRole('switch', { name: /auto-refresh/i }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
    });

    it('interval dropdown changes tick rate', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        await user.selectOptions(screen.getByLabelText(/interval/i), '2000');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(2);
        });
    });

    it('auto-refresh pauses when document is hidden', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        await act(async () => {
            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);

        await act(async () => {
            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(2);
        });
    });

    it('clear button empties the displayed entries until next fetch', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="c1" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /clear/i }));

        expect(screen.queryByText('Temperature above 80C')).not.toBeInTheDocument();
        expect(screen.getByText(/cleared.*next refresh/i)).toBeInTheDocument();
    });

    it('download button writes a JSON blob with currently displayed entries', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
        const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

        const clickSpy = vi.fn();
        const originalCreateElement = document.createElement.bind(document);
        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const el = originalCreateElement(tagName) as HTMLElement;
            if (tagName === 'a') {
                (el as HTMLAnchorElement).click = clickSpy;
            }
            return el;
        });

        render(<LogsPanel entityId="c1" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /download/i }));

        expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
        const firstCall = createObjectURLSpy.mock.calls[0];
        expect(firstCall).toBeDefined();
        const blob = firstCall![0] as Blob;
        expect(blob.type).toBe('application/json');

        const text = await blob.text();
        const parsed = JSON.parse(text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].id).toBe('log_1');

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:fake');

        createElementSpy.mockRestore();
    });

    it('does not call getLogsConfiguration until gear icon is clicked', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue({ severity_filter: 'info', max_entries: 200 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalled();
        });
        expect(mockGetLogsConfiguration).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: /settings/i }));

        await waitFor(() => {
            expect(mockGetLogsConfiguration).toHaveBeenCalledWith('apps', 'motor');
        });
        await waitFor(() => {
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });
    });

    it('caches config form state across re-expands', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue({ severity_filter: 'info', max_entries: 200 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(mockGetLogsConfiguration).toHaveBeenCalledTimes(1);
        });

        // Collapse
        await user.click(screen.getByRole('button', { name: /settings/i }));
        // Re-expand
        await user.click(screen.getByRole('button', { name: /settings/i }));

        expect(mockGetLogsConfiguration).toHaveBeenCalledTimes(1);
    });

    it('retries getLogsConfiguration on re-expand when previous load failed', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ severity_filter: 'warning', max_entries: 300 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        // First expand: GET fails (returns null).
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(mockGetLogsConfiguration).toHaveBeenCalledTimes(1);
        });

        // Collapse, then re-expand. Failed load should retry.
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.click(screen.getByRole('button', { name: /settings/i }));

        await waitFor(() => {
            expect(mockGetLogsConfiguration).toHaveBeenCalledTimes(2);
        });
        await waitFor(() => {
            expect(screen.getByDisplayValue('300')).toBeInTheDocument();
        });
    });

    it('saves config via PUT and triggers one refetch', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue({ severity_filter: 'info', max_entries: 200 });
        mockUpdateLogsConfiguration.mockResolvedValue(true);
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });

        const maxEntriesInput = screen.getByLabelText(/max entries/i);
        await user.clear(maxEntriesInput);
        await user.type(maxEntriesInput, '500');

        await user.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() => {
            expect(mockUpdateLogsConfiguration).toHaveBeenCalledWith('apps', 'motor', {
                severity_filter: 'info',
                max_entries: 500,
            });
        });

        // One additional fetch after save (initial + refetch = 2)
        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(2);
        });
    });

    it('disables Save when max_entries is less than 1', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue({ severity_filter: 'info', max_entries: 200 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });

        const maxEntriesInput = screen.getByLabelText(/max entries/i);
        await user.clear(maxEntriesInput);
        await user.type(maxEntriesInput, '0');

        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('disables Save when max_entries is greater than 10000', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue({ severity_filter: 'info', max_entries: 200 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });

        const maxEntriesInput = screen.getByLabelText(/max entries/i);
        await user.clear(maxEntriesInput);
        await user.type(maxEntriesInput, '10001');

        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('shows a "Failed to load configuration" state when config GET returns null', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration.mockResolvedValue(null);
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        render(<LogsPanel entityId="motor" entityType="apps" />);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        await waitFor(() => {
            expect(screen.getByText(/Failed to load configuration/i)).toBeInTheDocument();
        });
        // No Save button rendered while the config failed to load.
        expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    });

    it('resets config-row state when entityId changes', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        mockGetLogsConfiguration
            .mockResolvedValueOnce({ severity_filter: 'info', max_entries: 200 })
            .mockResolvedValueOnce({ severity_filter: 'warning', max_entries: 500 });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        const { rerender } = render(<LogsPanel entityId="motor_a" entityType="apps" />);

        // Open gear on entity A, load config
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });

        // Navigate to entity B
        rerender(<LogsPanel entityId="motor_b" entityType="apps" />);

        // Config row should have been closed by the entity-change reset
        expect(screen.queryByDisplayValue('200')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('500')).not.toBeInTheDocument();

        // Open gear on entity B - it should re-fetch with the new value
        await user.click(screen.getByRole('button', { name: /settings/i }));
        await waitFor(() => {
            expect(screen.getByDisplayValue('500')).toBeInTheDocument();
        });
        expect(mockGetLogsConfiguration).toHaveBeenCalledTimes(2);
        expect(mockGetLogsConfiguration).toHaveBeenNthCalledWith(2, 'apps', 'motor_b');
    });

    it('download filename uses filesystem-safe timestamp (no colons or dots)', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

        const capturedFilenames: string[] = [];
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const el = originalCreateElement(tagName) as HTMLElement;
            if (tagName === 'a') {
                const anchor = el as HTMLAnchorElement;
                anchor.click = vi.fn();
                Object.defineProperty(anchor, 'download', {
                    set(value: string) {
                        capturedFilenames.push(value);
                    },
                    get() {
                        return capturedFilenames[capturedFilenames.length - 1] ?? '';
                    },
                });
            }
            return el;
        });

        render(<LogsPanel entityId="motor" entityType="apps" />);
        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /download/i }));

        expect(capturedFilenames.length).toBeGreaterThan(0);
        const filename = capturedFilenames[capturedFilenames.length - 1] ?? '';
        // ISO timestamp with dots/colons replaced by hyphens.
        expect(filename).toMatch(/^logs-apps-motor-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/);
        // Must NOT contain colons in the timestamp portion (before `.json`).
        const base = filename.replace(/\.json$/, '');
        expect(base).not.toContain(':');
    });

    it('log row is keyboard-focusable and toggles on Enter key', async () => {
        mockFetchEntityLogs.mockResolvedValue(sampleResult());
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<LogsPanel entityId="powertrain" entityType="components" />);

        await waitFor(() => {
            expect(screen.getByText('Temperature above 80C')).toBeInTheDocument();
        });

        // Find the row by its button role (tabIndex=0 + role="button")
        const rows = screen.getAllByRole('button').filter((el) => el.tagName === 'TR');
        expect(rows.length).toBeGreaterThan(0);
        const firstRow = rows[0];
        if (!firstRow) throw new Error('expected at least one log row');
        expect(firstRow).toHaveAttribute('tabIndex', '0');
        expect(firstRow).toHaveAttribute('aria-expanded', 'false');

        firstRow.focus();
        await user.keyboard('{Enter}');

        expect(screen.getByText(/checkTemp/)).toBeInTheDocument();
        // After expansion, aria-expanded should be true on the first row.
        const rowsAfter = screen.getAllByRole('button').filter((el) => el.tagName === 'TR');
        const firstRowAfter = rowsAfter[0];
        if (!firstRowAfter) throw new Error('expected at least one log row');
        expect(firstRowAfter).toHaveAttribute('aria-expanded', 'true');
    });

    it('renders aggregation header for areas', async () => {
        mockFetchEntityLogs.mockResolvedValue({
            items: [
                {
                    id: 'log_1',
                    timestamp: '2026-04-10T12:34:56.789000000Z',
                    severity: 'info',
                    message: 'area log',
                    context: { node: 'chassis/brake_ctrl' },
                },
            ],
            'x-medkit': {
                aggregation_level: 'area',
                aggregation_sources: ['chassis/brake_ctrl', 'chassis/steering_ctrl'],
                host_count: 2,
            },
        });

        render(<LogsPanel entityId="chassis" entityType="areas" />);

        await waitFor(() => {
            expect(screen.getByText(/aggregated from 2 sources/i)).toBeInTheDocument();
        });
    });

    it('does not render aggregation header when x-medkit is missing', async () => {
        mockFetchEntityLogs.mockResolvedValue({
            items: [
                {
                    id: 'log_1',
                    timestamp: '2026-04-10T12:34:56.789000000Z',
                    severity: 'info',
                    message: 'app log',
                    context: { node: 'motor' },
                },
            ],
        });

        render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(screen.getByText('app log')).toBeInTheDocument();
        });
        expect(screen.queryByText(/aggregated from/i)).not.toBeInTheDocument();
    });

    it('aborts in-flight request when entity changes', async () => {
        const abortedSignals: AbortSignal[] = [];
        mockFetchEntityLogs.mockImplementation((_et: string, _id: string, _params: unknown, signal: AbortSignal) => {
            abortedSignals.push(signal);
            return new Promise<LogsFetchResult>((resolve) => {
                signal.addEventListener('abort', () => resolve(emptyResult()));
            });
        });

        const { rerender } = render(<LogsPanel entityId="motor_a" entityType="apps" />);
        await waitFor(() => {
            expect(abortedSignals).toHaveLength(1);
        });

        rerender(<LogsPanel entityId="motor_b" entityType="apps" />);
        await waitFor(() => {
            expect(abortedSignals).toHaveLength(2);
        });

        expect(abortedSignals[0]?.aborted).toBe(true);
    });

    it('clears interval and aborts on unmount', async () => {
        mockFetchEntityLogs.mockResolvedValue(emptyResult());
        const { unmount } = render(<LogsPanel entityId="motor" entityType="apps" />);

        await waitFor(() => {
            expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
        });

        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        // Still only the single initial call - interval cleared.
        expect(mockFetchEntityLogs).toHaveBeenCalledTimes(1);
    });
});
