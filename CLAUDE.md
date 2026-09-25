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

# Full CI check (lint + tsc + build + unit tests)
npm run test:all

# E2E tests (Playwright)
npm run test:playwright

# Database migrations
npm run migration:up
npm run migration:down
npm run migration:fresh   # drop + recreate
```

## Dates and Times

**Every stored or transmitted time value is a unix timestamp in milliseconds (`number`).** No ISO strings, no `Date` objects — not in TypeScript types, not in Postgres columns, not in REST payloads, not in Automerge documents.

- **Types**: declare timestamp fields as `number` (or `number | null`). A `*_db_type` alias should no longer need to redeclare timestamp fields as `Date`.
- **Postgres**: store timestamps as `double precision`, not `timestamptz`. In MikroORM models use `p.double().$type<number>()`, not `p.datetime(3)`. When a migration needs the current time, use `extract(epoch from now()) * 1000`. Converting an existing column: `alter table "x" alter column "y" type double precision using (extract(epoch from "y") * 1000);`.
- **Producing a value**: `Date.now()` on the server, `getAccurateNow().getTime()` on the client (it applies the server clock offset).
- **Display**: converting to a human-readable string is a rendering concern only. Do it at the point of render (`new Date(value).toLocaleString()`, or the helpers in `src/utils/formatting.ts`). Never let a formatted string flow back into state, a payload, or the database.

## Comments

Keep comments short. Write comments that explain what the code does or why — never comments that narrate what wasn't done, what a previous approach was, or what you chose not to do. Delete such notes rather than adding them.

Single-line comments (`//`) must start with a space followed by a capital letter, e.g. `// Comment here`. If the comment spans multiple lines and a later line is a run-on continuation of the sentence started above, that continuation line may start with a lowercase letter.

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
- **Socket.io** client syncs non-Automerge real-time events (connection status, live notifications, preset/STM/folder upserts).
- Vite path aliases map `"store"`, `"components"`, `"utils"`, etc. directly to `src/` subdirectories — use these aliases in imports.

### Backend

- **Express 5** REST API on port 4001. Routes are organized by resource under `src/server/express/routes/`. REST routes cover infrastructure and admin concerns (auth, users, doc listings, elevation, STM rules, folders, grids, layers, presets, mission management utilities). Entity create/read/update/delete for action/eva/poi/rex/station/traverse is **not** handled via REST — those operations go through Automerge.
- **Elevation sampling** runs natively in the API through `src/server/raster/` and
  `src/server/elevation/`. It reads each mission's configured GeoTIFF directly from `STATIC_DIR`;
  there is no separate GDAL/Python runtime service.
- **MikroORM 6** with PostgreSQL. Entity models live in `src/server/database/models/`. DB models still exist for legacy entities (action, eva, poi, rex, station, traverse) and are used by the Automerge migration script, but these entities are no longer read/written via ORM at runtime. Every request runs inside a `RequestContext` middleware for ORM isolation.
- **Socket.io** runs on a single Socket.IO server instance mounted at path `/api/socket`, hosting two namespaces:
  - **Default namespace** (`/`) — handles AEGIS web-client connections: visitor presence, heartbeats (`statusFromServer` every 10s), and `storeUpsert`/`storeDelete` events for non-Automerge entities (Presets, STM Rules, Folders). Handlers are in `src/server/express/sockets.ts`.
  - **`/maestro/v2` namespace** — Maestro v2. Auth is enforced via EMSS token middleware. Emits `dataAll` (full `AegisSlice.AegisSlice` payload) throttled at 500 ms per mission to the room `maestro{missionId}`. Handlers: `missionJoin`, `missionLeave`, `subscribeToEva`, `unsubscribeToEva`, `getEverything`, `sendMDAU` (receives `MDAU.MaestroDataAegisUses` and writes back station updates to the Automerge doc), `getDebugInfo`. Setup in `src/server/maestro/v2/sockets-maestro.ts`; emission logic in `src/server/maestro/v2/sockets-maestro-emitters.ts`.

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

### REST Request Body Typing

Every REST endpoint that accepts a body (POST/DELETE with a payload) must have its shape declared once as a named type in `src/typings/network/clientTypes.d.ts`, then reused on both sides:

- **Type declaration** (`src/typings/network/clientTypes.d.ts`): name it `<Resource><Action>Request` (e.g. `MissionPermissionGrantRequest`, `UserGroupDeleteRequest`). Add a short doc comment when the field combinations aren't self-evident (e.g. "exactly one of `userId` or `groupId` is required").
- **`http-client/` function**: the exported function's `body` parameter is typed as that request type, not an inline object literal:
  ```ts
  export async function grantMissionPermission(
    body: MissionPermissionGrantRequest
  ): Promise<WrappedResponse<number>> { ... }
  ```
- **Route handler** (`src/server/express/routes/**`): cast `req.body` to the same type instead of redeclaring an inline object type:
  ```ts
  const { missionId, userId, groupId, level, notes } = req.body as MissionPermissionGrantRequest;
  ```

This keeps the client and server from drifting out of sync on the same endpoint's body shape. Never declare the body shape as an inline `{ ... }` type in either the `http-client/` function signature or the route handler — always add/reuse a named type in `clientTypes.d.ts`.

### REST Route Logging

**Every response that is not HTTP 200 must be logged with `serverLogger.apiRoute` immediately before the `res.status(...).json(...)` call.** This applies to all new and modified routes, with no exceptions — a client-visible failure that leaves no server-side trace is not debuggable.

```ts
serverLogger.apiRoute({
  logLevel: "notice",
  httpMethod: "POST",
  responseStatus: 404,
  routeName: "userGroup/member",
  appUsername: logUsername(req.currentUser),
  uuids: [String(groupId)],
  message: "Group not found",
});
res.status(404).json({ status: "failure", message: "Group not found" });
```

Conventions:

- **`logLevel`** — `"warning"` for authorization denials (401/403) and attempts to violate a reserved-entity invariant (deleting the Public user, granting it edit, adding it to a group); `"notice"` for ordinary client mistakes (400 validation failures, 404 not found); `"error"` for 500s.
- **`error`** — required when `logLevel` is `"error"` or `"critical"`; pass `asError(e)`. The type signature enforces this. Omit it for every other level.
- **`routeName`** — the mount path of the router, not the file name (e.g. `"userGroup/member"`, `"missionPermission"`).
- **`message`** — identical to the `message` returned in the response body, so a log line can be matched to what the client saw.
- **`appUsername`** — always `logUsername(req.currentUser)`.
- **`missionId` / `uuids`** — include whichever identifiers the route operates on. `uuids` is `string[]`, so numeric ids need `String(id)` or `id.toString()`.

200 responses are deliberately **not** logged; the volume would drown out the failures.

### Domain Concepts

The app organizes around these core entities. Since the Automerge entity migration, the storage layer differs per entity — see the table below:

| Entity                      | Automerge helpers (`src/operations/apply/`)          | Redux slice (UI state only) | DB model    | REST routes    |
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

### EVA / REX Relationship and `uuid` vs `refUuid`

Every EVA, station, traverse, and action carries **two** identifiers:

- **`uuid`** — globally unique per entity instance. Always the key in `mission.evas`, `mission.stations`, `mission.traverses`, `mission.actions`.
- **`refUuid`** — a stable identity that is **preserved across REX duplication**. It is only unique _within a scope_ (see below), never globally.

**Executing an EVA creates a REX.** A REX ("realtime execution") is created from an as-planned EVA. Creating it **deep-duplicates** the EVA plus every station, traverse, and action belonging to that EVA. The duplicates keep their original `refUuid` values but receive **new `uuid`s**. Creating a second REX from the same EVA repeats the process, producing another parallel copy.

This yields a set of **scopes** for any given mission:

