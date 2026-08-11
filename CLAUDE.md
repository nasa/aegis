# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AEGIS (Artemis EVA GIS) is a full-stack web application for planning, training, and executing lunar surface EVA (Extra-Vehicular Activity) missions. It provides a collaborative GIS interface with real-time multi-user editing.

## Commands

```bash
# Local development (starts Vite + API concurrently)
npm run dev

# Frontend only
npm run vite:dev

# Backend only (with hot reload)
npm run api:dev

# Start required Docker services (PostgreSQL + GDAL)
npm run docker:services

# Build everything
npm run build

# Lint (ESLint + StyleLint)
npm run lint
npm run lint:fix

# Unit tests (Vitest)
npm run test:vitest

# Component/DOM tests (Vitest browser mode)
npm run test:vitest:browser

# Full CI check (lint + tsc + build + unit tests)
npm run test:all

# E2E tests (Playwright)
npm run test:playwright

# Database migrations
npm run migration:up
npm run migration:down
npm run migration:fresh   # drop + recreate + seed

# Seed existing DB
npm run seed
```

## Comments

Keep comments short. Write comments that explain what the code does or why — never comments that narrate what wasn't done, what a previous approach was, or what you chose not to do. Delete such notes rather than adding them.

## After Code Changes

After every batch of code changes, run:

```bash
./node_modules/.bin/prettier --config .prettierrc.json --write <changed-files>
npm run test:all
```

Format every changed file with the root `.prettierrc.json` before the full check; use the direct Prettier command above and replace `<changed-files>` with the files changed in the batch. This runs lint (JS/TS + CSS) → tsc → build → vitest → vitest:browser in sequence. Fix any failures before reporting the task complete. Do not skip lint — this project has non-standard CSS and JS/TS lint rules that will fail on patterns that look valid (e.g. specific import ordering, CSS property conventions). If lint fails, read the error output carefully and fix exactly what it reports rather than guessing at the rule.

## Map / OpenLayers

Any prompt that mentions "map", "OpenLayers", "OL", "ol", tiles, markers, layers, or the map implementation must first read `src/components/interface/map/CLAUDE.md` for full architecture context before doing any work.

## GIS Data Conversion Pipeline

Any prompt about the GIS data processing pipeline (converting GIS drops into AEGIS map products — tiles, COG, PMTiles, GeoJSON, mission grids, `properties.json`/`manifest.json`, or the `register`/Box publish flow) must first read `GIS_data_conversion_pipeline/esri-to-aegis-lunar-southpole/CLAUDE.md` before doing any work.

## Architecture Overview

The app is a monolithic full-stack TypeScript project with a React SPA frontend and an Express API backend, both in the same `src/` tree.

### Key Directories

| Path                            | Role                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `src/components/`               | React UI components (panes, pages, dashboard, interface)     |
| `src/components/interface/map/` | OpenLayers map implementation (active map layer)             |
| `src/pages/`                    | Top-level page components routed by React Router             |
| `src/store/`                    | Redux Toolkit slices, thunks, selectors, and store utilities |
| `src/client/`                   | Automerge mutation helpers (client-side doc operations)      |
| `src/http-client/`              | Typed `fetch` wrappers for every REST endpoint               |
| `src/utils/`                    | Shared helpers: logging, formatting, permissions, socket ops |
| `src/packages/`                 | Lightweight shared utilities (fetchFns, user helpers)        |
| `src/server/express/`           | Express app, REST routes, Socket.io setup                    |
| `src/server/database/`          | MikroORM config, entity models, migrations, seeds            |
| `src/server/automerge/`         | PostgreSQL storage adapter for Automerge documents           |

### Frontend

