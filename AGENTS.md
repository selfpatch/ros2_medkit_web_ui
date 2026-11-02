# AI Agent Instructions

This document provides quick reference for AI coding agents working on the SOVD Web UI project.

## Quick Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Start development server (port 5173) |
| `npm run build`         | Build for production                 |
| `npm test`              | Run tests with Vitest                |
| `npm run test:ui`       | Run tests with Vitest UI             |
| `npm run test:coverage` | Run tests with coverage report       |
| `npm run lint`          | Run ESLint                           |
| `npm run format`        | Format code with Prettier            |
| `npm run format:check`  | Check formatting without writing     |
| `npm run typecheck`     | Run TypeScript type checking         |

## Project Overview

React 19 + Vite + TypeScript SPA for browsing SOVD entity trees from ros2_medkit gateway.

## Important Files

| File                                | Purpose                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/api-dispatch.ts`           | Routes a call to the generated client's typed path for an entity type (`/apps/{app_id}/...`, `/components/{component_id}/...`) |
| `src/lib/store.ts`                  | Zustand state management                                                                                                       |
| `src/lib/types.ts`                  | TypeScript interfaces for API types                                                                                            |
| `src/lib/schema-utils.ts`           | JSON Schema utilities                                                                                                          |
| `src/lib/fault-story.ts`            | A fault's life in plain words: when it was first reported, when this time came, when and how it ended (pure, unit-tested)      |
| `src/lib/fault-readings.ts`         | What a fault's freeze frames read, as named readings with units, next to what the same topics read now (pure, unit-tested)     |
| `src/lib/clipboard.ts`              | Copy text, with a fallback for pages served over plain http, where the Clipboard API is missing                                |
| `src/hooks/useLiveFaultReadings.ts` | Re-reads an open fault's topics every 5 s through the app that reports it, only while the browser tab is visible               |
| `src/hooks/useFaultPolling.ts`      | One shared poll of the fault list for the dashboard and the sidebar badge                                                      |
| `src/hooks/useSidebarFold.ts`       | The sidebar fold and Cmd/Ctrl+\\, and the md breakpoint (`isDesktopNow`, `useIsDesktop`)                                       |
| `src/components/`                   | React components                                                                                                               |
| `src/components/ui/`                | shadcn/ui primitives                                                                                                           |

## Gateway API

- **Base URL**: `http://localhost:8080/api/v1`
- **Key endpoints**:
    - `GET /areas` - List areas
    - `GET /components` - List components
    - `GET /apps` - List apps
    - `GET /components/{id}/data` - Component data topics
    - `GET /components/{id}/operations` - Component operations
    - `GET /components/{id}/configurations` - Component configurations

## Architecture Patterns

1. **State Management**: Zustand with persist middleware
2. **API Layer**: The generated openapi-fetch client from `@selfpatch/ros2-medkit-client-ts` (`MedkitClient`, created on connect and held in the store as `client`), with `src/lib/api-dispatch.ts` choosing the typed path per entity type
3. **Component Structure**: Feature-based organization
4. **Styling**: Tailwind CSS 4 + shadcn/ui components

## Styling

- Light theme only: no `dark:` variants and no theme toggle.
- Colours, fonts and radii are tokens in `src/index.css` (`@theme`): `canvas`, `graphite`, `body`, `faint`, `hairline`, `acid` (the one main action of a view), and the robot states `state-ok`, `state-warn*`, `state-fault*`, `state-off`, `state-healed-text`, `state-fixed*`. Colour is for states; everything else is graphite on white. Tailwind's own palette (`text-blue-500`, `bg-green-100`, ...) is not used: a state takes its `state-*` token, an icon or a label `text-faint` / `text-body` (`src/test/design-rules.test.ts` checks both this and the focus-ring rule below).
- `pane` is the white pane on the canvas that holds the view; `raised` is the picked segment or the current place (white with a hairline shadow).
- Segmented controls use `SEGMENT_GROUP` and `segmentClass(active, size)` from `SegmentedSwitch.tsx`; a heading inside a view uses `SectionHeading` (h1-h3 get the display font by default).
- Focus rings: in Tailwind 4 `outline-none` sets the outline style to none and `focus-visible:outline-2` sets only the width, so a ring also needs `focus-visible:outline-solid`: `outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring`. A row of a `RowGrid` never takes `outline-none` (the grid draws its separators as the rows' outlines); it uses the `focus-visible:` classes only.
- Anything clickable is a `<button>` (or a link), never a `div` with `onClick`, so the keyboard reaches it.

## Testing

- Tests are co-located with source files: `*.test.ts` / `*.test.tsx`
- Integration tests: `src/test/integration/`
- Use `@testing-library/react` for component tests
- Use `vitest` for unit tests

## Conventions

- Use TypeScript strict mode
- Prefer interfaces over types
- Use `@/` path alias for imports from src
- Format with Prettier before commit (automatic via husky)
