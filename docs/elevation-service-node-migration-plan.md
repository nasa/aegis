# Completed Migration: Native Node Elevation Sampling

## 1. Goal

AEGIS previously got elevation data from an external GDAL/Python container. The Express API now
reads mission DEM GeoTIFFs directly with the native Node raster modules.

This plan replaces that container with a **native Node implementation inside the existing
Express API** that reads the DEM GeoTIFF directly off the shared static volume. The reader will
support ordinary GeoTIFFs, including both tiled and striped files. Cloud Optimized GeoTIFF (COG)
layout is an optional performance and interoperability improvement, not an input requirement.

The native-runtime cutover in this branch is intentionally limited to replacing the Docker GDAL
service with Node inside the existing Express API. The mission's existing `demFilePath` and
`demResolution` fields remain the configuration contract for this branch.

### Implementation progress

- Commit `8de50b43` (`Add native Node raster and elevation modules`) contains the completed first
  implementation batch.
- [x] Promote the native raster sampler, block reader, bounded open-handle cache, coordinate
      transform, elevation interpolation, and elevation profile wrapper into production modules.
- [x] Add focused tests for interpolation parity, pixel truncation/coordinate validation,
      segment-boundary behavior, NoData sentinel conversion, and pre-allocation sample limits.
- [x] Replace the Express elevation route with the native implementation, using the authorized
      mission document for `demFilePath` and `demResolution` and ignoring spoofable body values.
- [x] Derive supported lunar stereographic/equirectangular proj4 definitions from embedded
      GeoTIFF GeoKeys and enforce lexical plus real-path containment under the mission `Data/`
      directory.
- [x] Add route integration, CRS derivation, request validation, and path/symlink containment
      tests.
- [x] Add deterministic tiled/striped raster fixtures, cache tests, and end-to-end golden parity
      coverage.
- [x] Remove the GDAL/Python runtime and all associated Compose, environment, CI, and debug
      configuration.
- [x] Audit all 45 current Automerge missions and every locally available configured DEM.

### Compatibility audit and fixtures

The migration audited all 45 current Automerge mission documents. Their persisted display
configuration contains seven historical variants, including blank fields, lunar Mercator,
Earth Web Mercator, and lunar south-pole stereographic strings. Runtime sampling deliberately
does not trust those evolving display strings; it derives the sampling CRS from each DEM.

Fourteen locally available configured DEMs represented seven distinct GeoKey records and three
sampling CRS families: custom lunar equirectangular, custom lunar south-pole stereographic, and
standard EPSG:3857. Standard EPSG rasters frequently omit redundant ellipsoid GeoKeys, so the
derivation path resolves both `ProjectedCSTypeGeoKey` and `GeographicTypeGeoKey` before requiring
custom ellipsoid parameters. The remaining configured DEMs were absent from this workstation and
therefore could not be decoded locally; missing runtime files continue to fail explicitly.

The test suite is hermetic. Tiny committed tiled and striped GeoTIFFs exercise block reads,
multiple bands, NoData, and cache behavior. Small Apollo 14 and mission 50 extracts preserve
GDAL-derived coordinates and expected values in `src/tests/vitest/fixtures/raster/`; ongoing tests
do not require mission data, Python, GDAL, a running server, or `STATIC_DIR`.

A **subsequent branch** will update the **Mission** section of the admin UI as one cohesive
raster-configuration batch:

- replace the free-text DEM path and manually entered DEM resolution with a validated dropdown
  of GeoTIFFs found directly in that mission's `Data/` folder;
- derive and display DEM resolution from the selected file's georeferencing instead of asking an
  administrator to type it; and
- add a second validated dropdown for the absolute-slope analytical GeoTIFF now emitted as
  `Data/slope_degrees_uint16_cog.tif`, including validation of its adjacent
  `Data/slope_degrees_uint16_cog.json` encoding metadata.

The implementation is split into a reusable **analytical raster sampler** and a thin elevation
profile wrapper. Elevation is the first consumer, but the same sampler can later read numeric
values such as slope, aspect, or terrain classes from other GeoTIFF bands without duplicating
file, projection, bounds, or NoData handling.

### Why this is a good fit

- The GIS conversion pipeline already produces COG DEMs (see
  `GIS_data_conversion_pipeline/esri-to-aegis-lunar-southpole/config.py`: `DEM_COMPRESS =
COG_COMPRESS = "deflate"`, with a `_cog` filename marker), so the input format we want is
  already an efficient form of GeoTIFF. Legacy non-COG GeoTIFFs remain supported.
- The frontend already reads GeoTIFF/COG layers in the browser via `ol/source/GeoTIFF`
  (geotiff.js under the hood). The server will use the same underlying decoder family.
- Removing the container removes an entire image build, a public Docker Hub image
  (`bfeistnasa/aegis-gdal`), a private base image dependency, and cross-container HTTP hops.
- A shared raster-sampling layer creates a direct path to future numeric raster use cases instead
  of replacing one elevation-only service with another elevation-only implementation.

---

## 2. Current Implementation (what we are replacing)

### 2.1 Request flow

