# Copilot Instructions

## Project Overview

React 19 + Vite + TypeScript SPA for browsing SOVD (Service-Oriented Vehicle Diagnostics) entity trees from ros2_medkit gateway. The UI provides an entity browser for exploring ROS 2 diagnostics data exposed via the SOVD REST API.

## Architecture

```
src/
├── components/              # React components
│   ├── ui/                  # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── EntityTreeSidebar.tsx      # Main navigation tree with collapsible nodes
│   ├── EntityTreeNode.tsx         # Tree node component with expand/collapse
│   ├── EntityDetailPanel.tsx      # Entity details view (dispatch to type-specific panels)
│   ├── EntityResourceTabs.tsx     # Tabbed interface for data/operations/configs/faults
│   ├── ServerInfoPanel.tsx        # Server connection info and capabilities
│   ├── OperationsPanel.tsx        # ROS 2 service/action invocation
│   ├── ConfigurationPanel.tsx     # ROS 2 parameter management
│   ├── FaultsDashboard.tsx        # System-wide faults view with filtering
│   ├── FaultsPanel.tsx            # Entity-specific faults
│   ├── SearchCommand.tsx          # Ctrl+K command palette for entity search
│   └── ServerConnectionDialog.tsx # Server URL input dialog
├── lib/
│   ├── sovd-api.ts          # Typed HTTP client for gateway REST API
│   ├── store.ts             # Zustand state management (entity tree, selection, faults)
│   ├── types.ts             # TypeScript interfaces for API types
│   ├── schema-utils.ts      # JSON Schema utilities for form generation
│   └── utils.ts             # Utility functions
└── test/
    └── setup.ts             # Vitest setup
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

```typescript
// src/lib/sovd-api.ts
export class SovdApiClient {
    constructor(private baseUrl: string) {}

    // Entity listing
    async getAreas(): Promise<Area[]>;
    async getComponents(): Promise<Component[]>;
    async getApps(): Promise<App[]>;
    async getFunctions(): Promise<SovdFunction[]>;

    // Entity resources
    async getEntityData(entityType, entityId): Promise<ComponentTopic[]>;
    async listOperations(entityId, entityType): Promise<Operation[]>;
    async listConfigurations(entityId, entityType): Promise<ConfigurationResponse>;
    async listEntityFaults(entityType, entityId): Promise<FaultsResponse>;

    // Operations (SOVD Execution Model)
    async createExecution(entityId, operationName, request): Promise<CreateExecutionResponse>;
    async getExecutionStatus(entityId, operationName, executionId): Promise<Execution>;
    async cancelExecution(entityId, operationName, executionId): Promise<void>;
}
```

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