- **React 18** SPA bootstrapped by Vite.
- **Redux Toolkit** manages UI state only. Slices live in `src/store/` (no `slices/` subdirectory), async operations in `src/store/thunk/`, memoized selectors in `src/store/selectors.ts`. Entity data (missions, EVAs, stations, POIs, etc.) is **not** stored in Redux — it lives exclusively in Automerge documents. Redux slices track only UI state: selected items, expanded panels, navigation state, etc.
- **OpenLayers** drives the map canvas. Map-related components live under `src/components/interface/map/` (the three entry points are `AegisMapEditor.tsx`, `AegisMapDashboard.tsx`, and `AegisMapMinimap.tsx`). See `src/components/interface/map/CLAUDE.md` for full architecture details.
- **Automerge** (v3 + automerge-repo) is the primary data layer for all collaborative entities. The repo is initialized in `src/index.tsx` with a WebSocket adapter pointed at `/api/automergeSocket/`. All entity mutations (mission, EVA, station, POI, traverse, action, rex) go through Automerge; mutation helpers are in `src/client/automerge/`. Selectors in `src/store/selectors.ts` read directly from Automerge doc state (e.g. `selectAsPlannedStations(mission: Mission)`) rather than from Redux.
- **Automerge mutation architecture** is organised into three layers to guarantee that each logical operation produces exactly one `.change()` patch (no half-built state visible to peers):
  - `apply*` (`src/client/automerge/apply/`): inner draft mutators that receive `(m: Mission, args)` and mutate the doc. Pure sync; never call `.change()` or import `missionDocHandle`. _(ESLint-enforced.)_
  - `stage*` (`src/client/automerge/stage/`): plan builders that receive a `Mission` snapshot and return a typed `*StageData` object (in `src/typings/thunkStageData.d.ts`) with all new uuids pre-allocated. Used for cascading multi-entity operations and any reusable plan-building logic shared across thunks. Two tiers exist:
    - **Sync stages** (default, most common): pure sync, no I/O. Examples: `stageDuplicateEva`, `stageDeleteRex`.
    - **Async stages** (allowed when needed): may `await` from a small allow-list of read-only data thunks (currently only `thunkGetElevation`). They still never call `.change()` and never call mutation thunks. Example: `stageTraverseUpdate`.
    - _(ESLint-enforced: `automergeDocHandles` blocked entirely; `store/thunk/**` blocked except the explicit allow-list.)_
  - `thunk*` (`src/store/thunk/*`): async orchestrators that may pre-fetch elevation/REST, then run a single `.change()` per logical operation.
  - **`withMissionChange`** (`src/client/automergeDocHandles.ts`): the only sanctioned mutation entry-point for components. Wraps the null-guard and `.change()` call so callers never have to handle either: `withMissionChange((m) => applyFoo(m, args))`. Composing multiple `apply*` inside one call is atomic.
  - See `src/client/automerge/README.md` for the full convention with examples.
- **Socket.io** client syncs non-Automerge real-time events (connection status, live notifications, preset/STM/folder upserts).
- Vite path aliases map `"store"`, `"components"`, `"utils"`, etc. directly to `src/` subdirectories — use these aliases in imports.

### Backend

- **Express 5** REST API on port 4001. Routes are organized by resource under `src/server/express/routes/`. REST routes cover infrastructure and admin concerns (auth, users, doc listings, elevation, STM rules, folders, grids, layers, presets, mission management utilities). Entity create/read/update/delete for action/eva/poi/rex/station/traverse is **not** handled via REST — those operations go through Automerge.
- **MikroORM 6** with PostgreSQL. Entity models live in `src/server/database/models/`. DB models still exist for legacy entities (action, eva, poi, rex, station, traverse) and are used by the Automerge migration script, but these entities are no longer read/written via ORM at runtime. Every request runs inside a `RequestContext` middleware for ORM isolation.
- **Socket.io** runs on **two separate Socket.IO server instances**:
  - **New server** (path `/api/socket`) — hosts the default AEGIS namespace and the Maestro v2 namespace.
  - **Legacy server** (path `/api/v1/socketio`) — hosts the Maestro v1 namespace only; retained for backward compatibility with older Maestro clients.
  - **Default namespace** (`/` on the new server) — handles AEGIS web-client connections: visitor presence, heartbeats (`statusFromServer` every 10s), and `storeUpsert`/`storeDelete` events for non-Automerge entities (Presets, STM Rules, Folders). Handlers are in `src/server/express/sockets.ts`.
  - **`/maestro` namespace** (on the legacy server, path `/api/v1/socketio`) — Maestro v1. Auth is enforced via EMSS token middleware. Emits `dataAll` (full `AegisSlice.AegisSlice` payload) throttled at 500 ms per mission to the room `maestro{missionId}`. Handlers: `missionJoin`, `missionLeave`, `subscribeToEva`, `unsubscribeToEva`, `getEverything`, `rexOverwrite` (v1-only), `getDebugInfo`. Setup in `src/server/maestro/v1/sockets-maestro.ts`; emission logic in `src/server/maestro/v1/sockets-maestro-emitters.ts`. **Deprecated — no new work should target v1.**
  - **`/maestro/v2` namespace** (on the new server, path `/api/socket`) — Maestro v2. Same auth and room conventions as v1. Handlers: `missionJoin`, `missionLeave`, `subscribeToEva`, `unsubscribeToEva`, `getEverything`, `sendMDAU` (v2-only; receives `MDAU.MaestroDataAegisUses` and writes back station updates to the Automerge doc), `getDebugInfo`. `rexOverwrite` has been removed. Setup in `src/server/maestro/v2/sockets-maestro.ts`; emission logic in `src/server/maestro/v2/sockets-maestro-emitters.ts`. **This is the target for all new Maestro integration work.**