```
Browser
  └─ http-client/elevation.ts  (getElevationProfile / getElevationSinglePoint)
       └─ POST /api/v1/elevation?missionId=…
            └─ src/server/express/routes/elevation.ts
                 └─ fetch http://${GDAL_HOST}:${GDAL_PORT}/pathToElevationProfile
                      └─ elevationService.py  (GDAL + great_circle_calculator)
                           └─ reads /static/missionFiles/<missionId>/<demFilePath>
```

### 2.2 Key files

| File                                          | Role                                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `src/server/python/elevationService.py`       | Flask/waitress service; the algorithm we must port to TS     |
| `src/server/python/great_circle_calculator/`  | Great-circle interpolation used to densify each path segment |
| `src/server/express/routes/elevation.ts`      | Express route; currently proxies to the GDAL container       |
| `src/http-client/elevation.ts`                | Client wrappers (unchanged shape; keeps working)             |
| `src/typings/network/internalApi.d.ts`        | `ElevationProfilePostData`, `ElevationGdalRequestBody`       |
| `docker/gdal/Dockerfile`                      | Builds the GDAL image                                        |
| `docker-compose.yml`                          | Declares the `gdal` service + `/static` volume mount         |
| `docker-compose.services.yml` / `.public.yml` | Build/pull the GDAL image locally / from Docker Hub          |

### 2.3 The algorithm (from `elevationService.py`)

For each consecutive pair of points in `path`:

1. Compute `steps = ceil(segmentDistanceMeters / demResolutionMeters)` (done in `elevation.ts`
   today, passed as `steps[]`).
2. If `steps > 1`, densify the segment with **great-circle interpolation**
   (`getInterpolatedArray` → `intermediate_point`) into `steps` lat/lon points; else use the
   two endpoints.
3. Convert each lat/lon to the DEM's **pixel coordinates**:
   - Build a coordinate transform from geographic (lat/lon) to the DEM's projection using the
     DEM's embedded projection WKT (`osr` + `OAMS_TRADITIONAL_GIS_ORDER`).
   - Apply the DEM's affine geotransform (`xOrigin`, `pixelWidth`, `yOrigin`, `pixelHeight`).
4. Read the raster value at each pixel (`band.ReadAsArray(x, y, 1, 1)`).
5. Apply **NoData handling**: out-of-bounds or NoData → sentinel `-1100101`.
6. Return an array-of-arrays: one inner array of elevations per input segment.

The Express route then `parseFloat`s every value and wraps it as `WrappedResponse<number[][]>`.

> **Important detail to preserve:** the DEM is in a **polar-stereographic lunar projection**
> (not lat/lon). The lat/lon → projected-XY → pixel transform is the crux of correctness and
> must be reproduced exactly, using the DEM's own embedded CRS. `proj4` is already a project
> dependency and OpenLayers already registers the mission projection on the client
> (`MapProvider`), so we have a proven transform path to mirror.

---

## 3. Proposed Node Implementation

### 3.1 Library choice: `geotiff.js`

