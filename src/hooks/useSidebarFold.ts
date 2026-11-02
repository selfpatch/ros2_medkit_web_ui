import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// This browser remembers whether the sidebar is folded away
const FOLD_KEY = 'ros2_medkit_web_ui_sidebar_folded';

// From this width the sidebar sits beside the view and can fold; below it, it is a menu over the view
const DESKTOP_QUERY = '(min-width: 768px)';

function readFolded(): boolean {
    try {
        return localStorage.getItem(FOLD_KEY) === '1';
    } catch {
        return false;
    }
}

/** Whether the window is wide enough now for the sidebar to sit beside the view, for handlers outside React */
export function isDesktopNow(): boolean {
    return window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * Whether the sidebar is folded away for more room, toggled by its button or Cmd/Ctrl+\,
 * and remembered by this browser. Below md the sidebar is a menu over the view and does not
 * fold, so the shortcut does nothing there rather than flip a setting no one can see.
 * `onToggle` hears which way it goes (true: folding away) before it goes, while focus is still
 * where the user left it.
 */
export function useSidebarFold(onToggle?: (folding: boolean) => void): [boolean, () => void] {
    const [folded, setFolded] = useState(readFolded);
    // The fold now, for a toggle that has to know which way it goes before the state moves
    const foldedRef = useRef(folded);

    const toggle = useCallback(() => {
        const next = !foldedRef.current;
        foldedRef.current = next;
        onToggle?.(next);
        try {
            localStorage.setItem(FOLD_KEY, next ? '1' : '0');
        } catch {
            // A browser that keeps nothing still folds for this visit
        }
        setFolded(next);
    }, [onToggle]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.code !== 'Backslash') return;
            if (!isDesktopNow()) return;
            e.preventDefault();
            toggle();
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [toggle]);

    return [folded, toggle];
}

/**
 * Whether the window is wide enough for the sidebar to sit beside the view
 */
export function useIsDesktop(): boolean {
    const [desktop, setDesktop] = useState(isDesktopNow);

    useEffect(() => {
        const list = window.matchMedia(DESKTOP_QUERY);
        const change = () => setDesktop(list.matches);
        change();
        list.addEventListener('change', change);
        return () => list.removeEventListener('change', change);
    }, []);

    return desktop;
}

/** The sidebar's fold, for the views that offer the way back to it */
export const SidebarContext = createContext<{ folded: boolean; toggle: () => void }>({
    folded: false,
    toggle: () => {},
});

export function useSidebar() {
    return useContext(SidebarContext);
}
