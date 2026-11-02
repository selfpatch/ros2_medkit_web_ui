# Copilot Instructions

## Project Overview

React 19 + Vite + TypeScript SPA for browsing SOVD (Service-Oriented Vehicle Diagnostics) entity trees from ros2_medkit gateway. The UI provides an entity browser for exploring ROS 2 diagnostics data exposed via the SOVD REST API.

## Architecture

```
src/
├── App.tsx                  # The shell: sidebar (folds away on wide windows), the view pane, dialogs
├── components/              # React components
│   ├── ui/                  # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── EntityTreeSidebar.tsx      # Brand, Faults Dashboard, tree with search; the gateway and Updates at the foot
│   ├── EntityTreeNode.tsx         # Tree node component with expand/collapse
│   ├── EntityDetailPanel.tsx      # Entity details view (dispatch to type-specific panels); exports ViewMode
│   ├── EntityToolbar.tsx          # The line on top of a view: breadcrumb, title, kind, actions
│   ├── SidebarToggle.tsx          # The sidebar's fold button, and the line holding it in views without a toolbar
│   ├── ResourceTabBar.tsx         # An entity's resource tabs as one segmented control
│   ├── SegmentedSwitch.tsx        # Small segmented switch; SEGMENT_GROUP and segmentClass for the others
│   ├── RowGrid.tsx                # Rows in one hairline grid
│   ├── DataRow.tsx                # A data item's row that opens it; topicPathOf
│   ├── SectionHeading.tsx         # A section's heading inside a view
│   ├── ResourceReadError.tsx      # "Could not load ...: reason" with Retry, where a list would be
│   ├── EntityResourceTabs.tsx     # Tabbed interface for data/operations/configs/faults
│   ├── ServerInfoPanel.tsx        # Server connection info and capabilities
│   ├── OperationsPanel.tsx        # ROS 2 service/action invocation
│   ├── ConfigurationPanel.tsx     # ROS 2 parameter management
│   ├── LogsPanel.tsx              # An entity's logs, filters and log configuration
│   ├── FaultsDashboard.tsx        # Gateway-wide faults: Now/History, severity and status filters, counts, grouping, Clear
│   ├── FaultDetail.tsx            # A fault's page: its story, readings then and now, recordings
│   ├── FaultsPanel.tsx            # Entity-specific faults
│   ├── SearchCommand.tsx          # Ctrl+K command palette for entity search
│   └── ServerConnectionDialog.tsx # Server URL input dialog
├── hooks/
│   ├── useFaultPolling.ts         # One shared poll of the fault list
│   ├── useLiveFaultReadings.ts    # An open fault's topics re-read every 5 s while the tab is visible
│   └── useSidebarFold.ts          # Sidebar fold, Cmd/Ctrl+\, md breakpoint (isDesktopNow, useIsDesktop)
├── lib/
│   ├── api-dispatch.ts      # Typed gateway paths per entity type for the generated client
│   ├── store.ts             # Zustand state management (entity tree, selection, faults)
│   ├── transforms.ts        # Gateway responses into the UI's types
│   ├── types.ts             # TypeScript interfaces for API types
│   ├── fault-story.ts       # A fault's life in plain words
│   ├── fault-readings.ts    # A fault's readings, then and now
│   ├── clipboard.ts         # Copy text, with a fallback for plain-http pages
│   ├── schema-utils.ts      # JSON Schema utilities for form generation
│   └── utils.ts             # Utility functions
└── test/
    ├── setup.ts             # Vitest setup
    └── window-width.ts      # matchMedia stand-in for tests that need a window width
```

## Entity Model

**SOVD entity hierarchy:**

- **Area** → namespace grouping (e.g., `/powertrain`, `/chassis`)
- **Subarea** → nested namespace
- **Component** → logical grouping, contains apps
- **Subcomponent** → nested component
- **App** → individual ROS 2 node
- **Function** → capability grouping (functional view)

**Resources** (available on components/apps/functions/areas):

- `data` → ROS 2 topics
- `operations` → ROS 2 services and actions
- `configurations` → ROS 2 parameters
- `faults` → diagnostic trouble codes

## Key Patterns

### State Management (Zustand)