Use [`geotiff`](https://github.com/geotiffjs/geotiff.js) (geotiff.js), the same pure-JS library
OpenLayers uses internally. It runs in Node, reads from the filesystem, and supports exactly
what both ordinary GeoTIFFs and COGs provide:

- **Windowed reads** — `image.readRasters({ window: [left, top, right, bottom] })` reads the
  blocks overlapping a pixel window. For tiled files these are tiles; for striped files they are
  strips, which may span the full image width but do not inherently require loading the whole
  image.
- **Optional overview selection** — `tiff.readRasters({ bbox, resX, resY })` can pick an internal
  overview when a caller deliberately requests a coarser output resolution. Exact point sampling
  should use the base image and does not benefit from overviews.
- **Geo metadata** — `image.getOrigin()`, `image.getResolution()`, `image.getBoundingBox()`,
  `image.getGeoKeys()`, and `getFileDirectory()` values give us the affine transform + CRS.
- **Compression support** includes Deflate, used by the current pipeline. Supported codecs must
  be verified against the exact geotiff.js version selected for the server; unsupported legacy
  compression should fail with a clear validation error rather than imply that COG is required.

`geotiff` 2.1.3 is now pinned as an explicit runtime dependency after the Node/esbuild prototype
spike. Keep that version through the cutover rather than combining this migration with a major
decoder upgrade.

Supporting libraries (all already present or tiny):

- **`proj4`** (already a dependency) — geographic (lat/lon) → raster projected coordinates.
  The raster's embedded CRS remains authoritative, as it is in the current GDAL path. During the
  initial migration, using the mission's `projProj4String` is acceptable only after validating it
  against the raster metadata.
- **Great-circle interpolation** — port `intermediate_point` (spherical slerp between two
  lat/lon points) to a small TS util. This is ~15 lines and avoids a Python dependency.

  > **Parity note (verified against source):** the Python `intermediate_point`
  > (`src/server/python/great_circle_calculator/great_circle_calculator.py`) computes the
  > angular `delta` using a **fixed FAI-sphere Earth radius of `6371000` m** hard-coded in
  > `great_circle_calculator/_constants.py` (`radius_earth_meters`). It does **not** use the
  > mission's `planetRadius`. For an exact byte-for-byte port, the TS util must use the **same
  > constant**, not `mission.planetRadius`. In practice the radius choice is nearly irrelevant
  > because it cancels in the ratio `sin((1 - f)·delta) / sin(delta)` used to place the
  > intermediate point — but to guarantee identical golden values we mirror the complete Python
  > calculation consistently. Do not mix a mission radius into only part of the calculation.
  > `ElevationProfilePostData.radius` is already sent by the client (`http-client/elevation.ts`)
  > but is **not** used by the current GDAL interpolation path; keep it in the payload for
  > backward compatibility but do not feed it into `intermediate_point` unless we deliberately
  > choose to diverge from the Python behavior (which would change golden values).

### 3.2 New module layout

```
src/server/raster/
  sampleRasterPoints.ts       # generic numeric point sampling by trusted raster descriptor
  rasterReader.ts             # geotiff.js open, metadata inspection, block reads
  coordTransform.ts           # source coordinates -> raster pixel
  rasterCache.ts              # bounded LRU of open handles keyed by abs path (+ mtime)
  types.ts                    # raster descriptor, sample selection, result/validity types

src/server/elevation/
  readElevationProfile.ts     # profile-specific orchestration and response shape
  geoInterpolation.ts         # great-circle intermediate_point port + step densifier
  constants.ts                # legacy NODATA_SENTINEL = -1100101
```

The reusable raster layer returns numeric values with explicit missing/NoData status. The
elevation wrapper alone translates missing samples to the legacy `-1100101` sentinel. This keeps
an elevation-specific wire convention out of future slope or categorical-raster consumers.

### 3.3 Core sampling approach (works with COG and non-COG GeoTIFF)

Do **not** issue one `readRasters()` call per point. In the currently installed geotiff.js 2.1.3,
decoded-block caching defaults off and `fromFile()` does not expose the `cache: true` constructor
option. A series of 1x1 reads can therefore decompress the same tile or strip repeatedly.

Recommended approach:

1. Transform all requested coordinates to integer pixel coordinates, preserving the current
   Python behavior: `int()` truncates toward zero, so use `Math.trunc`, not rounding or flooring.
2. Reject or mark out-of-bounds pixels before reading.
3. Group pixels by their underlying tile or strip using image metadata.
4. Read each required block once, then extract all requested samples from that decoded block.
5. Preserve original point order in the returned values.

For a small, spatially compact segment, a single bounded pixel-window read is also acceptable.
Set a strict maximum window area so a diagonal or sparse path cannot allocate a huge rectangle.
Never use an unconditional whole-image fallback for striped GeoTIFFs; windowed reads already read
only the overlapping strips, and a full high-resolution DEM may exceed available memory.

COG byte ordering can improve range-based or remote access, but it does not change these sampling
semantics. Internal tiling generally improves local point-sampling efficiency; striped files
remain correct but may decode more pixels per requested point.

### 3.4 NoData + bounds handling (must match today)

- Out-of-bounds pixel (window outside image) → missing sample.
- Value equal to the band's NoData (read with `image.getGDALNoData()` when available, with the
  same tolerance behavior the Python code uses) → missing sample.
- The elevation wrapper converts missing samples to sentinel `-1100101` so downstream client
  behavior remains unchanged. Other raster consumers receive explicit missing status instead.
- geotiff.js sample indexes are zero-based; the current GDAL band number is one-based.

### 3.5 Express route changes (`src/server/express/routes/elevation.ts`)

- Remove the `fetch(...GDAL_HOST...)` call and the `ElevationGdalRequestBody` construction.
- Keep the existing auth check, query parsing, `resolutionMeters → steps` computation, and the
  `WrappedResponse<number[][]>` response shape **unchanged** so the client contract is stable.
- Use the authorized query mission ID as the only mission ID. The current route authorizes
  `req.query.missionId` but constructs the file path from `req.body.missionId`; do not preserve
  that mismatch. Resolve `demFilePath` from trusted server-side mission metadata. The client may
  continue sending the legacy body fields during this branch, but the server must ignore its
  `missionId`, `demFilepath`, and `resolutionMeters` values.
- Resolve the configured path with `path.resolve` and verify it remains inside that mission's
  `Data/` directory. Never pass a client-supplied or persisted relative path directly to the
  filesystem without this containment check.
- Validate that coordinates, distances, and resolution are finite; resolution is positive; array
  lengths match; the selected sample exists; and total requested sample count is below a hard
  limit. These checks protect the API event loop and memory from malformed or excessive work.
- Resolve the DEM path from the location the **API container** mounts, which is **not** the
  same as the GDAL container's `/static`.

  > **Verified mount paths (`docker-compose.yml`):**
  >
  > - GDAL container: `${STATIC_DIR}:/static` → DEM at `/static/missionFiles/<missionId>/<dem>`
  >   (this is what the current route string `/static/missionFiles/...` assumes).
  > - `apiv1` container: `${STATIC_DIR}:/${STATIC_DIR}` → DEM under the configured static
  >   directory. The exact path may be relative in local development and absolute in deployment.
  >
  > Therefore the Node route must resolve from the API's own `process.env.STATIC_DIR`, **not**
  > hard-code `/static` or prepend an extra slash. `STATIC_DIR` may be relative in local
  > development and absolute in deployment; `path.resolve(process.env.STATIC_DIR, ...)` handles
  > both forms. Confirm the resolved path remains under the expected mission directory.

