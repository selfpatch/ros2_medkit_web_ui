import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { restoreWindowWidth, stubWindowWidth } from '@/test/window-width';
import { isDesktopNow, useIsDesktop, useSidebarFold } from './useSidebarFold';

const KEY = 'ros2_medkit_web_ui_sidebar_folded';

function pressFoldShortcut(init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { code: 'Backslash', key: '\\', cancelable: true, ...init });
    act(() => {
        document.dispatchEvent(event);
    });
    return event;
}

describe('useSidebarFold', () => {
    beforeEach(() => {
        localStorage.clear();
        stubWindowWidth(true);
    });

    afterEach(() => {
        restoreWindowWidth();
        vi.restoreAllMocks();
    });

    it('starts unfolded and remembers a fold for the next visit', () => {
        const { result, unmount } = renderHook(() => useSidebarFold());
        expect(result.current[0]).toBe(false);

        act(() => result.current[1]());
        expect(result.current[0]).toBe(true);
        expect(localStorage.getItem(KEY)).toBe('1');
        unmount();

        const { result: next } = renderHook(() => useSidebarFold());
        expect(next.current[0]).toBe(true);
    });

    it('folds and unfolds with Cmd+\\ and Ctrl+\\, not with a bare backslash', () => {
        const { result } = renderHook(() => useSidebarFold());

        expect(pressFoldShortcut({ metaKey: true }).defaultPrevented).toBe(true);
        expect(result.current[0]).toBe(true);
        pressFoldShortcut({ ctrlKey: true });
        expect(result.current[0]).toBe(false);
        pressFoldShortcut({});
        expect(result.current[0]).toBe(false);
    });

    it('leaves the shortcut alone with Alt or Shift held', () => {
        const { result } = renderHook(() => useSidebarFold());

        expect(pressFoldShortcut({ ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
        pressFoldShortcut({ metaKey: true, shiftKey: true });
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('does nothing with the shortcut on a narrow window, where the sidebar does not fold', () => {
        stubWindowWidth(false);
        const { result } = renderHook(() => useSidebarFold());

        const event = pressFoldShortcut({ ctrlKey: true });

        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
        // The browser keeps the keys for whatever else it does with them
        expect(event.defaultPrevented).toBe(false);
    });

    it('still folds for this visit when the browser keeps nothing', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        const { result } = renderHook(() => useSidebarFold());
        expect(result.current[0]).toBe(false);

        act(() => result.current[1]());
        expect(result.current[0]).toBe(true);
    });

    it('says which way it goes before it goes, by button or shortcut', () => {
        const onToggle = vi.fn();
        const { result } = renderHook(() => useSidebarFold(onToggle));

        act(() => result.current[1]());
        expect(onToggle).toHaveBeenLastCalledWith(true);
        pressFoldShortcut({ ctrlKey: true });
        expect(onToggle).toHaveBeenLastCalledWith(false);
        expect(onToggle).toHaveBeenCalledTimes(2);
    });
});

describe('useIsDesktop', () => {
    afterEach(() => {
        restoreWindowWidth();
    });

    it('follows the window across the md breakpoint', () => {
        const width = stubWindowWidth(true);
        const { result, unmount } = renderHook(() => useIsDesktop());
        expect(result.current).toBe(true);
        expect(width.queries).toContain('(min-width: 768px)');

        width.resize(false);
        expect(result.current).toBe(false);
        width.resize(true);
        expect(result.current).toBe(true);

        unmount();
        expect(width.listeners.size).toBe(0);
    });

    it('reads the width now, for handlers outside React', () => {
        const width = stubWindowWidth(false);
        expect(isDesktopNow()).toBe(false);
        width.resize(true);
        expect(isDesktopNow()).toBe(true);
    });
});
