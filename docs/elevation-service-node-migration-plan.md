# Plan: Replace the GDAL Elevation Container with a Native Node Implementation

## 1. Goal

Today, AEGIS gets elevation data from an **external Docker container ("gdal")** that runs a
thin [`waitress`](https://pypi.org/project/waitress/) + Flask Python service
(`src/server/python/elevationService.py`). The AEGIS Express API makes an HTTP call to this
service, which uses GDAL + `great_circle_calculator` to sample a DEM GeoTIFF and returns
per-segment elevation arrays.

This plan replaces that container with a **native Node implementation inside the existing
Express API** that reads the DEM GeoTIFF directly off the shared static volume. The reader will
support ordinary GeoTIFFs, including both tiled and striped files. Cloud Optimized GeoTIFF (COG)
layout is an optional performance and interoperability improvement, not an input requirement.

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

Add `geotiff` as an explicit runtime dependency. The current lockfile contains geotiff.js 2.1.3
only as a transitive OpenLayers development dependency. Select and pin the server version after a
small Node 22 + esbuild compatibility spike instead of assuming a 3.x upgrade is harmless.

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
  that mismatch. Prefer removing `missionId` and `demFilepath` from the request body and resolving
  the configured raster from trusted server-side mission metadata.
- Until server-side mission lookup is introduced, require body/query mission IDs to match,
  resolve the candidate path with `path.resolve`, and verify it remains inside that mission's
  directory. Never pass a client-supplied relative path directly to the filesystem.
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

## 3.7 Threading / Event-Loop Blocking Analysis

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

Add lightweight instrumentation during rollout (behind the same switch from §8):

- Per-request wall time and **synchronous CPU time** for elevation sampling (e.g. wrap the
  decode/transform loop with `performance.now()` and log via `serverLogger`).
- **Event-loop lag** (e.g. `perf_hooks.monitorEventLoopDelay`) sampled during elevation load to
  confirm whether Socket.io/Automerge latency is actually affected.
- Tile/point counts per request, so we can set the Option-B threshold empirically.

If p95 sync CPU per request stays low (single-digit ms) and event-loop lag is unaffected under
concurrency, **Option A alone is sufficient** and no subprocess/worker is warranted.

---

## 4. GeoTIFF Compatibility + Analytical Raster Contract

### 4.1 COG is optional

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

### 4.2 Future analytical rasters

The reusable sampler accepts a trusted internal descriptor containing at least:

- absolute path resolved by the server from a registered mission resource,
- CRS/proj4 definition or validated relationship to the mission CRS,
- zero-based sample/band index,
- expected data type and units,
- NoData policy.

Do not expose arbitrary file paths through a generic public endpoint. Add domain endpoints or
server-side operations such as elevation-profile or slope-at-points that select a registered
raster descriptor and then call the shared sampler.

The current slope pipeline colorizes Float32 slope degrees into RGBA display products and deletes
the intermediate numeric raster. Reading absolute slope therefore requires a separate analytical
output. Retain or emit a compressed, preferably tiled Float32 GeoTIFF containing slope degrees
alongside the colorized display layer. It may be a COG for consistency or remote access, but the
Node sampler does not require COG layout.

---

## 5. Docker / Infrastructure Changes

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

## 6. Files to Add / Change / Delete (summary)

### Add

- `src/server/raster/sampleRasterPoints.ts`
- `src/server/raster/rasterReader.ts`
- `src/server/raster/coordTransform.ts`
- `src/server/raster/rasterCache.ts`
- `src/server/raster/types.ts`
- `src/server/elevation/readElevationProfile.ts`
- `src/server/elevation/geoInterpolation.ts`
- `src/server/elevation/constants.ts`
- Unit tests under `src/tests/vitest/server/raster/` and `server/elevation/` (see §7).

### Change

- `src/server/express/routes/elevation.ts` — call native module instead of GDAL fetch.
- `docker-compose.yml`, `docker-compose.services.yml`, `docker-compose.services.public.yml`.
- `package.json` — add a directly tested `"geotiff"` runtime dependency.
- GIS pipeline — retain/emit analytical numeric GeoTIFF products needed by future samplers, such
  as Float32 slope degrees, separately from colorized display products.
- `README.md` — update the "Public GDAL image" section and elevation description.
- `CLAUDE.md` — update the elevation flow description (no more GDAL container).

### Delete (after cutover verified)

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

## 7. Testing Strategy

1. **Golden-value parity tests.** Before removing the Python service, capture its output for a
   representative set of paths against a known mission DEM (single point, short traverse, long
   traverse, out-of-bounds point, NoData point). Assert the Node implementation returns the same
   values (allowing a tiny epsilon only if interpolation rounding differs; aim for exact pixel
   match).
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

## 8. Rollout / Cutover

1. Land the Node implementation **behind the existing route** but keep the GDAL container
   available (do not delete yet).
2. Add a temporary env/config switch (e.g. `ELEVATION_ENGINE=node|gdal`) so we can flip back
   instantly if a parity issue appears in a real environment.
3. In preview/staging, optionally shadow a bounded sample of requests: return GDAL results while
   also running Node and logging pixel/value differences. This catches real-data mismatches more
   reliably than exercising each engine separately.
4. Verify tiled, striped, COG, and non-COG GeoTIFFs used by existing missions. Include single
   points, traverses, NoData edges, station elevations, and the measurement tool.
5. Flip default to `node`; monitor duration, block/sample counts, event-loop delay, decoder
   failures, and parity logs.
6. After a bake-in period, remove the GDAL container, the Python service, the switch, and the
   unused types (§6 "Delete").

---

## 9. Risks & Open Questions

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
  what path, then align the route's base path constant accordingly (§5.1).
- **Untrusted workload/path input.** Resolve registered resources server-side, enforce path
  containment, and cap points/window area before raster work begins.
- **Build compatibility.** Test geotiff.js filesystem reads and any worker `Pool` from the built
  esbuild artifact, not only from Vitest/source execution.

---

## 10. Estimated Effort

| Task                                                   | Rough size |
| ------------------------------------------------------ | ---------- |
| Generic raster sampler + metadata/cache lifecycle      | M          |
| Elevation wrapper (transform, interpolation, sentinel) | M          |
| Route rewrite + wrapping                               | S          |
| Event-loop/CPU instrumentation (§3.7) + optional pool  | S          |
| Request validation + resource/path containment         | S          |
| Analytical slope GeoTIFF pipeline output               | S–M        |
| Docker/compose/env cleanup                             | S          |
| Golden parity + tiled/striped fixture tests            | M          |
| Cutover switch + docs update                           | S          |

_Recommend implementing behind a switch, proving parity with golden tests, then deleting the
container and Python service in a follow-up._

```

```