- Call `readElevationProfile(...)` and wrap the result. Keep the existing structured
  `serverLogger.apiRoute` error logging.

### 3.6 Caching / performance

- Cache open `GeoTIFF` handles per absolute path in a bounded LRU keyed by `path + mtimeMs` so a
  file replacement invalidates the handle. Close file handles on eviction, replacement, and
  process shutdown. Opening a GeoTIFF reads metadata/IFDs rather than the full raster.
- Deduplicate block reads explicitly within each sampling request; do not assume decoded-block
  caching is enabled by `fromFile()`.
- Optionally use a geotiff.js decode `Pool` for large batch reads; likely unnecessary for
  point/traverse sampling. Decide based on profiling. See §3.7 for the full main-thread vs.
  worker/subprocess analysis and recommendation.

---

### 3.7 Threading / Event-Loop Blocking Analysis

**Question:** Should the elevation work run in a subprocess/worker so it doesn't block the
Node main thread?

### Context: what the API process looks like today

- The Express API is a **single Node process** on port 4001 with **no clustering** (see
  `src/server/express/server.ts` — one `createServer()` / `server.listen(4001)`, no
  `cluster`/`worker_threads`). Every request shares one event loop.
- The same process also drives **Socket.io**, the **Automerge WebSocket repo adapter**, and
  the Maestro namespaces. Anything that blocks the event loop stalls **all** of those
  simultaneously — including live collaborative editing sync. This raises the stakes for
  CPU-bound work.
- There is already a **subprocess precedent** in the codebase: `src/server/file/file.ts` uses
  `spawn` from `node:child_process` for file work, so an out-of-process pattern is not foreign
  here.

### Where the cost actually is

The elevation work has two parts with very different blocking profiles:

1. **I/O (reading raster blocks from disk):** `geotiff.js` reads are `async`/promise-based and
   file/stream I/O is offloaded by libuv. Windowed reads limit the blocks fetched, although a
   striped file may read substantially more bytes per point than a tiled file.
2. **CPU (decompression + math):** Decompression of each tile/strip and the per-point
   `proj4` transform + interpolation is **synchronous CPU** that runs on the main thread. This
   is the part that can block.

The magnitude scales with **how many tiles must be decoded** and **how many points are
sampled**:

- A single point or a short traverse touches one or a few tiles → sub-millisecond to a few ms.
  **Not worth offloading.**
- A long traverse at fine `demResolution` densifies into thousands of `steps`, potentially
  spanning many raster blocks, each needing decompression. This can reach tens of ms per
  request. With several such requests arriving together (e.g. a mission recompute), cumulative
  main-thread time could produce noticeable latency spikes for other clients.

### Options (in increasing cost/complexity)

| Option                               | What                                                                                                      | Pros                                                                                                   | Cons                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Main thread (default)**         | Do reads/decoding inline in the route.                                                                    | Simplest; matches current single-process model; zero IPC/serialization overhead.                       | Large batch reads can block the loop and stall Socket.io/Automerge.                                                                           |
| **B. geotiff.js decode `Pool`**      | Pass a shared `Pool` to `readRasters({ pool })` so **decompression** runs off-thread; math stays on main. | Built into the library; targets block decompression without a separate service.                        | Worker lifecycle and block-transfer cost; Node/esbuild worker packaging must be proven in the production bundle.                              |
| **C. `worker_threads` (in-process)** | Move the whole sample-a-profile job to a worker thread (optionally via a pool like `piscina`).            | Keeps everything in one process; can transfer typed arrays with zero-copy; full isolation of CPU work. | More plumbing; must marshal args/results; still shares the process (a crash can affect the API).                                              |
| **D. Separate subprocess/service**   | Keep an out-of-process elevation service (essentially what GDAL is today, but in Node).                   | Full isolation; can scale/restart independently.                                                       | Re-introduces the very cross-process hop and ops burden this migration is trying to remove. **Not recommended** — it undoes the main benefit. |

### Recommendation

- **Start with Option A (main thread).** For the dominant workload (single points, station
  elevations, typical traverses) the CPU cost is small and offloading would add complexity and
  IPC overhead for no user-visible gain. This recommendation depends on block-deduplicated reads
  and hard request limits, not per-point 1x1 reads.
- **Add Option B (geotiff.js `Pool`) as a targeted optimization** gated behind measurement:
  only enable a decode pool when a request will read above a tile/point threshold (e.g. long
  traverses). This is the lowest-effort way to move the real hot spot — Deflate decompression —
  off the main thread, and it lives inside the library we're already adopting.
- **Escalate to Option C (`worker_threads` / `piscina`)** only if profiling shows the API event
  loop is still being starved under realistic concurrent load. Prefer a small worker pool over
  spawning per-request.
- **Avoid Option D.** A separate long-running subprocess re-creates the cross-process hop and
  operational surface we are explicitly removing by killing the GDAL container.

### What to measure before deciding

Add lightweight instrumentation for the new Node implementation:

- Per-request wall time and **synchronous CPU time** for elevation sampling (e.g. wrap the
  decode/transform loop with `performance.now()` and log via `serverLogger`).
