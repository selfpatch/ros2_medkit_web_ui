# ros2_medkit_web_ui

[![CI](https://github.com/selfpatch/ros2_medkit_web_ui/actions/workflows/ci.yml/badge.svg)](https://github.com/selfpatch/ros2_medkit_web_ui/actions/workflows/ci.yml)
[![GHCR](https://img.shields.io/badge/GHCR-ghcr.io%2Fselfpatch%2Fros2__medkit__web__ui-blue?logo=github)](https://github.com/selfpatch/ros2_medkit_web_ui/pkgs/container/ros2_medkit_web_ui)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://selfpatch.github.io/ros2_medkit/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-7289DA?logo=discord&logoColor=white)](https://discord.gg/6CXPMApAyq)

Simple, open-source web UI for browsing SOVD (Service-Oriented Vehicle Diagnostics) entity trees via discovery endpoints.

## What is ros2_medkit_web_ui?

ros2_medkit_web_ui is a lightweight single-page application that connects to a SOVD server and visualizes the entity hierarchy. It provides:

- **Server Connection Dialog** - Enter the URL of your SOVD server (supports both `http://ip:port` and `ip:port` formats)
- **Entity Tree Sidebar** - Browse the hierarchical structure of SOVD entities with lazy-loading, with a readiness lamp on app and component nodes (a green disc for ready, an amber ring for not ready, a grey square for a readiness the UI has not established). The lamp is re-read while the branch is open, so it tracks an entity that stops or comes back
- **Entity Detail Panel** - View raw JSON details of any selected entity
- **Entity Lifecycle Status Control** - View readiness and request lifecycle transitions (start, restart, force-restart, shutdown, force-shutdown) for apps and components, degrading gracefully on an entity with no lifecycle provider, without taking the entities that have one with it. Actions are gated by the current status (a transition the current status does not allow is marked unavailable and rejected, and stays focusable so the tooltip explaining why reaches a screen reader), and every destructive transition (all but Start) asks for confirmation before dispatch. A transition is only reported as requested when the gateway accepts it; because acceptance is not completion, the readiness is dropped and re-established by the refresh rather than read back straight away
- **Scripts Tab** - List the scripts available on an entity, run one with optional parameters, watch its live status while it executes, see the output once it completes, stop or force-kill a running execution, upload a new script (from a file or written directly in the browser), and delete scripts you no longer need

> **Note:** The Scripts tab only appears for entities whose gateway reports `capabilities.scripts` in `GET /`, and even then only for apps and components - areas and functions never show it regardless of the capability. The gateway sets this when either a script provider plugin is loaded or `scripts.scripts_dir` is configured; a plugin takes precedence over `scripts_dir`, and when one is loaded `scripts_dir` is ignored.

This tool is designed for developers and integrators working with SOVD-compatible systems who need a quick way to explore and debug the entity structure.

## Status

> **Early prototype / work in progress**
>
> This is an open source project for exploring SOVD entity discovery.
> APIs and features may change as the project evolves.

## Target Use Cases

- Exploring SOVD entity hierarchy on a connected server
- Debugging SOVD discovery endpoints
- Quick inspection of entity metadata and structure
- Learning about SOVD entity models

## Quick Start

### Using Docker

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/selfpatch/ros2_medkit_web_ui:latest
docker run -p 8080:80 ghcr.io/selfpatch/ros2_medkit_web_ui:latest

# Or build locally
docker build -t ros2_medkit_web_ui .
docker run -p 8080:80 ros2_medkit_web_ui
```

Then open http://localhost:8080 in your browser.

#### Docker Image Tags

Docker images are automatically published to GitHub Container Registry via GitHub Actions:

| Trigger              | Image Tags                          |
| -------------------- | ----------------------------------- |
| Push/merge to `main` | `latest`, `sha-<commit>`            |
| Git tag `v1.2.3`     | `1.2.3`, `1.2`, `1`, `sha-<commit>` |

> **Note:** Images are currently built for `linux/amd64` only. ARM64 support is planned.

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run the end-to-end suite against a containerised gateway
docker compose -f e2e/docker-compose.yml up -d
npm run test:e2e

# Run the end-to-end suite with the Playwright UI
npm run test:e2e:ui

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run typecheck

# Lint code
npm run lint
```

## Usage

1. Open the application in your browser
2. Enter the SOVD server URL in the connection dialog (e.g., `192.168.1.100:8080` or `http://localhost:3000`)
3. Click "Connect" to establish connection
4. Browse the entity tree in the left sidebar
5. Click on any entity to view its details in the main panel

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS 4** - Styling
- **shadcn/ui** - UI components
- **Zustand** - State management
- **lucide-react** - Icons
- **Vitest** - Unit and component testing framework
- **Playwright** - End-to-end testing against a containerised gateway
- **Prettier** - Code formatting
- **Husky** - Git hooks

## Contributing

Contributions and feedback are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

By contributing, you agree to follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Security

If you discover a security vulnerability, please follow the process in [`SECURITY.md`](SECURITY.md).

## License

This project is licensed under the Apache License 2.0. See the [`LICENSE`](LICENSE) file for details.
