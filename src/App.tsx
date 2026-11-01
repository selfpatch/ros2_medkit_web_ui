import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import { ToastContainer, toast } from 'react-toastify';
import { Menu } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EntityTreeSidebar } from '@/components/EntityTreeSidebar';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { ServerConnectionDialog } from '@/components/ServerConnectionDialog';
import { SearchCommand } from '@/components/SearchCommand';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSearchShortcut } from '@/hooks/useSearchShortcut';
import { SidebarContext, useIsDesktop, useSidebarFold } from '@/hooks/useSidebarFold';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type ViewMode = 'entity' | 'faults-dashboard' | 'updates-dashboard';

function App() {
    const { isConnected, serverUrl, connect, clearSelection, selectedPath } = useAppStore(
        useShallow((state) => ({
            isConnected: state.isConnected,
            serverUrl: state.serverUrl,
            connect: state.connect,
            clearSelection: state.clearSelection,
            selectedPath: state.selectedPath,
        }))
    );

    const [showConnectionDialog, setShowConnectionDialog] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('entity');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    // Folding is for wide windows; on a phone the sidebar is a menu over the view
    const [sidebarFolded, toggleSidebarFolded] = useSidebarFold();
    const desktop = useIsDesktop();
    const folded = sidebarFolded && desktop;
    const sidebar = useMemo(() => ({ folded, toggle: toggleSidebarFolded }), [folded, toggleSidebarFolded]);
    const autoConnectAttempted = useRef(false);

    // Keyboard shortcut: Ctrl+K / Cmd+K to open search
    const openSearch = useCallback(() => setShowSearch(true), []);
    useSearchShortcut(openSearch);

    // Handle faults dashboard navigation
    const handleFaultsDashboardClick = useCallback(() => {
        clearSelection();
        setViewMode('faults-dashboard');
        // Close sidebar on mobile when navigating
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }, [clearSelection]);

    // Handle updates dashboard navigation
    const handleUpdatesDashboardClick = useCallback(() => {
        clearSelection();
        setViewMode('updates-dashboard');
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }, [clearSelection]);

    // When entity is selected, switch back to entity view
    const handleEntitySelect = useCallback(() => {
        setViewMode('entity');
        // Close sidebar on mobile when selecting entity
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }, []);

    // Close sidebar on mobile when entity is selected from search
    useEffect(() => {
        if (selectedPath && window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }, [selectedPath]);

    // Auto-connect on mount if we have a stored URL (once only). The ref guard
    // alone survives React Strict Mode's mount-cleanup-remount cycle in dev;
    // deferring the call via setTimeout previously let the Strict Mode cleanup
    // cancel it before it ever fired, so connect() was never actually called.
    useEffect(() => {
        if (!serverUrl || isConnected || autoConnectAttempted.current) return;
        autoConnectAttempted.current = true;

        connect(serverUrl).then((success) => {
            if (!success) {
                setShowConnectionDialog(true);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ErrorBoundary
            onError={(error) => {
                toast.error(`Application error: ${error.message}`);
            }}
        >
            <TooltipProvider>
                <SidebarContext.Provider value={sidebar}>
                    {/* The sidebar and the view as one white pane on the canvas */}
                    <div className="flex h-dvh bg-canvas relative">
                        {/* Sidebar with responsive behavior */}
                        {/* From md up it sits beside the view and folds away to nothing (its button or
                        Cmd/Ctrl+\), the view's edge following it on one curve */}
                        <div
                            className={cn(
                                'fixed inset-y-0 left-0 z-40 w-72 shrink-0 transform transition-[translate,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:relative md:translate-x-0 md:overflow-hidden',
                                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                                folded && 'md:w-0'
                            )}
                            aria-hidden={folded || undefined}
                            inert={folded || undefined}
                        >
                            <EntityTreeSidebar
                                viewMode={viewMode}
                                onSettingsClick={() => setShowConnectionDialog(true)}
                                onClose={() => setSidebarOpen(false)}
                                onFaultsDashboardClick={handleFaultsDashboardClick}
                                onUpdatesDashboardClick={handleUpdatesDashboardClick}
                            />
                        </div>

                        {/* Overlay for mobile when sidebar is open */}
                        {sidebarOpen && (
                            <button
                                type="button"
                                className="fixed inset-0 z-30 bg-graphite/30 md:hidden cursor-default"
                                onClick={() => setSidebarOpen(false)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                        setSidebarOpen(false);
                                    }
                                }}
                                aria-label="Close sidebar"
                            />
                        )}

                        {/* Main content: from md up the pane keeps the same gap all round and scrolls inside */}
                        <div
                            className={cn(
                                'flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:py-1.5 md:pr-1.5',
                                folded && 'md:pl-1.5'
                            )}
                        >
                            <div className="pane flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-xl">
                                {/* On a phone the brand and the menu are a bar on top of the view */}
                                <header className="flex h-[52px] shrink-0 items-center border-b border-hairline pr-2.5 pl-4 md:hidden">
                                    <Brand height={16} />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="ml-auto size-9"
                                        onClick={() => setSidebarOpen(true)}
                                        aria-label="Open menu"
                                        aria-expanded={sidebarOpen}
                                    >
                                        <Menu className="w-5 h-5" />
                                    </Button>
                                </header>
                                <ErrorBoundary>
                                    <EntityDetailPanel
                                        onConnectClick={() => setShowConnectionDialog(true)}
                                        viewMode={viewMode}
                                        onEntitySelect={handleEntitySelect}
                                    />
                                </ErrorBoundary>
                            </div>
                        </div>

                        <ServerConnectionDialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog} />
                        <SearchCommand open={showSearch} onOpenChange={setShowSearch} />
                        <ToastContainer
                            position="bottom-right"
                            autoClose={5000}
                            hideProgressBar={false}
                            newestOnTop
                            closeOnClick
                            rtl={false}
                            pauseOnFocusLoss
                            draggable
                            pauseOnHover
                            theme="light"
                        />
                    </div>
                </SidebarContext.Provider>
            </TooltipProvider>
        </ErrorBoundary>
    );
}

export default App;