- **Event-loop lag** (e.g. `perf_hooks.monitorEventLoopDelay`) sampled during elevation load to
  confirm whether Socket.io/Automerge latency is actually affected.
- Tile/point counts per request, so we can set the Option-B threshold empirically.

If p95 sync CPU per request stays low (single-digit ms) and event-loop lag is unaffected under
concurrency, **Option A alone is sufficient** and no subprocess/worker is warranted.

---

## 4. Follow-up Branch: Mission Admin and Analytical Raster Configuration

**Everything in this section is deferred to a subsequent branch and is not part of the native
elevation-runtime cutover.** Treat the DEM selector and the new absolute-slope selector as one
implementation batch in that follow-up. They
share the same file discovery, server-side inspection, validation, UI states, and tests; do not
land one as another free-text field while postponing the common infrastructure.

### 4.1 Mission fields and migration behavior

- Keep `demFilePath`, but change its editor from `InLineEditInput` to a dropdown populated from
  GeoTIFFs directly inside `missionFiles/<missionId>/Data/`. Persist paths in the existing
  mission-relative form (`Data/<filename>`), never an absolute filesystem path.
- Add `absoluteSlopeFilePath: string` to `Mission`, initialized to `""` for old and new missions.
  This field identifies the analytical raster, not the separately colorized slope display layer.
  Add it to `MissionFields` so `POST /api/v1/missionAutomerge/fields` and the conversion pipeline's
  registration flow can configure it.
- Remove the editable `demResolution` control from the admin. During this migration, retain
  `demResolution` in the mission document as a **derived compatibility field**, because existing
  timeline, preference, and elevation code reads it. Whenever a DEM is selected, set it from the
  inspected native pixel size in the same Automerge change as `demFilePath`; display it as
  read-only metadata. A later cleanup may remove the persisted field after all consumers read
  validated raster metadata directly.
- Existing missions require no document migration: blank slope means “not configured,” and the
  first inspection of their current DEM path can backfill/correct `demResolution`. If a legacy
  `demFilePath` no longer exists or fails validation, preserve the stored value long enough to
  show an explicit invalid-current-selection state rather than silently clearing it.
- The pipeline `register` step should set `absoluteSlopeFilePath` when
  `Data/slope_degrees_uint16_cog.tif` was generated. It should continue setting the DEM path, but
  derive DEM resolution from the produced GeoTIFF (or use the same shared inspection contract)
  rather than treating `--dem-resolution` as independently authoritative mission metadata.

### 4.2 Discovery and inspection API

Do not have the browser infer analytical validity from filename extensions or parse large TIFFs.
Add an admin-only server endpoint that lists and inspects candidate files under the authorized
mission's `Data/` directory. It may extend the existing file API or be a dedicated raster-config
route, but it must return the normal `WrappedResponse<T>` shape rather than copy the current file
route's inconsistent response behavior.

Discovery rules:

- list only immediate, regular files ending in `.tif` or `.tiff`, case-insensitively;
- return stable, case-insensitive filename ordering and mission-relative `Data/<filename>` paths;
- resolve real paths and enforce containment under the authorized mission `Data/` directory;
- do not accept arbitrary directories or absolute paths from the client; and
- inspect on demand or cache by absolute path + `mtimeMs`, reusing the raster metadata/cache layer
  from §3 rather than opening each large file repeatedly.

Return enough normalized metadata for selection and display: filename/path, dimensions, band
count, sample type/bit depth, native X/Y pixel size, units, CRS identity/definition, bounds,
NoData, scale/offset, block layout, and validation errors/warnings. File size and modification
time are useful diagnostics but are not validity criteria.

### 4.3 Validation profiles

Selection-time validation should be a **lightweight compatibility check**, not a second GIS
quality-assurance pipeline. The conversion pipeline owns comprehensive validation of generated
products. The admin only needs enough inspection to prevent selecting a file that the application
clearly cannot use and to derive the metadata it needs.

**Common requirements**

- the file has a `.tif` or `.tiff` extension and geotiff.js can open its metadata;
- it has at least one numeric band that the sampler can read;
- dimensions, georeferencing, pixel size, and CRS metadata required by the sampler are present;
- the file uses a compression and sample type supported by the selected geotiff.js version; and
- the configured path remains contained within the mission's `Data/` directory.

Do not scan the raster, sample arbitrary pixels, verify scientific accuracy, or perform expensive
whole-file checks when the administrator opens the page or changes a selection. Any decode error
encountered during real sampling must still produce a clear runtime error. Deeper checks belong in
the pipeline and its contract tests.

**DEM profile**

- derive `demResolution` from the GeoTIFF's native pixel size and display it read-only. Provide an
  explicit refresh/reinspect action that recomputes and persists this value for the currently
  selected DEM, even when the dropdown selection has not changed;
- record the band, scale/offset, and NoData metadata that runtime sampling will use; and
- reject only metadata shapes the implementation cannot interpret, such as missing
  georeferencing or a resolution that cannot be expressed in metres per pixel.

**Absolute-slope profile**

- require an adjacent JSON file with the same basename (`<name>.json`);
- validate only the JSON fields required to decode samples: units, data type, scale, offset, and
  NoData;
