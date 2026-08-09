# Dynamic LGRS Grid Implementation Plan

**Status:** Initial canonical south-LPS implementation complete; follow-up work remains

**Date:** 2026-08-07

**Goal:** Replace the uploaded coordinate matrix for missions configured to use a browser-generated lunar south-pole LGRS grid. Retain server-file grids as a contained compatibility path for legacy and custom missions.

---

## Implementation Update

### Completed in `938-dynamic-lgrs-grid`

- Added optional mission-level `gridRenderMode` typing and schema support. New missions default to `"server-file"`; documents without the field resolve to `"server-file"` without a migration.
- Added the independent **Server File** / **Dynamic LGRS** admin control beside **Using LGRS Coordinate System**. The dynamic option is enabled only for the canonical AEGIS lunar south-pole cap projection.
- Relabeled and gated the upload workflow as **Server File Grid (Legacy / Custom)**. Selecting dynamic mode does not create, upload, or modify a coordinate file.
- Added `resolveMissionGrid` and `useResolvedMissionGrid` as the runtime compatibility boundary. Map rendering, mouse coordinates, preferences, panes, pages, and exports consume the resolved source instead of importing `globalGrid` directly.
- Updated mission and dashboard loading so dynamic missions clear legacy loaded data and do not call `loadAndReturnGrid`.
- Added the pure `src/utils/lgrs/dynamicGrid.ts` south-LPS subset. It implements floor-based cell selection, LGRS and ACC labels, canonical cap/LPS transforms, fixed and auto spacing, label spacing, and clipping at the nominal 80 degrees south LPS boundary.
- Added `src/utils/lgrs/southLps.ts`, a narrow TypeScript port of pinned `lgrs.coords.LatLonPoint(...).to_lps()` for canonical south LPS. It feeds every displayed LGRS/ACC coordinate into the shared label formatter.
- Updated the OpenLayers `Grid` behavior to generate $O(n_x + n_y)$ line features from the visible LPS extent. Rebuilds are limited to one per animation frame while moving, followed by a final `moveend` rebuild.
- Preserved the server-file matrix renderer, geometry-derived base spacing, grid styles, label controls, historical export data, and upload/API behavior behind the resolver.
- Pinned the authority to Python `lgrs==0.3.0`, tag `v0.3.0`, commit `6ba953e09e5dde9d379df5b2c1a91b7b958fb851`.
- Added a deterministic Python reference-corpus generator, committed metadata/cases/viewports/manifests, a 3,000-point seeded corpus, pure Vitest replay and performance tests, browser rendering tests, and a CI regeneration/diff job.
- Added a second 3,010-case geographic-to-LPS reference corpus (`south-lps-projection-cases.json`) that validates projected metres and final 10 m LGRS/ACC display text from the same upstream package.
- Removed direct application imports of `globalGrid`; the mutable value now exists only inside the server-file compatibility module and its test mocks.

### Verification performed

- Regenerated the reference corpus into a temporary directory and verified a byte-for-byte diff against the committed fixtures.
- Ran the complete repository gate: lint, TypeScript, frontend/backend builds, 1,322 unit tests in 104 files, and 323 browser tests in 35 files.
- Confirmed legacy server-file rendering and export tests still pass and dynamic rendering works without a loaded matrix.

### Follow-up work

