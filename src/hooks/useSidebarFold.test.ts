import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSidebarFold } from './useSidebarFold';

const KEY = 'ros2_medkit_web_ui_sidebar_folded';

function pressFoldShortcut(init: KeyboardEventInit) {
    act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash', key: '\\', ...init }));
    });
}

describe('useSidebarFold', () => {
    beforeEach(() => localStorage.clear());

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

        pressFoldShortcut({ metaKey: true });
        expect(result.current[0]).toBe(true);
        pressFoldShortcut({ ctrlKey: true });
        expect(result.current[0]).toBe(false);
        pressFoldShortcut({});
        expect(result.current[0]).toBe(false);
    });
});