- reject obvious metadata conflicts between the JSON and TIFF; and
- compare the slope raster's CRS and grid metadata with the selected DEM and flag a clear
  incompatibility. This is a metadata comparison, not a raster-content analysis.

The current pipeline output is a single-band UInt16 COG with `scale = 0.01`, `offset = 0`,
`noData = 65535`, and units of degrees. The validation contract should be metadata-driven rather
than hard-code that filename or those exact encoding values, so another valid mission product can
be selected.

### 4.4 Mission admin UX

In `src/pages/admin/mission.tsx`, replace the current DEM controls with an **Analytical Rasters**
section (or retain the DEM heading with both controls grouped beneath it):

1. **Elevation / DEM GeoTIFF** dropdown — all discovered `.tif`/`.tiff` files, with invalid files
   disabled or clearly marked and their reason available.
2. **Absolute slope GeoTIFF** dropdown — the same candidates evaluated with the slope profile;
   include a “Not configured” option.
3. Read-only metadata for each selection: resolution, dimensions, CRS, data type, NoData, and for
   slope the decoded units/scale/offset and companion JSON filename.
4. Loading, empty-folder, inspection-error, invalid-current-selection, and file-disappeared states.
5. A refresh/reinspect action that rescans the `Data/` folder and re-inspects the currently
   selected files. For the DEM, it must recompute and persist `demResolution` even if the same
   file remains selected. This supports existing missions and missions with only one TIFF, where
   changing the dropdown cannot be used to trigger recalculation.

Selecting a candidate must wait for successful server validation, then persist the path and any
derived compatibility metadata in one Automerge change. Do not briefly save an unvalidated path.
If changing the DEM makes the configured slope incompatible, require the administrator to choose
a compatible slope (or explicitly clear it) rather than leave a silently mismatched pair.

Rename/delete behavior also needs a defined failure mode: the existing Mission Data Files manager
can rename or remove a selected TIFF/JSON. At minimum the raster section must revalidate after a
file-list refresh and visibly report a broken selection; preferably rename/delete warns when the
file is referenced, and deleting a selected file requires confirmation. Runtime sampling must
still reject missing or newly invalid files server-side.

### 4.5 Admin and contract tests

- Route tests: authorization, traversal/symlink containment, case-insensitive extension filtering,
  deterministic ordering, unreadable/unsupported TIFF metadata, and cache invalidation.
- Lightweight validation tests: usable DEM metadata, valid scaled slope + JSON, missing/malformed
  required JSON fields, and clearly incompatible CRS/grid metadata.
- Browser/component tests: dropdown population, disabled invalid choices with reasons, successful
  atomic selection, derived read-only DEM resolution, refreshing and persisting resolution
  without changing the selected DEM, clearing slope, rescanning files, and stale selected files.
- Pipeline contract tests own the deeper checks: generated TIFF/JSON metadata and encoding are
  correct, the complete raster is readable, expected value ranges/NoData are valid, and generated
  DEM/slope grids align. Also verify those products pass the lightweight server check and that
  registration writes both analytical raster paths plus the derived DEM resolution.

---

## 5. GeoTIFF Compatibility + Analytical Raster Contract

### 5.1 COG is optional

- COG and non-COG GeoTIFFs use the same sampling path.
- Tiled GeoTIFFs are generally more efficient for sparse point access than striped files.
- Internal overviews are optional and are not used for exact native-resolution point samples.
- Do not add a `demIsCog` mission field. File layout is an observable property of the file, and
  the pipeline explicitly avoids persisted `isCog` flags.
- Inspect block layout and available overviews when opening the file for diagnostics and
  performance metrics, not to select separate correctness paths.
- Validate decoder compatibility when a file is configured or first opened. An unsupported
  compression codec is a format-support error, not evidence that the file must be converted to
  COG.

### 5.2 Future analytical rasters

The reusable sampler accepts a trusted internal descriptor containing at least:

- absolute path resolved by the server from a registered mission resource,
- CRS/proj4 definition or validated relationship to the mission CRS,
- zero-based sample/band index,
- expected data type and units,
- NoData policy.

Do not expose arbitrary file paths through a generic public endpoint. Add domain endpoints or
server-side operations such as elevation-profile or slope-at-points that select a registered
raster descriptor and then call the shared sampler.

The pipeline now emits `Data/slope_degrees_uint16_cog.tif` plus
`Data/slope_degrees_uint16_cog.json` alongside the colorized display product. The TIFF stores
scaled UInt16 absolute slope values; the JSON defines the exact scale, offset, NoData, units, and
color ramp. The generic sampler must apply this metadata rather than assume raw samples are
already degrees. A COG is useful for consistency and remote access, but the Node sampler does not
require COG layout.

---

## 6. Docker / Infrastructure Changes

1. **`docker-compose.yml`** — remove the `gdal` service block. The API service (`apiv1`)
   **already** mounts the static directory (`${STATIC_DIR}:/${STATIC_DIR}`), so the DEM files
   are readable inside the API container at `/${STATIC_DIR}/missionFiles/...`. Because this is a
   **different in-container path** than the GDAL container's `/static`, the route must build the
   DEM path from `STATIC_DIR` (see §3.5) rather than the current hard-coded `/static/...`
   string. Also remove the `gdal` service from **`docker-compose.preview.yml`** (it declares its
   own `gdal` block, verified via grep). No new mount is required on `apiv1`.