1. **Add end-to-end workflow coverage.** Exercise the real admin toggle, projection eligibility message, Automerge persistence, page load, and map render together. Assert at the network boundary that a dynamic mission performs no full-grid request and writes no `Data/<grid>.json` file; the current browser grid test mocks the resolver.
2. **Expand explicit reference boundary tables.** The seeded corpus and selected readable transitions pass, but add table cases for every reachable 25 km easting/northing alphabet transition and explicit latitude samples immediately poleward, on, and equatorward of 80 degrees south. Add independent containment and label round-trip invariants rather than relying only on expected-value replay.
3. **Replace the compatibility singleton.** `globalGrid` has no direct application consumers, but `utils/mapping/grid.ts` still stores the loaded server-file grid in one module-level value observed through `useSyncExternalStore`. Replace it with mission-keyed state or a scoped provider before supporting multiple simultaneously mounted missions.
4. **Audit `/api/v1/grid/closestPoint`.** Confirm external usage before deleting this legacy endpoint. No current browser caller was found.
5. **Document legacy retirement.** Define migration guidance for custom/uploaded missions and the conditions under which the upload API, coordinate files, and matrix-based exports can be retired.
6. **Confirm the first CI reference-corpus run.** The job uses Python 3.14 and installs the exact PyPI package before regenerating fixtures. Verify package installation, dependency-proxy access, and runtime on the OpenShift runner after the branch is pushed.
7. **Generalize projection support only when needed.** The initial renderer intentionally supports the verified canonical cap profile. A future noncanonical mission projection requires LPS-to-geographic-to-map endpoint transforms and potentially adaptive line densification. LTM and LPS/LTM overlap remain out of scope.

---

## 1. Decision Summary

AEGIS should not use the Python pipeline or `/api/v1/grid` to draw new LGRS grids. The browser already contains the LPS conversion constants used by the LGRS standard and can generate only the grid lines and labels visible in the viewport.

The authoritative behavior remains the Python `lgrs` library. The TypeScript implementation must be a deliberately small south-LPS port, verified against a version-pinned Python reference corpus. It must not become a general replacement for the Python package's LTM, multi-zone, file-export, or GeoPandas features.

`mission.usingLGRSCoordinates` is not a grid feature gate. It controls coordinate display and bearing conventions in the UI. Grid rendering must be selected independently by an explicit mission-level mode.

For canonical south-LPS missions, `utils/lgrs/southLps.ts` owns geographic-to-LPS conversion, while `utils/lgrs/dynamicGrid.ts` owns LPS-to-LGRS/ACC formatting and dynamic grid geometry. `utils/surf-nav/` remains only for the existing LPS grid-north bearing convention.

### Non-goals

- Do not port the whole `lgrs` package.
- Do not remove legacy uploaded-grid support in the first dynamic-grid release.
- Do not infer an LGRS definition from every existing coordinate file.
- Do not generate or retain a full `MissionGridPoint[][]` array for a dynamic LGRS grid.
- Do not support LTM zones or the LPS/LTM overlap boundary in the initial port.

---

## 2. Required Branch Stack

The branch dependency is already linear:

```text
int
  |
  +-- grid-server-refactor
        |
        +-- 874-grid-improvements
              |
              +-- 938-dynamic-lgrs-grid
```

Create the new branch from the current tip of `874-grid-improvements`:

```bash
git switch 874-grid-improvements
git switch -c 938-dynamic-lgrs-grid
```

Merge request targets must follow the same order:

| Merge request | Source branch           | Initial target          | Responsibility                                                |
| ------------- | ----------------------- | ----------------------- | ------------------------------------------------------------- |
| 1             | `grid-server-refactor`  | `int`                   | One mission grid, Automerge metadata, retained upload API     |
| 2             | `874-grid-improvements` | `grid-server-refactor`  | Grid style, visibility, spacing, and label controls           |
| 3             | `938-dynamic-lgrs-grid` | `874-grid-improvements` | Dynamic LGRS implementation, compatibility adapter, and tests |

After each parent merge, retarget its child at the next merged parent if GitLab does not do so automatically. Do not base the dynamic branch directly on `int`: that would duplicate or conflict with the active refactor and UI-control work.

---

## 3. Target Architecture

### 3.1 One public grid-rendering boundary

The application must resolve a mission into exactly one runtime grid source. Map components, preferences, exports, and pages must consume that resolved source rather than branching independently on the mission rendering mode, `globalGrid`, and grid-file metadata. Coordinate-display components continue to use `usingLGRSCoordinates` for their existing, separate purpose.

Conceptual shape:

```typescript
type ResolvedMissionGrid =
  | { kind: "none" }
  | { kind: "dynamic-lgrs" }
  | { kind: "server-file"; grid: MissionGrid };
```

The resolver is the only compatibility seam. New features must not add more `if dynamic` / `if server-file` conditionals to every map component.

### 3.2 Persist the rendering mode, not a dynamic-grid definition

Add one mission-level field to the Automerge document:

```typescript
type GridRenderMode = "server-file" | "dynamic-lgrs";
```

`gridRenderMode` answers one question only: should this mission read an uploaded coordinate file from the server, or should the browser generate standard LGRS lines for the visible map area? Existing missions with no field default to `"server-file"`, preserving current behavior without a data migration.

`usingLGRSCoordinates` remains independent. A mission may display LGRS coordinates while using a server-file grid, or use a dynamic LGRS grid while choosing not to display LGRS coordinates elsewhere in the UI.

The admin UI validates that `"dynamic-lgrs"` is used only with a compatible lunar south-pole projection. It does not create, upload, or persist a grid definition, grid bounds, base resolution, or coordinate matrix.

#### Mission admin control

Add a two-option grid-rendering toggle to the **Coordinate System** section of `src/pages/admin/mission.tsx`, directly beside the existing **Using LGRS Coordinate System** checkbox:

```typescript
gridRenderMode: "server-file" | "dynamic-lgrs";
```

The control presents:

- **Server File**: preserve the current upload/API/Data-file grid behavior.
- **Dynamic LGRS**: generate LGRS lines in the browser from the current viewport and map-menu spacing selection.

These controls are independent. Changing **Using LGRS Coordinate System** must not change `gridRenderMode`, and changing **Grid Rendering** must not change `usingLGRSCoordinates`. The dynamic option is disabled with an explanatory message until the mission has a compatible south-pole projection.

### 3.2.1 User-selected dynamic spacing

The `874-grid-improvements` map menu already offers `10m`, `100m`, `1km`, and `Auto` display-spacing choices. For `"dynamic-lgrs"`, the selected setting is the requested LGRS line spacing for the current viewport:

- `10m` generates 10 m LGRS lines in the browser.
- `100m` generates 100 m LGRS lines in the browser.
- `1km` generates 1 km LGRS lines in the browser.
- `Auto` uses the same visible-extent density calculation as the current `Grid` behavior.

The spacing setting is user display state, not mission data. Selecting 10 m must not create a second mission-grid definition, upload a 10 m coordinate matrix, or change the mission's grid-rendering mode.

Labels remain independently adaptive. A 10 m grid may draw 10 m lines while labels stay at a readable 100 m or 1 km interval. The label generator must still derive labels from the same LGRS authority; it must never label a made-up subdivision.

For the dynamic path, `Auto` uses a 10 m-aligned LPS lattice and the existing density target: derive the visible row and column counts, then calculate the line stride from the square root of visible cells divided by the approximately 100-cell target. The resulting spacing is an aligned multiple of 10 m, naturally producing values such as 10 m, 20 m, 100 m, 200 m, and 1 km as the map zoom changes. Auto labels use the corresponding approximately 25-visible-label target. Fixed 10 m, 100 m, and 1 km settings keep their current fixed-spacing semantics.

### 3.3 Strict dynamic eligibility

Use dynamic LGRS only when all conditions are true:

1. `mission.gridRenderMode` is `"dynamic-lgrs"`.
2. The configured mission projection is compatible with canonical south LPS, or the implementation can transform canonical LPS endpoints through geographic coordinates into the configured mission projection.
3. The requested viewport intersects the supported south-LPS domain.

The initial implementation must clip dynamic output to the nominal LPS south region. The current Python library handles LTM and cross-zone overlap outside that region; that is intentionally outside the port's scope. This spatial check is a property of the renderer, not stored per-mission grid coverage.

### 3.4 Pure TypeScript LGRS subset