```typescript
// src/lib/store.ts
export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // Connection state
            serverUrl: null,
            client: null,
            isConnected: false,

            // Entity tree
            rootEntities: [],
            selectedPath: null,
            selectedEntity: null,
            expandedPaths: [],

            // Shared faults state (used by FaultsDashboard and FaultsCountBadge)
            faults: [],
            isLoadingFaults: false,

            // Actions
            connect: async (url) => {
                /* ... */
            },
            selectEntity: async (path) => {
                /* ... */
            },
            loadChildren: async (path) => {
                /* ... */
            },
            fetchFaults: async () => {
                /* ... */
            },
        }),
        { name: 'ros2_medkit_web_ui_server_url', partialize: (state) => ({ serverUrl, baseEndpoint }) }
    )
);
```

### Entity Selection Handlers

The `selectEntity` action uses type-specific handlers for cleaner code:

```typescript
// Handlers extracted from selectEntity for maintainability
handleTopicSelection(ctx, client); // Async - may fetch full topic data
handleServerSelection(ctx); // Show server info panel
handleComponentSelection(ctx); // Auto-expand, show resources
handleAreaSelection(ctx); // Auto-expand
handleFunctionSelection(ctx); // Show function with hosts
handleAppSelection(ctx); // Show app details
handleFaultSelection(ctx); // Show fault details
handleParameterSelection(ctx); // Show parameter editor
handleOperationSelection(ctx); // Show operation invocation
```

### API Client

There is no hand-written client: calls go through the generated openapi-fetch client from
`@selfpatch/ros2-medkit-client-ts`, created on connect and kept in the store as `client`.
The generated paths are per entity type, so `src/lib/api-dispatch.ts` picks the typed path:

```typescript
// src/lib/api-dispatch.ts
getEntityData(client, 'apps', 'talker'); // GET /apps/{app_id}/data
getEntityOperations(client, entityType, entityId); // GET /{components|apps|areas|functions}/{id}/operations
deleteEntityFault(client, entityType, entityId, code); // DELETE .../faults/{fault_code}
```

Components do not call the client themselves: they use the store's actions (`fetchEntityData`,
`fetchEntityOperations`, `listEntityFaults`, ...).

## Conventions

- Use `useAppStore` with `useShallow` for selective subscriptions
- All API types defined in `lib/types.ts`
- Use `@/` path alias for imports from src
- Prefer composition over inheritance
- Use shadcn/ui components from `components/ui/`
- Resources (data, operations, configurations, faults) shown in detail panel tabs, not as tree nodes
- Lazy load resources per tab in `EntityResourceTabs` to avoid unnecessary API calls
- Format with Prettier (automatic via husky pre-commit)

## Testing

- Unit tests: `*.test.ts` next to source files
- Use `@testing-library/react` for component tests
- Run tests: `npm test`
- Run lint: `npm run lint`

## Gateway API Reference

Default base URL: `http://localhost:8080/api/v1`

| Method | Endpoint                                    | Description                          |
| ------ | ------------------------------------------- | ------------------------------------ |
| GET    | `/areas`                                    | List all areas (namespace groupings) |
| GET    | `/components`                               | List all components                  |
| GET    | `/apps`                                     | List all apps (ROS 2 nodes)          |
| GET    | `/functions`                                | List all functions                   |
| GET    | `/{entity_type}/{id}/data`                  | List data topics for entity          |
| GET    | `/{entity_type}/{id}/operations`            | List operations (services/actions)   |
| GET    | `/{entity_type}/{id}/configurations`        | List configurations (parameters)     |
| GET    | `/{entity_type}/{id}/faults`                | List faults for entity               |
| GET    | `/faults`                                   | List all faults across system        |
| POST   | `/{entity_type}/{id}/operations/{name}`     | Create execution (call operation)    |
| DELETE | `/{entity_type}/{id}/faults/{code}`         | Clear a fault                        |
| PUT    | `/{entity_type}/{id}/configurations/{name}` | Update configuration value           |

## Important Notes

- This UI connects to `ros2_medkit_gateway` running on port 8080
- Entity IDs are alphanumeric + underscore + hyphen only
- Entity types for API: `areas`, `components`, `apps`, `functions` (plural)