2. **`docker-compose.services.yml`** — remove the local GDAL build.
3. **`docker-compose.services.public.yml`** — remove the public `bfeistnasa/aegis-gdal` image
   override.
4. **`docker/gdal/Dockerfile`** — delete.
5. **env config** — remove `GDAL_HOST` / `GDAL_PORT` from **`env.config.ts`** (verified: both
   are declared there, `GDAL_HOST` and `GDAL_PORT`) and from **`.env.template`**. Regenerate
   `.env` from the template after the change. Grep for `GDAL_` across the repo and all compose
   files to catch stragglers, including the CI pipeline references (verified in
   `.gitlab/run-on-commits.gitlab-ci.yml` `docker:build:gdal:` and `.gitlab/includes/server-jobs.yml`
   which logs the `gdal` container) and the `gdal: Remote Attach` debug config in
   `.vscode/launch.json`.
6. **npm scripts** — drop `docker:services:public`'s GDAL-specific bits if they become empty;
   verify `npm run docker:services` no longer references GDAL.

---

## 7. Files to Add / Change / Delete (summary)

### Add in this branch

- `src/server/raster/sampleRasterPoints.ts`
- `src/server/raster/rasterReader.ts`
- `src/server/raster/coordTransform.ts`
- `src/server/raster/rasterCache.ts`
- `src/server/raster/types.ts`
- `src/server/elevation/readElevationProfile.ts`
- `src/server/elevation/geoInterpolation.ts`
- `src/server/elevation/constants.ts`
- Unit tests under `src/tests/vitest/server/raster/` and `server/elevation/` (see §8).

### Change in this branch

- `src/server/express/routes/elevation.ts` — call native module instead of GDAL fetch.
- `docker-compose.yml`, `docker-compose.services.yml`, `docker-compose.services.public.yml`.
- `package.json` — add a directly tested `"geotiff"` runtime dependency.
- `README.md` — update the "Public GDAL image" section and elevation description.
- `CLAUDE.md` — update the elevation flow description (no more GDAL container).

### Deferred to the subsequent admin/absolute-slope branch

- A server route/module for authorized analytical-raster discovery and validation.
- `src/pages/admin/mission.tsx` — land the DEM dropdown, derived metadata display, and absolute-
  slope dropdown together.
- `src/typings/mission.d.ts`, `src/store/storeUtils/mission.ts`, and
  `src/typings/network/clientTypes.d.ts` — add `absoluteSlopeFilePath`; retain `demResolution` as
  derived compatibility metadata rather than an editable field.
- `GIS_data_conversion_pipeline/esri-to-aegis-lunar-southpole/register.py` — register the generated
  absolute-slope raster and derive DEM resolution from the generated TIFF.
- GIS pipeline and admin contract tests for analytical slope configuration.

### Delete (in the hard-cutover branch)

- `docker/gdal/Dockerfile`
- `src/server/python/elevationService.py`
- `src/server/python/great_circle_calculator/` (once the TS port is verified). Note the
  hard-coded FAI radius lives in `great_circle_calculator/_constants.py` and the interpolation in
  `great_circle_calculator/great_circle_calculator.py::intermediate_point` — these are the exact
  references for the golden-value tests, so keep them until parity is confirmed.
- `src/typings/network/internalApi.d.ts::ElevationGdalRequestBody` (remove the now-unused type).
- **CI pipeline** — remove the `docker:build:gdal:` job in
  `.gitlab/run-on-commits.gitlab-ci.yml` and the `gdal`-log line in
  `.gitlab/includes/server-jobs.yml`. Remove the `gdal: Remote Attach` config from
  `.vscode/launch.json` (it attaches to the Python `debugpy` in the container).
- **`docker-compose.preview.yml`** — remove its `gdal` service block.

---

## 8. Testing Strategy

1. **Golden-value parity tests.** Before implementing the cutover, capture the Python service's
   output as committed test fixtures for a
   representative set of paths against a known mission DEM (single point, short traverse, long
   traverse, out-of-bounds point, NoData point). Assert the Node implementation returns the same
   values (allowing a tiny epsilon only if interpolation rounding differs; aim for exact pixel
   match). The Python service and GDAL container do not remain available at runtime after the
   cutover.
2. **Unit tests (Vitest)** for:
   - `geoInterpolation.ts` — great-circle `intermediate_point` port vs. the Python reference
     values.
   - `coordTransform.ts` — lat/lon → pixel for known DEM corners/center.
   - `rasterReader.ts` — tiled and striped windows, block deduplication, multiple samples, numeric
     types, NoData, and out-of-bounds behavior.
   - `readElevationProfile.ts` — missing samples convert to `-1100101`; pixel conversion uses
     truncation and retains segment-boundary duplicates.
3. **Route test** — `elevation.ts` returns the correct `WrappedResponse<number[][]>` shape and
   preserves auth behavior (existing `elevation_thunk.test.ts` mocks the http-client, so the
   client side needs no change).
4. **Fixture rasters** — commit tiny deterministic tiled and striped GeoTIFFs with the lunar CRS,
   Float32 values, NoData, multiple bands/samples, and optionally an overview. At least one fixture
   should be a non-COG GeoTIFF to make compatibility a tested contract.