Create a new pure utility module under `src/utils/lgrs/` for the dynamic grid. Keep it independent of React, OpenLayers, HTTP, and mutable globals. `src/utils/surf-nav/` remains reserved for the existing CM-derived surf-navigation port and must not absorb this implementation.

It should:

- Port the pinned `lgrs` geographic-to-canonical-south-LPS transform and verify it with a separate lat/lng-to-LPS reference corpus.
- Implement the south-LPS cell boundary convention with the library's floor behavior, not the current hover formatter's rounding behavior.
- Implement full south-LPS LGRS and ACC zone/area/precision formatting needed for labels.
- Generate visible easting and northing line positions from viewport bounds and the user's selected 10 m, 100 m, 1 km, or auto display spacing.
- Produce a render plan containing only lines and labels needed for the current viewport.
- Expose pure coordinate and label functions so unit tests do not need an OpenLayers map.

Do not modify the existing surf-nav coordinate functions merely to accommodate rendering. They remain a matched copy used only for LPS grid-north bearings. The new `src/utils/lgrs/` module owns explicit `lgrs` conformance tests for geographic-to-LPS conversion and LGRS/ACC formatting.

### 3.5 Map rendering

Refactor the `Grid` behavior to request a render plan from the resolved grid source.

For the standard AEGIS lunar south-pole cap CRS, canonical LPS coordinates transform exactly as:

$$
x_{cap} = \frac{E_{LPS} - 500000}{0.994}, \qquad
y_{cap} = \frac{N_{LPS} - 500000}{0.994}
$$

The implementation should use the existing projection converters unless it has verified that the mission uses this canonical cap profile. A canonical line then needs two endpoints; a noncanonical but supported projection may need transformed endpoints or adaptive densification.

Preserve the spacing, label interval, style, and visibility controls introduced on `874-grid-improvements`. Dynamic grids must generate the selected standard LGRS spacing directly rather than deriving a resolution from a haversine distance between saved vertices.

### 3.6 Performance requirements

The dynamic path must preserve the current view-density behavior while replacing lookup in a stored matrix with arithmetic in LPS coordinates:

- Derive the first and last visible LPS easting/northing line indices directly from the viewport, replacing `findClosestPointInGlobalGrid` and `adjustGridIndex` for dynamic grids.
- In `Auto`, retain the current approximately 100-visible-cell line target and approximately 25-visible-label target. As the visible extent grows, the stride grows; as the map zooms in, the stride shrinks.
- In fixed modes, retain the user-selected 10 m, 100 m, or 1 km spacing. Do not add a new hard-cap, suppression, or coarsening rule that silently overrides the selected mode.
- Generate $O(n_x + n_y)$ line features, not $O(n_x n_y)$ cell features. Labels are independently strided, as they are today.
- Rebuild at most once per animation frame while a view is moving, then perform a final rebuild when movement settles.
- Keep hover coordinate formatting $O(1)$ and independent of a fetched grid matrix.

---

## 4. Compatibility and Deletion Plan

### 4.1 Legacy uploaded grids stay behind the resolver

The current admin upload, grid API, coordinate JSON file, and `MissionGridPoint[][]` behavior continue to support missions with `gridRenderMode: "server-file"`, including:

- Existing missions with uploaded grids.
- Non-LGRS or custom grids.
- Historical exports that require the original coordinate matrix.

Only the `server-file` resolver branch loads a coordinate file. `mission.tsx` and `dashboard.tsx` must not call `loadAndReturnGrid` for a `dynamic-lgrs` mission.

### 4.2 Remove dynamic-path infrastructure

After the compatibility adapter is in place, delete these dependencies from the dynamic LGRS path:

- Dynamic mission reads of the full-grid endpoint.
- Dynamic use of the mutable `globalGrid` module.
- Haversine-based native-grid spacing inference for dynamic LGRS grids.

The GIS pipeline's `--grid` generation, conversion, and registration stages remain unchanged and are out of scope for this branch. The server route and upload UI remain available for `server-file` missions. They must be visibly described as server-file/legacy/custom grid support, not as the standard dynamic LGRS workflow.

