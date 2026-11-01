import { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

/**
 * Whether the sidebar is folded away for more room, toggled by its button or Cmd/Ctrl+\,
 * and remembered by this browser.
 */
export function useSidebarFold(): [boolean, () => void] {
    const [folded, setFolded] = useState(readFolded);

    const toggle = useCallback(() => {
        setFolded((now) => {
            try {
                localStorage.setItem(FOLD_KEY, now ? '0' : '1');
            } catch {
                // A browser that keeps nothing still folds for this visit
            }
            return !now;
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === 'Backslash') {
                e.preventDefault();
                toggle();
            }
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
    const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

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