5. Run the full gate per `CLAUDE.md`: format changed files with Prettier, then `npm run
test:all`.

---

## 9. Rollout / Cutover

This is a **hard cutover**, not a dual-engine rollout. The completed branch contains only the
native Node elevation runtime. It must not include an engine switch, a GDAL fallback, shadow
requests, or a bake-in period with both implementations deployed.

The work may still be committed in reviewable implementation tranches on this branch, but the
branch is not deployable until all hard-cutover steps are complete:

1. Implement and test the native raster sampler and elevation profile wrapper. Use committed
   golden outputs captured from the old Python implementation for parity tests; do not preserve
   the Python service as a runtime fallback.
2. Replace the existing elevation route implementation directly with the Node implementation.
   The public route and response contract remain stable, but there is only one execution path.
3. Resolve the configured DEM from the authorized mission's existing server-side metadata and
   enforce mission-directory containment. No admin UI or mission-schema changes are required for
   this cutover.
4. Verify tiled, striped, COG, and non-COG GeoTIFFs used by existing missions. Include single
   points, traverses, NoData edges, station elevations, and the measurement tool.
5. In the same branch, remove the GDAL container and image configuration, Python elevation
   service, Python interpolation package, GDAL environment variables, CI jobs, debug
   configuration, and obsolete internal request types listed in §7.
6. Run the full build and test gate against the final Node-only system. Deployment of this branch
   is the cutover; rollback means reverting the deployment, not switching engines at runtime.

The analytical-raster discovery API, DEM dropdown and derived-resolution admin UX, absolute-slope
mission field/dropdown, and pipeline registration changes in §4 are implemented in the next
branch after this runtime cutover.

---

## 10. Risks & Open Questions

- **CRS fidelity.** The raster projection must be reproduced exactly. The current GDAL path uses
  the raster's embedded CRS; validate any mission/resource proj4 definition against it. Confirm
  proj4 output matches GDAL/`osr` for the lunar polar-stereographic CRS at several coordinates.
- **Axis order.** GDAL 3 uses `OAMS_TRADITIONAL_GIS_ORDER` (lon/lat). Ensure the proj4 pipeline
  we build uses the same axis convention to avoid swapped coordinates.
- **NoData tag location.** Confirm geotiff.js exposes `GDAL_NODATA` for the tiled and striped
  GeoTIFFs used by existing missions
  (file-directory tag). If not, read it from the mission or from GDAL metadata; keep the same
  tolerance logic the Python code applies.
- **Striped legacy DEM performance.** Correctness uses the same windowed path, but sparse reads
  may repeatedly touch wide strips. Block deduplication, request limits, and measurements against
  the largest legacy files determine whether selected files should be converted to tiled
  GeoTIFF/COG for performance; conversion is not a functional requirement.
- **Interpolation exactness.** The Python `intermediate_point` uses a spherical central angle.
  Port the complete calculation consistently; the hard-coded radius cancels from its
  distance/radius ratio, while mixing radii would alter results.
- **Static volume path.** Verify the API container actually has the mission files mounted and at
  what path, then align the route's base path constant accordingly (§6, item 1).
- **Untrusted workload/path input.** Resolve registered resources server-side, enforce path
  containment, and cap points/window area before raster work begins.
- **Configuration drift.** Selected files can be renamed, deleted, or replaced after validation.
  Cache by path + mtime, revalidate replacements, expose broken references in admin, and fail
  runtime requests clearly rather than continuing with stale metadata.
- **Resolution semantics.** `demResolution` currently drives traverse densification. Define it as
  native square-pixel ground resolution in metres; reject or explicitly support rasters whose CRS
  units, rotation, or unequal X/Y pixel sizes cannot produce that single value.
- **Slope metadata ownership.** Treat the adjacent JSON as part of the selected analytical-slope
  resource. Define whether TIFF tags or JSON win before accepting files that specify both; the
  recommended initial behavior is to require agreement and reject conflicts.
- **Build compatibility.** Test geotiff.js filesystem reads and any worker `Pool` from the built
  esbuild artifact, not only from Vitest/source execution.

---

## 11. Estimated Effort

| Task                                                   | Rough size |
| ------------------------------------------------------ | ---------- |
| Generic raster sampler + metadata/cache lifecycle      | M          |
| Elevation wrapper (transform, interpolation, sentinel) | M          |
| Route rewrite + wrapping                               | S          |
| Event-loop/CPU instrumentation (§3.7) + optional pool  | S          |
| Request validation + resource/path containment         | S          |
| Docker/compose/env cleanup                             | S          |
| Golden parity + tiled/striped fixture tests            | M          |
| Hard-cutover cleanup + docs update                     | S          |

Follow-up branch:

| Task                                            | Rough size |
| ----------------------------------------------- | ---------- |
| Shared raster discovery + validation API        | M          |
| DEM + absolute-slope admin selector batch       | M          |
| Pipeline registration/metadata contract updates | S          |

_Implement in reviewable commits, but merge and deploy only the completed hard cutover: prove
parity with golden tests and remove the GDAL/Python runtime in this branch._

```

```