### 4.3 Final cleanup after migration

Once legacy callers are moved behind the resolver, replace direct `globalGrid` imports with a scoped mission-grid hook or resolved-grid argument. This removes the module-global data flow rather than creating a second source of truth beside it.

Audit the server's `/closestPoint` endpoint before removing it. It has no known current browser caller, but it may have external consumers. Delete it only after API-usage confirmation.

---

## 5. Pinned Fixture and Conformance Strategy

### 5.1 Pin the authority

The fixture generator uses an exact `lgrs` release because the upstream project is pre-1.0 and evolving. Record:

- PyPI package version.
- GitHub repository URL.
- Git commit SHA or immutable release tag.
- CRS constants and standard revision.
- Fixture-generation command.

The fixture metadata travels with every expected-output file so a future standard upgrade is explicit rather than accidental.

### 5.2 Commit a conformance corpus, not a giant polygon export

Do not vendor a large opaque GeoJSON from the upstream repository as the primary test asset. It is difficult to review, stores polygon geometry that the browser intentionally does not create, and would duplicate an external evolving implementation.

Instead, provide a deterministic Python fixture generator and commit its compact JSON outputs under a path such as:

```text
src/tests/vitest/fixtures/lgrs/<reference-version>/
  metadata.json
  south-lps-cases.json
  south-lps-viewports.json
```

The corpus should contain both readable table cases and a deterministic seeded sample. A corpus of several thousand points and viewport plans is small enough for ordinary Git review and much more useful than a massive GeoJSON grid.

**Fixture lifecycle:** CI reads the committed corpus only; it does not install Python or regenerate fixture output. When intentionally changing the LGRS contract or upgrading its pinned version, run `pixi run lgrs-reference-corpus`, review the resulting fixture changes, and commit them together.

### 5.3 Required fixture cases

Generate expected outputs with the pinned Python library for all of these categories:

| Category             | Required cases                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic spacing      | Fixed 10 m, 100 m, and 1 km lines plus auto output at aligned intermediate strides such as 20 m, 100 m, 200 m, and 1 km               |
| Labels               | Correct LGRS labels at each enabled label interval, including readable sparse labels over a dense 10 m line grid                      |
| Polar halves         | Both sides of the 500,000 m LPS false easting                                                                                         |
| Area boundaries      | Every 25 km easting/northing transition, including alphabet-table transitions                                                         |
| Precision boundaries | Exact line, one millimetre below, and one millimetre above each relevant boundary                                                     |
| Pole behavior        | South pole and surrounding cells                                                                                                      |
| Domain clipping      | Inside, on, and outside the supported south-LPS domain                                                                                |
| LPS/LTM edge         | Locations immediately poleward/equatorward of 80 degrees south; initial port must reject or clip unsupported output deterministically |
| Viewports            | Canonical cap-map extents at multiple zoom levels, pan positions, and line/label stride settings                                      |
| Property sample      | A seeded set of thousands of valid south-LPS points, reproducible from its seed and generator version                                 |

For each fixture point, record canonical LPS coordinates, full LGRS/ACC values, condensed label values, lower-left cell corner, and any expected unsupported-domain result. For each viewport, record expected line positions and labels after clipping and selection of 10 m, 100 m, 1 km, or auto spacing.

### 5.4 Test layers

1. **Vitest pure-unit tests:** compare TypeScript LPS snapping, labels, corners, and viewport plans against every committed fixture case.
2. **Vitest property tests:** replay the seeded corpus and assert invariants such as stable floor behavior, grid-cell containment, and label round trips.
3. **Browser map tests:** assert line and label counts, endpoint projection, no dynamic full-grid fetch, current auto-density behavior across zooms, fixed-spacing behavior, and cleanup on unmount.
4. **Legacy contract tests:** retain and extend grid-upload/API tests to prove existing uploaded missions still render and export unchanged.
5. **Performance regression tests:** use representative viewports and assert the expected auto stride, line/label counts, and a practical render-plan time budget.