- the **as-planned** scope (EVAs not referenced by any `rex.evaUuid`), and
- one scope **per REX** (the EVA at `rex.evaUuid` and it's entities).

A single `refUuid` therefore resolves to one `uuid` _per scope_: `ref-s1` may exist as `uuid-s1` as-planned, `uuid-s1-rex-a` under REX A, and `uuid-s1-rex-b` under REX B. **Any `refUuid` → `uuid` lookup must be scoped by `rexUuid` (or `null` for as-planned).**

**Sharing rules — stations and actions are many-to-many with EVAs; traverses are not:**

- A **station** may belong to zero EVAs, or to **several** as-planned EVAs at once (in their `sequence`, and/or as their `ingressLocationUuid` / `egressLocationUuid`).
- An **action** hangs off a station or a traverse, and therefore belongs to it's parent's entity's EVA — so a station's actions can likewise belong to **multiple** EVAs.
- A **traverse** is unique to exactly one EVA and is never shared between as-planned EVAs. (REX duplication still produces a per-REX copy with the same `refUuid`.)

Deleting cascades along the same relationship: deleting an as-planned EVA also deletes every REX whose EVA shares its `refUuid`, together with that REX EVA's stations, traverses, and actions (see `src/operations/stage/stage-eva.ts`).

### Users, Groups, and Permissions — Required Nomenclature

Identity comes from Launchpad (EMSS OAuth2 proxy); AEGIS never stores passwords. The terms below are the canonical names. **Use them exactly** in code, types, comments, log messages, and UI copy. Do not invent synonyms ("account", "member", "admin", "guest", "managed user", "regular user", "logged-in user") — every one of those is ambiguous against the definitions here.

| Term                | Meaning                                                                   | Backing table | Type                            |
| ------------------- | ------------------------------------------------------------------------- | ------------- | ------------------------------- |
| **Launchpad user**  | The raw identity carried on the request token. Not persisted by AEGIS.    | none          | `LaunchpadUser`                 |
| **app user**        | Every identity that has authenticated at least once.                      | `app_user_db` | `AppUser`                       |
| **Public user**     | The single reserved app user representing "everyone".                     | `app_user_db` | `AppUser` (`isSystem: true`)    |
| **super user**      | A caller whose Launchpad token carries a super-user NAMS role.            | none          | —                               |
| **has permissions** | Derived: the user holds at least one grant or membership, or is reserved. | —             | `AppUserSummary.hasPermissions` |

#### Launchpad user

- The decoded token payload: `uupic` (stable identifier), `auid`, `display_name`, `email`, `roles`. Read via `getLaunchpadUser` in `src/packages/getUser.ts`.
- **`uupic` is the join key** to everything AEGIS persists. `auid` and `displayName` are display fields that are refreshed on every login and must never be used as identifiers.
- Every displayable field on the client comes from `user.launchpadUser`, never from the app user row.
- The `roles` array is what AEGIS authorizes **admin access** on. Per-mission access is entirely the grant model below; the two are independent.

#### app user

- One row per Launchpad identity, created by `recordLogin` on the first authenticated request and refreshed on every request afterwards. The pool therefore grows on its own — a row records who has visited, not a grant of anything.
- **The row is never removed by a permission change.** Revoking a user's last grant leaves it in place. This is what makes `app_user_db.id` stable enough to use as `ownerId` on entities (EVA, POI, REX, station, preset) — a row that came and went with grants would leave those foreign keys pointing at a dead id.
- The presence of a row is **not** a permission. Check `CurrentUser.permissions` / `apiHasPerms`, never the existence of the row.
- A user with no grants can still reach every public mission, since the public baseline is union-ed into everyone's access.
- **Whether a user has permissions** — holds at least one grant or membership — is computed per request in the `appUsers` list route, not stored. `GET /api/v1/appUsers?withPermissionsOnly=true` narrows the list to those users; the default includes everyone.
- **There is no delete endpoint for app users, and one must not be added.** Removing a row accomplishes nothing: the identity reappears with a new id on its next authenticated request, and every entity that referenced the old id is left dangling. Access is taken away by revoking grants (`DELETE /api/v1/missionPermission`) and group memberships (`POST /api/v1/userGroup/member` with `action: "remove"`).

#### Public user

- One reserved row, `uupic === PUBLIC_UUPIC` (`"__public__"`, in `src/utils/permissionsClient.ts`), `isSystem: true`, `displayName` "Public".
- It is a **shared principal, not a person**. It has no Launchpad identity and never logs in.
- Grants held by the Public user form the **public baseline**: they are union-ed into every authenticated caller's resolved access in `resolvePermissions`, giving `source: "public"`.
- **Capped at `viewer`.** The grant endpoint rejects any other level, on create and on update alike. This cap is what makes the union safe — the Public user can widen who sees a mission but can never hand out edit rights.
- Special-cased in two places: it cannot be deleted, and it cannot join a group (membership would make the baseline union recursive). Any new code touching app users must preserve both.
- Everything it grants is listed on its own user-detail page under `/admin/user`, where it is pinned to the top of the list. There is no separate public-missions page.

#### super user

- Derived entirely from the Launchpad token's NAMS roles — `AEGIS-Superuser` or `EMSS-Superuser`, checked by `isLaunchpadSuperUser` in `src/utils/permissionsClient.ts`. **The super-user role is never stored in AEGIS**, so there is no group to seed, no bootstrap endpoint, and no lockout risk on a fresh deployment. It is also not cached on `CurrentUser` or in Redux — every consumer re-derives it from the token, so there is only ever one source of truth.
- Confers **implicit `edit` on every mission** plus access to every `/admin/*` route and every super-user-only endpoint. A super user holds **no grant rows**, so `CurrentUser.permissions` is deliberately **empty** for them and `missionIdsAtLevel` returns `[]` — any caller enumerating missions must branch on super-user status first.
- Server-side check: `apiHasSuperUserOrToken(req.currentUser)` from `src/utils/permissionsServer.ts`, which derives the role from `currentUser.launchpadUser` and also returns true for a valid EMSS machine-to-machine token. Client-side: `isLaunchpadSuperUser(state.user.launchpadUser)`, with `<RequireSuperUser>` in `src/App.tsx` gating every admin route.
- `roles` may arrive as a bare string rather than an array, so `isLaunchpadSuperUser` normalizes before comparing. Comparing against the unnormalized value would substring-match.

#### Permission levels

Per-mission only; there are no global levels. Ordered as a pyramid — each level includes everything below it: `viewer` (1) < `editPartial` (2) < `edit` (3). Compare with `meetsPermLevel`, never with string equality or by hand-rolling the ranking. A grant targets **either** a user **or** a group, never both. Effective level is the **highest** across the user's direct grants, their groups' grants, and the public baseline (`max(rank)` in `resolvePermissions`).

Note the resolver returns only the winning level per mission, because that is all authorization needs. The admin API deliberately does not: `GET /api/v1/missionPermission?userId=` returns **every** contributing grant with an `isEffective` flag, so the UI can show a direct grant that a group currently out-ranks.

### `recordLogin` — the only writer of `app_user_db` identity fields

Called from `authMiddleware` on every authenticated request, and defined alongside it in `src/server/express/authMiddleware.ts`. A single upsert keyed on `uupic` creates the row on first sight and refreshes `auid`, `displayName`, and `lastLoginAt` thereafter.

Three details are deliberate:

- **Raw SQL with `on conflict (uupic) do update`.** Concurrent first requests from the same new identity race, and `uupic` is unique — the database settles it rather than one request failing.
- **A forked entity manager.** A failure in the directory write cannot corrupt the request's own EM.
- **No throttling.** The write is isolated here so throttling can be added later without touching call sites.

There is no promotion or demotion. Granting or revoking a permission only writes `mission_permission_db` / `user_group_member_db`; the user row is untouched either way, which is what keeps `app_user_db.id` stable for `ownerId`.

### Permission Admin API

All routes are super-user-only.

| Route                                               | Returns                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/appUsers?search=&withPermissionsOnly=` | Users with derived `hasPermissions`. Grant and membership counts are rolled up in one SQL query, not per row, and only the resulting boolean is returned. |
| `GET /api/v1/missionPermission?missionId=`          | Every subject holding a grant, with each group's members expanded, plus `isPublic` and `publicUserId`.                                                    |
| `GET /api/v1/missionPermission?userId=`             | Every reachable mission with **all** contributions and `effectivePermLevel`.                                                                              |
| `GET /api/v1/missionPermission?groupId=`            | One group's grants, in a single request.                                                                                                                  |
| `GET /api/v1/userGroup/member?groupId=`             | A group's members.                                                                                                                                        |
| `GET /api/v1/userGroup/member?userId=`              | The groups one user belongs to.                                                                                                                           |

`notes` on a grant is free text capped at 2000 characters, never used in a permission decision, and discarded when the grant is revoked. It is surfaced and editable on the user-detail, mission-permissions, and group-detail admin pages. A group carries the equivalent free text on `description` instead, under the same 2000-character cap; `user_group_db` has no `notes` column.

## Technology Stack

- **Frontend**: React 18, Redux Toolkit, Vite, TypeScript, OpenLayers, Automerge 3, Socket.io-client, Axios, React Router 7, React Final Form, Paper.js, Dayjs
- **Backend**: Express 5, Node 22, Socket.io, Automerge-Repo, MikroORM 6, PostgreSQL 17
- **Testing**: Vitest (unit), Vitest browser mode (component/DOM), Playwright (E2E)
- **Linting**: ESLint, StyleLint, Prettier