### Maestro Type Files — Do Not Modify Without Coordination

The following type declaration files define the contract between AEGIS and the external Maestro application. **AI agents must never modify these files.** Any change requires explicit coordination with the Maestro developer team, as both sides must update simultaneously:

- `src/server/maestro/v1/types/aegisSlice.d.ts` — `AegisSlice` namespace (v1 outbound payload shape)
- `src/server/maestro/v1/types/mdau.d.ts` — `MDAU` namespace (v1 inbound payload shape)
- `src/server/maestro/v2/types/aegisSlice.d.ts` — `AegisSlice` namespace (v2 outbound payload shape)
- `src/server/maestro/v2/types/mdau.d.ts` — `MDAU` namespace (v2 inbound payload shape)

- **Automerge repo** network adapter mounts at `/api/automergeSocket/` via WebSocket upgrade, using a custom `PostgresStorageAdapter` to persist documents to PostgreSQL.
- **Authentication** is delegated to `@emss/oauth2-proxy-backend`; secrets and environment config come from `env.secret.ts` (gitignored) and dotenv.

### Data Flow

```
Browser ──HTTP──▶ Express REST routes ──▶ MikroORM ──▶ PostgreSQL
       ──WS──▶   Automerge repo adapter ──▶ PostgresStorageAdapter ──▶ PostgreSQL
       ──WS──▶   Socket.io handlers
```

REST responses are wrapped as `WrappedResponse<T>` with a `status` field (`"ok"` | `"error"`) — match this shape in all new endpoints and `http-client/` functions.

### Domain Concepts

The app organizes around these core entities. Since the Automerge entity migration, the storage layer differs per entity — see the table below:

| Entity                      | Automerge helpers (`src/client/automerge/apply/`)    | Redux slice (UI state only) | DB model    | REST routes    |
| --------------------------- | ---------------------------------------------------- | --------------------------- | ----------- | -------------- |
| **Mission**                 | `apply-mission.ts` + sub-files                       | `mission.ts`                | ✅          | ✅             |
| **EVA**                     | `apply-eva.ts`                                       | `eva.ts`                    | ✅ (legacy) | ❌ removed     |
| **POI**                     | `apply-poi.ts`                                       | `poi.ts`                    | ✅ (legacy) | ❌ removed     |
| **Station**                 | `apply-station.ts`                                   | `station.ts`                | ✅ (legacy) | ❌ removed     |
| **Traverse**                | `apply-traverse.ts`                                  | `traverse.ts`               | ✅ (legacy) | ❌ removed     |
| **Action / ActionTemplate** | `apply-action.ts`, `apply-mission-actionTemplate.ts` | `action.ts`                 | ✅ (legacy) | ❌ removed     |
| **Rex**                     | `apply-rex.ts`                                       | `rex.ts`                    | ✅ (legacy) | ✅ (emss only) |
| **STM**                     | —                                                    | `stm.ts`                    | ✅          | ✅             |
| **Layers**                  | —                                                    | —                           | ✅          | ✅             |
| **Preset**                  | —                                                    | `preset.ts`                 | ✅          | ✅             |

- **Mission** — top-level planning container; Automerge document root. Per-mission doc holds all collaborative entity data.
- **EVA** — Extra-Vehicular Activity; lives inside the mission Automerge doc.
- **POI** — Points of Interest on the lunar surface; lives inside the mission Automerge doc.
- **Station** — named surface locations; lives inside the mission Automerge doc.
- **Traverse** — planned paths between stations; lives inside the mission Automerge doc.
- **Action / ActionTemplate** — reusable task definitions; live inside the mission Automerge doc.
- **Rex** — Resource/exploration data; lives inside the mission Automerge doc.
- **STM** — Station Task Manifest (per-station task lists); REST/DB backed.
- **Layers** — GIS map layers; REST/DB backed.
- **Preset** — saved UI/map configurations; REST/DB backed.

> **Note**: "DB model (legacy)" means a MikroORM model still exists and is used by `src/server/automerge/migration.ts` to seed Automerge docs from existing PostgreSQL data, but is no longer written at runtime.

## Technology Stack

- **Frontend**: React 18, Redux Toolkit, Vite, TypeScript, OpenLayers, Automerge 3, Socket.io-client, Axios, React Router 7, React Final Form, Paper.js, Dayjs
- **Backend**: Express 5, Node 22, Socket.io, Automerge-Repo, MikroORM 6, PostgreSQL 17
- **Testing**: Vitest (unit), Vitest browser mode (component/DOM), Playwright (E2E)
- **Linting**: ESLint, StyleLint, Prettier