The normal Node test suite reads committed JSON only and therefore stays fast and independent of Python. Refresh the corpus with the pinned Python generator only when intentionally changing the LGRS contract or upgrading its pinned version.

---

## 6. Implementation Phases

### Phase A: Lock the contract

**Implementation status:** Complete.

1. Select and pin the upstream `lgrs` version and source commit.
2. Add `gridRenderMode` to the mission schema, defaulting missing values to `"server-file"`.
3. Add the two-option **Grid Rendering** toggle beside **Using LGRS Coordinate System** on the mission admin page, with independent state changes and projection validation.
4. Document the current fixed-spacing and auto-density rules as the dynamic renderer's required behavior.
5. Write the Python reference-corpus generator and commit the first corpus.

**Exit criterion:** expected outputs are generated from a known pinned Python environment and reviewed as a conformance contract.

### Phase B: Build the pure port

**Implementation status:** Complete for the canonical south-LPS scope.

1. Add the narrow south-LPS TypeScript utility module.
2. Implement canonical LGRS line snapping for 10 m, 100 m, 1 km, and auto display spacing, plus full labels and domain clipping.
3. Add unit and property tests against the complete reference corpus.
4. Do not connect it to the map until all pure tests pass.

**Exit criterion:** TypeScript matches every reference coordinate, label, corner, and unsupported-domain outcome.

### Phase C: Add the resolver and dynamic map path

**Implementation status:** Complete for runtime behavior. End-to-end no-fetch coverage remains a follow-up.

1. Add `gridRenderMode` to mission typing/schema/audits.
2. Implement one resolved-grid selector/hook and keep legacy uploaded data behind it.
3. Refactor `Grid`, mouse-coordinate display, grid preferences, pages, and exports to use the resolved grid source.
4. Skip full-grid loading for dynamic missions.
5. Add browser tests for projection, viewport updates, feature limits, and legacy fallback.

**Exit criterion:** a mission in `dynamic-lgrs` mode draws and labels a grid without any grid-file HTTP request; a mission in `server-file` mode remains unchanged.

### Phase D: Change the admin workflow

**Implementation status:** Complete. Browser coverage of the full admin-to-map workflow remains a follow-up.

1. Present the explicit server-file versus dynamic-LGRS mission toggle, validating the dynamic option against the mission projection.
2. Keep the file-upload UI under a clear server-file legacy/custom-grid section.

**Exit criterion:** enabling dynamic LGRS grid rendering stores only `gridRenderMode` in Automerge and never writes `Data/<grid>.json`.

### Phase E: Simplify legacy infrastructure

**Implementation status:** Partial. Direct consumers were migrated, but the compatibility singleton, endpoint audit, and retirement documentation remain.

1. Replace direct `globalGrid` imports with the resolver/hook.
2. Delete dynamic-only grid-fetch and spacing-inference code.
3. Audit and remove unused server endpoints only after external-consumer confirmation.
4. Document legacy upload retirement criteria and migration options.

**Exit criterion:** grid kind is decided once at the resolver, not rediscovered across components.

---

## 7. Acceptance Criteria

- A mission in `dynamic-lgrs` mode renders correct LGRS lines and labels without uploading or downloading a grid matrix.
- Dynamic TypeScript results match the version-pinned Python reference corpus across every committed conformance case.
- The dynamic path never renders beyond the supported LPS domain or silently enters unsupported LTM behavior.
- Dynamic `Auto` spacing follows the existing visible-extent stride behavior, while fixed 10 m, 100 m, and 1 km modes retain their selected spacing.
- Dynamic viewport rendering uses the existing auto-density rules rather than a new feature-limit policy.
- The existing legacy uploaded-grid flow passes its contract and browser tests unchanged.
- The existing GIS pipeline `--grid` generation and registration workflow remains unchanged.
- New map code consumes one resolved grid source rather than direct `globalGrid` state.
