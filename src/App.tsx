import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { ToastContainer, toast } from 'react-toastify';
import { Menu, X } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EntityTreeSidebar } from '@/components/EntityTreeSidebar';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { ServerConnectionDialog } from '@/components/ServerConnectionDialog';
import { SearchCommand } from '@/components/SearchCommand';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSearchShortcut } from '@/hooks/useSearchShortcut';
import { useAppStore } from '@/lib/store';

type ViewMode = 'entity' | 'faults-dashboard';

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

    // Auto-connect on mount if we have a stored URL
    useEffect(() => {
        if (serverUrl && !isConnected && !autoConnectAttempted.current) {
            autoConnectAttempted.current = true;
            connect(serverUrl).then((success) => {
                if (!success) {
                    toast.error('Auto-connect failed. Please check your server settings.');
                    setShowConnectionDialog(true);
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <ErrorBoundary
            onError={(error) => {
                toast.error(`Application error: ${error.message}`);
            }}
        >
            <TooltipProvider>
                <div className="flex h-screen bg-background relative">
                    {/* Mobile menu toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="fixed top-3 left-3 z-50 md:hidden"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
                    >
                        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </Button>

                    {/* Sidebar with responsive behavior */}
                    <div
                        className={`
                        fixed inset-y-0 left-0 z-40 w-80 transform transition-transform duration-200 ease-in-out
                        md:relative md:translate-x-0
                        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    `}
                    >
                        <EntityTreeSidebar
                            onSettingsClick={() => setShowConnectionDialog(true)}
                            onFaultsDashboardClick={handleFaultsDashboardClick}
                        />
                    </div>

                    {/* Overlay for mobile when sidebar is open */}
                    {sidebarOpen && (
                        <button
                            type="button"
                            className="fixed inset-0 z-30 bg-black/50 md:hidden cursor-default"
                            onClick={() => setSidebarOpen(false)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                    setSidebarOpen(false);
                                }
                            }}
                            aria-label="Close sidebar"
                        />
                    )}

                    {/* Main content */}
                    <div className="flex-1 md:ml-0 flex flex-col overflow-hidden">
                        <ErrorBoundary>
                            <EntityDetailPanel
                                onConnectClick={() => setShowConnectionDialog(true)}
                                viewMode={viewMode}
                                onEntitySelect={handleEntitySelect}
                            />
                        </ErrorBoundary>
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
                        theme="dark"
                    />
                </div>
            </TooltipProvider>
        </ErrorBoundary>
    );
}

export default App;
