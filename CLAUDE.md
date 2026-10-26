# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AEGIS (Application for Exploration Geospatial Integration and Scheduling) is a full-stack web application for planning, training, and executing lunar surface EVA (Extra-Vehicular Activity) missions. It provides a collaborative GIS interface with real-time multi-user editing.

## Commands

```bash
# Local development (starts Vite + API concurrently)
npm run dev

# Frontend only
npm run vite:dev

# Backend only (with hot reload)
npm run api:dev

# Start required Docker services (PostgreSQL)
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

# Standard checks (lint + tsc + build + Vitest suites)
npm run test:all

# Full E2E regression suite (all configured Playwright projects)
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

## Before Finishing a Merge Request

Run affected Playwright tests locally during development. When you think an MR is ready to merge, manually trigger the full suite in GitLab. Keep the MR in Draft until all eight CI shards and the other required checks pass for the latest MR commit:

1. Run the standard checks above.
2. Review changed functionality and relevant state boundaries against the actual Playwright fixtures and assertions using the [AI-assisted functionality audit](docs/testing/README.md). Update affected tests and record the reviewed scope, source evidence, unresolved expectations and remaining gaps in the MR description. Playwright tests are the executable scenario baseline; a passing test count does not establish functional completeness.
3. Push the final changes, then click Play once on `test-playwright:start` in that commit's GitLab pipeline. It automatically releases all eight `test-playwright` shards, covering the full configured suite: authentication setup, Chromium regression tests, and Firefox/WebKit smoke and selected parity workflows. Wait for every shard and the rest of the required pipeline to pass before marking the MR Ready.
4. Record the tested commit, successful CI pipeline link, and any retries or skipped tests in the MR description. Check the full Playwright suite checkbox only after all eight shards pass. Investigate failures and retries; do not present a partial or filtered run as full regression validation.

A duplicate full local Playwright run is optional; use `npm run test:playwright` without filters or sharding when needed for diagnosis. `npm run test:all` does not run Playwright. Full Playwright execution is manually triggered at merge readiness, not on every development push. Any new commit after validation invalidates the checkbox: return the MR to Draft and rerun all eight CI shards when the updated candidate is ready. Refresh validation after incorporating target-branch changes as well.

`test-playwright:start` is an optional manual launch (`allow_failure: true`), and all eight shards run automatically after it succeeds and their setup dependencies finish. Pipelines can pass without launching Playwright; when launched, a failing shard fails the pipeline. Require all eight shards to pass before marking an MR Ready and use the [MR template](.gitlab/merge_request_templates/Default.md) to record the evidence.

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
| `src/client/`                   | Automerge doc handle access and the gated network adapter    |
| `src/operations/`               | Automerge mutation helpers (`apply*`, `stage*`, helpers)     |
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
- **Automerge** (v3 + automerge-repo) is the primary data layer for all collaborative entities. The repo is initialized in `src/index.tsx` with a WebSocket adapter pointed at `/api/automergeSocket/`. All entity mutations (mission, EVA, station, POI, traverse, action, rex) go through Automerge; mutation helpers are in `src/operations/`. Selectors in `src/store/selectors.ts` read directly from Automerge doc state (e.g. `selectAsPlannedStations(mission: Mission)`) rather than from Redux.
- **Automerge mutation architecture** is organised into three layers to guarantee that each logical operation produces exactly one `.change()` patch (no half-built state visible to peers):
  - `apply*` (`src/operations/apply/`): inner draft mutators that receive `(m: Mission, args)` and mutate the doc. Pure sync; never call `.change()` or import `missionDocHandle`. _(ESLint-enforced.)_
  - `stage*` (`src/operations/stage/`): plan builders that receive a `Mission` snapshot and return a typed `*StageData` object (in `src/typings/thunkStageData.d.ts`) with all new uuids pre-allocated. Used for cascading multi-entity operations and any reusable plan-building logic shared across thunks. Two tiers exist:
    - **Sync stages** (default, most common): pure sync, no I/O. Examples: `stageDuplicateEva`, `stageDeleteRex`.
    - **Async stages** (allowed when needed): may `await` from a small allow-list of read-only data thunks (currently only `thunkGetElevation`). They still never call `.change()` and never call mutation thunks. Example: `stageTraverseUpdate`.
    - _(ESLint-enforced: `automergeDocHandles` blocked entirely; `store/thunk/**` blocked except the explicit allow-list.)_
  - `thunk*` (`src/store/thunk/*`): async orchestrators that may pre-fetch elevation/REST, then run a single `.change()` per logical operation.
  - **`withMissionChange`** (`src/client/automergeDocHandles.ts`): the only sanctioned mutation entry-point for components. Wraps the null-guard and `.change()` call so callers never have to handle either: `withMissionChange((m) => applyFoo(m, args))`. Composing multiple `apply*` inside one call is atomic.
  - See `src/operations/README.md` for the full convention with examples.
- **Socket.io** client syncs non-Automerge real-time events (connection status, heartbeats, version checks).
- Vite path aliases map `"store"`, `"components"`, `"utils"`, etc. directly to `src/` subdirectories — use these aliases in imports.

### TypeScript Type Conventions

- **Types are ambient.** Domain/data types live in `.d.ts` files under `src/typings/` (e.g. `stm.d.ts`, `store.d.ts`, `thunkStageData.d.ts`) and are declared _without_ `export` — they are globally available across the codebase with no import needed. **Do not `export` types** and do not import them; reference them by name directly.
- **Where types go:** any type that describes data (entities, computed shapes, context values, function args/returns, unions, enums-as-unions) belongs in the appropriate `src/typings/*.d.ts` file, _not_ inline with the code that uses it.
- **The one exception is component prop interfaces.** A React component's props type may be declared inline in the component file (e.g. `type Props = {...}` or an inline `FunctionComponent<{...}>`), since it is local to that component and not shared. Everything else goes in a `.d.ts`.

### Backend

- **Express 5** REST API on port 4001. Routes are organized by resource under `src/server/express/routes/`. REST routes cover infrastructure and admin concerns (auth, users, doc listings, elevation, grids, mission management utilities). Entity create/read/update/delete for action/eva/poi/rex/station/traverse/folder/preset/STM is **not** handled via REST — those operations go through Automerge. The `layer` and `sublayer` routes are kept for the GIS pipeline (`register.py`) and the admin layers page; they read and write the mission Automerge doc on the server.
- **Elevation sampling** runs natively in the API through `src/server/raster/` and
  `src/server/elevation/`. It reads each mission's configured GeoTIFF directly from `STATIC_DIR`;
  there is no separate GDAL/Python runtime service.
- **MikroORM 6** with PostgreSQL. Entity models live in `src/server/database/models/`. Legacy ORM definitions for entities that moved into the mission doc live in `_legacyModels.ts` and are used only by Automerge migrations; the folder, layer, sublayer, preset, and STM tables are read with raw SQL by `Migration20261009000000` and then dropped. Every request runs inside a `RequestContext` middleware for ORM isolation.
- **Socket.io** runs on a single Socket.IO server instance mounted at path `/api/socket`, hosting multiple namespaces:
  - **Default namespace** (`/`) — handles AEGIS web-client connections: visitor presence, and heartbeats (`statusFromServer` every 10s). Handlers are in `src/server/express/sockets.ts`.
  - **`/maestro/v2` namespace** — Maestro v2. Auth is enforced via EMSS token middleware. Emits `dataAll` (full `AegisSlice.AegisSlice` payload) throttled at 500 ms per mission to the room `maestro{missionId}`. Handlers: `missionJoin`, `missionLeave`, `subscribeToEva`, `unsubscribeToEva`, `getEverything`, `sendMDAU` (receives `MDAU.MaestroDataAegisUses` and writes back station updates to the Automerge doc), `getDebugInfo`. Setup in `src/server/maestro/v2/sockets-maestro.ts`; emission logic in `src/server/maestro/v2/sockets-maestro-emitters.ts`.
  - **`/dust/v1` namespace** — DUST (another external app-to-app client). Auth is enforced via `DUST_TOKEN` middleware (`dustTokenIsValid` in `src/utils/permissions.ts`), checked against `process.env.DUST_TOKEN`, and also accepts the `EMSS_TOKEN` master key (`emssTokenIsValid`) — see the "EMSS Token Is a Master Key" note below. Visitors join a mission room named `dust{missionId}`. Handlers: `missionJoin`, `getEverything`, `getDebugInfo`. `missionJoin` only acknowledges success once the mission's automerge doc listener is installed; a setup failure rolls back the join (visitor removed, room left) and answers `{ status: "error" }` so the client can retry. `getEverything(missionId, callback)` is an on-demand full resync returning `DustPosEntriesUpdate[]` for **every** rex on the mission (running or not); it reads only the doc handle cached by `missionJoin`, so it fails with `{ status: "error" }` unless the socket has successfully joined that mission first. Emits `posEntriesUpdate` (full current `posEntries` list for a running rex, in human-readable form with pos type/source names resolved, plus mission/rex/eva name+uuid) whenever anything in a running rex's payload changes — crew position add/edit/delete, pos type/source rename, or mission/rex/eva rename. Change detection compares the whole canonical payload, not just the `posEntries` array reference. Emits only to the mission's room, skipped entirely if no DUST sockets are connected at all, and skipped per-mission if that mission's room is empty. Setup in `src/server/dust/v1/sockets-dust.ts`; automerge doc-change diffing/emit logic in `src/server/dust/v1/sockets-dust-emitters.ts`; message types in `src/server/dust/v1/types/socketioDust.d.ts`. Connection/visitor state lives in `globalValues.dustV1`.

### EMSS Token Is a Master Key

`EMSS_TOKEN` (validated by `emssTokenIsValid` in `src/utils/permissions.ts`) is a master key that overrides and grants access to **every** AEGIS API and socket endpoint, not just EMSS/Maestro-specific ones — see its use in `hasPerms`. **Any new REST endpoint or socket namespace that enforces its own token/auth scheme must also accept `EMSS_TOKEN` as an alternate credential**, alongside whatever endpoint-specific token it defines (e.g. the `/dust/v1` namespace accepts both `DUST_TOKEN` and `EMSS_TOKEN`). When adding a new integration's auth middleware, call `emssTokenIsValid(token)` as a fallback check.

### Maestro Type Files — Do Not Modify Without Coordination

The following type declaration files define the contract between AEGIS and the external Maestro application. **AI agents must never modify these files.** Any change requires explicit coordination with the Maestro developer team, as both sides must update simultaneously:

- `src/server/maestro/v2/types/aegisSlice.d.ts` — `AegisSlice` namespace (outbound payload shape)
- `src/server/maestro/v2/types/mdau.d.ts` — `MDAU` namespace (inbound payload shape)

- **Automerge repo** network adapter mounts at `/api/automergeSocket/` via WebSocket upgrade, using a custom `PostgresStorageAdapter` to persist documents to PostgreSQL.
- **Authentication** is delegated to `@emss/oauth2-proxy-backend`; secrets and environment config come from `env.secret.ts` (gitignored) and dotenv.

### Automerge Socket Epoch Gate (`serverEpochUuid`)

A browser tab left open across a server restart holds in-memory Automerge state authored against the pre-restart document. Reconnecting would merge those stale changes back in — most damaging right after a schema migration. The gate prevents that by refusing the reconnect and forcing a full page reload, which discards all client Automerge state (the client `Repo` has no storage adapter, so nothing survives a reload).

- **`serverEpochUuid`** identifies one server lifetime. It is a uuid generated at boot in `src/server/express/server.ts` and carried on `AppVersion` alongside `version`/`gitCommit`, so `GET /api/v1/version` and the Socket.IO `version` event both serve it. Any restart of the apiv1 process — including a normal deploy, where a bare `compose up -d` recreates apiv1 — produces a new value.
- **Server gate (authoritative)** — the HTTP `upgrade` handler in `src/server/express/server.ts` compares the `?serverEpochUuid=` query parameter against the current value and answers a raw `426 Upgrade Required` on any mismatch or omission. It must `return` silently for every non-Automerge path, since Socket.IO shares the same `upgrade` listener.
- **Client adapter** — `VersionGatedNetworkAdapter` (`src/client/automerge-network-adapter.ts`) wraps the vendor WebSocket adapter, appends the epoch to the URL, and polls `/api/v1/version` every 5s while disconnected. A matching epoch reconnects; a differing one blocks permanently and redirects to `/versionCheck`. A failed fetch (server down mid-deploy) keeps polling without redirecting. It never emits `close` (that would permanently remove it from the `NetworkSubsystem`) and force-readies after ~1s so a blocked gate cannot hang `whenReady()` callers.
- **Read-only UI** — `connection.automergeConnectionStatus` feeds `isConnected` in `src/store/selectors.ts`, so losing only the Automerge socket now also disables the Edit toggle and form Save buttons.
- Note for local development: nodemon restarts the API process, so saving a server file changes the epoch and forces open dev tabs to reload.

### Data Flow

```
Browser ──HTTP──▶ Express REST routes ──▶ MikroORM ──▶ PostgreSQL
       ──WS──▶   Automerge repo adapter ──▶ PostgresStorageAdapter ──▶ PostgreSQL
       ──WS──▶   Socket.io handlers
```

REST responses are wrapped as `WrappedResponse<T>` with a `status` field (`"success"` | `"failure"` | `"error"`) — match this shape in all new endpoints and `http-client/` functions.

### Domain Concepts

The app organizes around these core entities. Since the Automerge entity migration, the storage layer differs per entity — see the table below:

| Entity                      | Automerge helpers (`src/operations/apply/`)          | Redux slice (UI state only) | DB model   | REST routes     |
| --------------------------- | ---------------------------------------------------- | --------------------------- | ---------- | --------------- |
| **Mission**                 | `apply-mission.ts` + sub-files                       | `mission.ts`                | ✅         | ✅              |
| **EVA**                     | `apply-eva.ts`                                       | `eva.ts`                    | ❌ dropped | ❌ removed      |
| **POI**                     | `apply-poi.ts`                                       | `poi.ts`                    | ❌ dropped | ❌ removed      |
| **Station**                 | `apply-station.ts`                                   | `station.ts`                | ❌ dropped | ❌ removed      |
| **Traverse**                | `apply-traverse.ts`                                  | `traverse.ts`               | ❌ dropped | ❌ removed      |
| **Action / ActionTemplate** | `apply-action.ts`, `apply-mission-actionTemplate.ts` | `action.ts`                 | ❌ dropped | ❌ removed      |
| **Rex**                     | `apply-rex.ts`                                       | `rex.ts`                    | ❌ dropped | ✅ (emss only)  |
| **STM levels / rules**      | `apply-mission-stm.ts`                               | `stm.ts`                    | ❌ dropped | ❌ removed      |
| **Layers / Sublayers**      | `apply-mission-layer.ts`                             | —                           | ❌ dropped | ✅ (doc-backed) |
| **Preset**                  | `apply-mission-preset.ts`                            | `preset.ts`                 | ❌ dropped | ❌ removed      |
| **Folder**                  | `apply-mission-folder.ts`                            | `interface.ts`              | ❌ dropped | ❌ removed      |

- **Mission** — top-level planning container; Automerge document root. Per-mission doc holds all collaborative entity data.
- **EVA** — Extra-Vehicular Activity; lives inside the mission Automerge doc.
- **POI** — Points of Interest on the lunar surface; lives inside the mission Automerge doc.
- **Station** — named surface locations; lives inside the mission Automerge doc.
- **Traverse** — planned paths between stations; lives inside the mission Automerge doc.
- **Action / ActionTemplate** — reusable task definitions; live inside the mission Automerge doc.
- **Rex** — Resource/exploration data; lives inside the mission Automerge doc.
- **STM** — Science Traceability Matrix (`stmLevel1s` → `stmLevel2s` → `stmLevel3s`, plus `stmRules`); lives inside the mission Automerge doc. `action.stmPriorities` and `stmRule.stmUuid` reference level 3 uuids.
- **Layers / Sublayers** — GIS map layers (`layers`, `sublayers`); live inside the mission Automerge doc. Adding, moving, or deleting a layer or sublayer updates every preset's `layerOrder` and `mapSublayerControls` in the same change.
- **Preset** — saved map display configurations (`presets`); live inside the mission Automerge doc and are edited with the global edit toggle like stations.
- **Folder** — left-panel folders for POIs, stations, EVAs, and presets (`folders`); live inside the mission Automerge doc. Deleting an entity removes it from every folder in the same change. Station and POI folder map visibility (`folder.visible`) is shared through the doc; folder open/closed state is UI-only (`interface.foldersInterface`, cookie-backed).

> **Note**: "DB model (legacy)" means a MikroORM model still exists and is used by `src/server/automerge/migration.ts` to seed Automerge docs from existing PostgreSQL data, but is no longer written at runtime.

### EVA / REX Relationship and `uuid` vs `refUuid`

Every EVA, station, traverse, and action carries **two** identifiers:

- **`uuid`** — globally unique per entity instance. Always the key in `mission.evas`, `mission.stations`, `mission.traverses`, `mission.actions`.
- **`refUuid`** — a stable identity that is **preserved across REX duplication**. It is only unique _within a scope_ (see below), never globally.

**Executing an EVA creates a REX.** A REX ("realtime execution") is created from an as-planned EVA. Creating it **deep-duplicates** the EVA plus every station, traverse, and action belonging to that EVA. The duplicates keep their original `refUuid` values but receive **new `uuid`s**. Creating a second REX from the same EVA repeats the process, producing another parallel copy.

This yields a set of **scopes** for any given mission:

- the **as-planned** scope (EVAs not referenced by any `rex.evaUuid`), and
- one scope **per REX** (the EVA at `rex.evaUuid` and it's entities).

A single `refUuid` therefore resolves to one `uuid` _per scope_: `ref-s1` may exist as `uuid-s1` as-planned, `uuid-s1-rex-a` under REX A, and `uuid-s1-rex-b` under REX B. **Any `refUuid` → `uuid` lookup must be scoped by `rexUuid` (or `null` for as-planned).**

**Resolving the members of a scope.** There is no back-pointer from a station, traverse, or action to its EVA — membership is derived from the EVA's `sequence`:

- **Stations and traverses** — the `sequence` items of that scope's EVA(s). Use `getSequenceStationUuids` / `getSequenceTraverseUuids` from `src/operations/helpers/evaSequence.ts` rather than indexing the sequence directly. Sequence items may hold an empty uuid placeholder, so filter those out.
- **Actions** — every action whose `stationUuid` or `traverseUuid` is in the sets above.
- **The as-planned EVA matching a REX** — the EVA sharing `rexEva.refUuid` that is _not_ referenced by any `rex.evaUuid` (see `getAsPlannedEvaFromRefUuid` in `src/store/selectors.ts`).
- **Pairing as-planned entities with their REX copies** — build both scopes, then join them on `refUuid`. Because stations may be shared across as-planned EVAs, an entity can be absent from one side; skip unmatched entries rather than emitting a blank uuid (see `getExecuteUuids` in `src/server/maestro/v2/sockets-maestro-emitters.ts`).

**Sharing rules — stations and actions are many-to-many with EVAs; traverses are not:**

- A **station** may belong to zero EVAs, or to **several** as-planned EVAs at once (in their `sequence`, and/or as their `ingressLocationUuid` / `egressLocationUuid`).
- An **action** hangs off a station or a traverse, and therefore belongs to it's parent's entity's EVA — so a station's actions can likewise belong to **multiple** EVAs.
- A **traverse** is unique to exactly one EVA and is never shared between as-planned EVAs. (REX duplication still produces a per-REX copy with the same `refUuid`.)

Deleting cascades along the same relationship: deleting an as-planned EVA also deletes every REX whose EVA shares its `refUuid`, together with that REX EVA's stations, traverses, and actions (see `src/operations/stage/stage-eva.ts`).

## Technology Stack

- **Frontend**: React 18, Redux Toolkit, Vite, TypeScript, OpenLayers, Automerge 3, Socket.io-client, Axios, React Router 7, React Final Form, Paper.js, Dayjs
- **Backend**: Express 5, Node 22, Socket.io, Automerge-Repo, MikroORM 6, PostgreSQL 17
- **Testing**: Vitest (unit), Vitest browser mode (component/DOM), Playwright (E2E)
- **Linting**: ESLint, StyleLint, Prettier
