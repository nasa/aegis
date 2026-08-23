# Plan: Derive Terrain Slope from the Mission DEM at Runtime

## 1. Goal

Replace the planned runtime sampling of `Data/slope_degrees_uint16_cog.tif` with terrain-slope
values calculated from neighboring cells in the mission DEM. Elevation and terrain slope should
be produced by one server-side profile job so path interpolation, coordinate transforms, raster
block reads, worker scheduling, and network traffic are shared.

This removes the need to generate, publish, configure, and keep a second analytical raster in sync
with the DEM.

## 2. Terminology and product behavior

AEGIS needs to keep two slope concepts distinct:

| Value                 | Meaning                                                                                       | Source                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Along-track grade** | Signed uphill or downhill grade in the direction of travel                                    | Existing regression over the sampled elevation profile in `src/utils/paper.ts` |
| **Terrain slope**     | Unsigned magnitude of the local two-dimensional DEM gradient, independent of travel direction | New server-side calculation from a DEM-cell neighborhood                       |

The existing `calculateWindowedPathSlopes` calculation must remain. It answers how steeply the
route climbs or descends. Terrain slope answers how steep the ground is at the route position,
including cross-slope. A route following a contour can therefore have near-zero along-track grade
while crossing steep terrain.

Use **terrain slope** in new internal names and user-facing labels wherever possible. Avoid the
ambiguous term **absolute slope** except when preserving an existing external contract.

## 3. Current state

### 3.1 Elevation profile flow

The current flow is:

```text
Traverse or measurement path
  -> POST /api/v1/elevation
  -> validate against authorized mission metadata
  -> resolve mission.demFilePath inside missionFiles/<id>/Data
  -> bounded raster worker pool
  -> great-circle path densification
  -> geographic-to-DEM pixel transform
  -> block-deduplicated GeoTIFF reads
  -> segmented elevation arrays
  -> browser elevation graph and along-track slope regression
```

Relevant modules include:

- `src/server/express/routes/elevation.ts`
- `src/server/elevation/readElevationProfile.ts`
- `src/server/raster/sampleRasterProfile.ts`
- `src/server/raster/sampleRasterPoints.ts`
- `src/server/raster/rasterSamplingWorkerPool.ts`
- `src/server/raster/rasterSamplingWorker.ts`
- `src/utils/paper.ts`

The sampler already groups pixels by the TIFF's native tile or strip and reads each required block
once per request. CPU-heavy interpolation, projection, decompression, and extraction run in a
persistent worker thread. These are the right foundations for runtime terrain slope.

### 3.2 Pipeline slope product

The conversion pipeline can currently create `Data/slope_degrees_uint16_cog.tif` with
`products/dem_to_slope_value_cog.py`. GDAL computes slope in degrees, including edge values, and
the pipeline stores it as UInt16 with:

- scale: `0.01` degrees;
- offset: `0`;
- NoData: `65535`;
- 512 x 512 Deflate-compressed COG blocks.

The application does not currently have an absolute-slope endpoint, persisted terrain-slope
profile, or mission `absoluteSlopeFilePath` field on this branch. The pipeline artifact is
therefore planned infrastructure rather than an application contract that must be migrated in
place.

## 4. Decision

Calculate terrain slope from the selected mission DEM at request time and return it with the
existing elevation profile.

Do not add `absoluteSlopeFilePath` or a second slope-raster endpoint. Retain the pipeline COG step
only as a temporary validation oracle while the runtime implementation is compared with GDAL.
After acceptance, remove the slope-value COG from the default pipeline and delete the obsolete
step and documentation.

## 5. Proposed architecture

```text
Path + segment distances
        |
        v
Combined terrain-profile request
        |
        v
Raster worker: interpolate path once
        |
        v
Transform sample locations to DEM pixels once
        |
        v
Read unique DEM blocks plus one-cell neighborhood halo
        |
        +-----------------------------+
        |                             |
        v                             v
Elevation at path cell        3 x 3 terrain gradient
        |                             |
        +-------------+---------------+
                      v
       Segmented elevation and terrain-slope arrays
                      |
          +-----------+-----------+
          |                       |
          v                       v
Elevation graph and signed   Unsigned terrain-slope
along-track grade            band and hover value
```

The preferred API response is a combined profile rather than two independent requests:

```ts
type TerrainProfile = {
  elevationsMeters: (number | null)[][];
  terrainSlopesDegrees: (number | null)[][];
};
```

Use `null` for missing values in the new contract. Do not expose the legacy elevation sentinel
`-1100101` as a finite graph value. If changing the elevation response contract in the same change
would be too disruptive, initially preserve the sentinel for `elevationsMeters` at the endpoint
boundary while using `null` for terrain slope, then migrate elevation separately.

Keep segment boundaries and sample counts identical between both arrays. This lets the frontend
place both profiles at the same cumulative distances without another interpolation scheme.

### 5.1 Persisted profile fields and backward compatibility

Store terrain slope as a second segmented array beside the existing elevation array. Do not
replace `pathSegmentElevations` with an array of compound elevation/slope objects: changing that
established field shape would require rewriting every old mission document and every existing
consumer.

Use these persisted fields:

```ts
interface Traverse {
  pathSegmentElevations: number[][] | null;
  pathSegmentAbsoluteSlopes?: (number | null)[][] | null;
}
```

Although the product terminology is **terrain slope**, retain **absolute slope** in these field
names because the persisted value is the unsigned slope magnitude and that name clearly
distinguishes it from the signed along-track slope derived in the browser. Include the `Degrees`
suffix instead if the team wants units encoded in persisted field names, but choose one convention
before implementation and apply it everywhere. This plan uses `pathSegmentAbsoluteSlopes` and
that convention below.

The slope element type includes `null` because an elevation can be valid at a raster edge or next
to a NoData cell while its 3 x 3 gradient cannot be calculated. The outer `null` has a different
meaning: no complete slope profile is currently available for the path.

The fields are optional at the TypeScript boundary because existing Automerge mission documents
do not contain them. Runtime code must normalize both a missing field and an explicit outer
`null` to “not calculated”:

```ts
const absoluteSlopes = traverse.pathSegmentAbsoluteSlopes ?? null;
```

Do not run a bulk recomputation merely to add the key to old missions. New traverses must
initialize the field to `null`; the legacy database-to-Automerge conversion must also write
`null`; existing Automerge traverses may remain structurally missing until their path is next
recalculated. Never write `undefined` into an Automerge document.

The three segmented arrays form one profile revision:

- `pathSegmentDistances.length === path.length - 1`;
- elevation and absolute-slope outer arrays have one entry per path segment;
- corresponding elevation and absolute-slope inner arrays have the same sample count; and
- each absolute-slope value describes the same sample position as the elevation at that index.

Whenever a path changes, update path, distances, elevations, and absolute slopes in the same
Automerge `.change()`. If profile generation fails, do not retain absolute slopes from the old
geometry. Set both derived profile fields to `null`, unless the product explicitly adopts
partial-success behavior; under partial success, persist each successful profile and set only the
failed profile to `null`. Whichever policy is selected must be shared by every update path.

Measurements are Redux-only and not part of backward-compatible mission persistence, but should
use the parallel transient field `pathSegmentAbsoluteSlopes: (number | null)[][] | null` so the
same rendering helpers work for measurements and stored traverses.

Station walkback grade and walkback absolute slope are explicitly out of scope. There is no graph
location for either value in the current product. Do not add a walkback absolute-slope field to
`Station`, request DEM-neighborhood slope for walkbacks, or add walkback slope graph/hover state.
Existing walkback path, distance, and elevation behavior remains unchanged.

### 5.2 Timeline and Measure graph presentation

Both bottom-of-page Paper.js graphs must display the persisted absolute-slope profile in addition
to the existing elevation-derived path-grade band. Prior work on the slope graph branch provides a
useful implementation pattern:

- `src/utils/paper.ts` builds distance-aligned elevation samples and calculates signed path grade;
- `src/utils/paperSlope.ts` draws the shared classified color/pattern band;
- `src/components/interface/measure/measure.tsx` and `measure-drawing.tsx` reserve and draw the
  Measure band;
- `src/components/interface/timeline/timeline-init.ts` and `timeline-drawing.ts` build and draw
  the per-traverse timeline band; and
- `measure-hover.tsx` and `timeline-hover.tsx` display the hovered slope value.

Preserve that path-grade functionality and add a **second, separately identified 10 px band** for
absolute terrain slope. The order must be consistent in both graphs:

```text
Elevation / distance graph
Path Grade band       (signed value, magnitude controls color)
Terrain Slope band    (unsigned stored absolute-slope value)
Segment bearings and distance labels, where present
```

Do not replace the path-grade band with absolute slope. The two values answer different questions
and should remain visible together.

#### Shared graph-data conversion

Add a helper beside `buildDistanceElevationProfile` that converts segmented absolute slopes and
segment distances into physical-distance samples. It must:

1. preserve the original segment/sample alignment;
2. use the same cumulative-distance placement as elevation;
3. remove duplicated shared endpoints in the same way;
4. retain missing samples as gaps rather than converting them to zero; and
5. reject or return no data for a profile that fails the shape checks in section 5.1.

The existing `drawSlopeBand` uses `slopeDegrees ?? 0`, which would display unavailable terrain as
safe 0-degree terrain and can bridge a gap between valid samples. Refactor it so each graph datum
can explicitly be unavailable and draw a colored interval only when the samples needed for that
interval are valid. Keep missing intervals transparent or render a documented unavailable style;
do not silently interpolate across NoData.

Use the same degree thresholds, color ramp, and accessibility patterns for path grade and terrain
slope so a given magnitude has one visual meaning. Define bin boundaries as data rather than
relying on `Math.floor(value / 2)`, and test exact boundaries such as 2, 4, and 20 degrees. The
renderer may continue using `Math.abs(pathGradeDegrees)` for the path-grade color while hover text
retains the sign.

Add a compact shared legend near the bottom graphs. It must:

- identify **Path Grade** and **Terrain Slope** as the two band rows;
- explain that color represents absolute degrees of slope;
- show the degree ranges, including the highest open-ended class;
- include the dot/hatch patterns, not color alone; and
- use the same palette and threshold source as `drawSlopeBand` so the legend cannot drift.

#### Measure tool graph

Update the Measure Paper.js model and drawing lifecycle:

1. Add a dedicated terrain-slope group, graph-data array, `terrainSlopeTop`, and
   `terrainSlopeHeight` to the Measure Paper types. Rename generic existing slope members to
   path-grade names where practical.
2. Reserve space for two bands when calculating `graphHeight` and the graph bottom. Extend the
   graph background, border, segment-divider lines, hover cursor, bearing labels, distance labels,
   and arrows to use the new bottom coordinate.
3. Continue deriving path-grade graph data from `pathSegmentElevations` with
   `calculateWindowedPathSlopes`.
4. Build terrain-slope graph data from `measurement.pathSegmentAbsoluteSlopes` and
   `pathSegmentDistances`; draw it in the second band with the shared renderer.
5. Redraw both bands when the selected measurement, its profile data, or the Paper.js viewport
   changes.
6. Extend Measure hover state with separate nullable values such as `pathGradeDegrees` and
   `terrainSlopeDegrees`. Display both with one decimal place and an em dash or `N/A` when terrain
   slope is unavailable.
7. Keep the existing map-highlight percentage tied to the hovered distance; the second band must
   not create a separate map-hover calculation.

Measurements should still render elevation and path grade if absolute slope has not returned or
cannot be calculated. The terrain-slope row remains empty/unavailable without collapsing the graph
layout while a request is pending, preventing labels and hover targets from jumping.

#### Timeline graph

Update the timeline Paper.js model and sequence drawing:

1. Carry `segmentedAbsoluteSlopeDegrees` on the traverse `Path_PaperJS` view model only.
   `common-timeline.ts` should normalize a missing persisted traverse field to `null` when it
   builds these view models. Do not populate or render slope values for station walkbacks.
2. Replace the single generic `slopeXY` member on `GraphSequenceData` with distinct
   `pathGradeXY` and `terrainSlopeXY` arrays.
3. Continue generating `pathGradeXY` from traverse elevations. Generate `terrainSlopeXY` from the
   stored absolute-slope samples and map physical distance into the traverse's rounded timeline
   duration width using the same start/end X coordinates as path grade.
4. Draw two stacked 10 px bands inside each traverse's bottom sequence block. Keep station blocks
   unchanged. If neither profile is available, retain the existing dashed traverse fallback; if
   only one profile is available, draw that row and show the other as unavailable without
   mislabeling it.
5. Preserve the selected-traverse outline around the complete two-row band area rather than only
   one row.
6. Extend the timeline hover result with separate nullable `pathGradeDegrees` and
   `terrainSlopeDegrees` values. Interpolate each from its own graph data at the same hovered X and
   display both with explicit labels.

No visibility toggle is required for the first implementation: both compact bands should be
shown whenever data exists. If graph height becomes constrained, add one shared Path Grade /
Terrain Slope visibility control used by both rendering and hover logic rather than hiding a band
only visually.

#### Paper.js and UI test coverage

In addition to data-flow tests, add focused coverage for:

- two-band ordering, dimensions, and graph-bottom label offsets in both views;
- path-grade sign retention while color uses magnitude;
- absolute-slope rendering from stored samples without recalculation from the path;
- missing profiles and internal `null` gaps;
- exact class boundaries and values above 20 degrees;
- legend labels, ranges, colors, and pattern mapping;
- Measure and timeline hover interpolation and unavailable text;
- station versus traverse timeline behavior;
- selected-traverse outline dimensions; and
- redraw behavior after an asynchronous terrain profile arrives.

The earlier graph work did not include dedicated rendering or screenshot coverage for the second
band or legend. Add browser/component tests around the Paper.js setup where practical and keep
pure distance conversion, threshold selection, and hover interpolation covered by unit tests.

## 6. Terrain-slope algorithm

### 6.1 Initial algorithm

Use a Horn 3 x 3 gradient, which uses all eight neighboring cells and closely matches conventional
GIS slope processing. For elevations arranged as:

```text
z1 z2 z3
z4 z5 z6
z7 z8 z9
```

calculate:

$$
\frac{\partial z}{\partial x}
=
\frac{(z_3 + 2z_6 + z_9) - (z_1 + 2z_4 + z_7)}{8\Delta x}
$$

$$
\frac{\partial z}{\partial y}
=
\frac{(z_7 + 2z_8 + z_9) - (z_1 + 2z_2 + z_3)}{8\Delta y}
$$

$$
\theta_{terrain}
=
\operatorname{atan}\left(
\sqrt{
\left(\frac{\partial z}{\partial x}\right)^2+
\left(\frac{\partial z}{\partial y}\right)^2
}
\right)\frac{180}{\pi}
$$

Use the absolute X and Y pixel resolutions independently; do not assume square cells. Apply the
DEM band's scale and offset before calculating derivatives if those metadata values are present.
The implementation must verify that vertical values and projected horizontal units are metres or
apply an explicit conversion factor.

### 6.2 Sampling convention

For the first implementation, calculate the neighborhood around the same containing pixel used by
the elevation sampler. This keeps elevation and terrain slope spatially aligned with existing
behavior.

Do not silently introduce bilinear interpolation in this change. Bilinear elevation sampling and
interpolating a derived slope field have different semantics and should be evaluated separately.

### 6.3 Edges and NoData

Define behavior explicitly:

1. When the center point is outside the raster, elevation and terrain slope are `null`.
2. When the center cell is NoData, elevation and terrain slope are `null`.
3. When any neighbor required by the Horn kernel is unavailable or NoData, terrain slope is
   `null` in the initial implementation.
4. Elevation remains valid when the center cell is valid even if terrain slope is `null`.
5. Raster-border samples return valid elevation but `null` terrain slope until a tested one-sided
   edge algorithm is deliberately added.

This initial policy is simpler and safer than inventing values around holes. It differs from the
pipeline's current `computeEdges=True` behavior at borders, so border differences must be recorded
in validation results. If mission operations require border slope, add an explicit one-sided or
GDAL-compatible edge policy after the core algorithm is verified.

### 6.4 Projection scale

The raster CRS requires projected linear units in metres, but a polar stereographic projection can
have a location-dependent map scale. The initial implementation may use the embedded pixel sizes,
matching normal projected-raster slope processing, provided the expected error over the mission
area is measured and documented.

If the error is operationally significant, derive a local projection scale factor at each sample
or calculate horizontal neighbor distances in the lunar geographic CRS. Do not add this complexity
without comparison data.

## 7. Server implementation plan

### Phase 1: Add neighborhood-capable raster sampling

1. Extend `RasterMetadata` in `src/server/raster/types.ts` and
   `src/server/raster/rasterReader.ts` with the selected band's scale and offset metadata.
2. Refactor pixel transformation and block lookup so one profile operation can request both center
   cells and neighboring cells without repeating path interpolation or projection.
3. Add a neighborhood sampling primitive that:
   - accepts transformed center pixels;
   - expands each center to its 3 x 3 kernel;
   - deduplicates pixel coordinates;
   - groups all pixels by native raster block;
   - reads each unique block once, including blocks crossed by a kernel at tile boundaries; and
   - reconstructs each center's ordered neighborhood.
4. Preserve `MAX_RASTER_SAMPLES` and `MAX_RASTER_BLOCKS`, but define whether limits count profile
   centers, unique neighbor pixels, or both. Validate both counts before allocating large arrays.
5. Keep ordinary tiled, striped, and COG GeoTIFF support. Do not make COG layout mandatory.

Prefer extending the existing block sampler over issuing nine `readRasters` calls per profile
point. Per-point reads would repeatedly decode the same blocks and defeat the expected performance
benefit.

### Phase 2: Add a combined worker job

1. Add a terrain-profile function under `src/server/terrain/` that returns segmented elevation and
   terrain-slope arrays plus raster metrics.
2. Densify the path once using `sampleRasterProfile`'s existing interpolation semantics or a
   shared extracted helper.
3. Transform each interpolated point once and calculate both outputs from the resulting center
   pixels and neighborhoods.
4. Extend the worker request/response to a discriminated job union, for example
   `type: "raster-profile" | "terrain-profile"`, rather than duplicating worker-pool machinery.
5. Return useful instrumentation:
   - center samples;
   - unique DEM pixels;
   - blocks read;
   - queue duration;
   - worker execution duration; and
   - total route duration.
6. Preserve queue bounds, timeout behavior, worker replacement, and graceful shutdown.

### Phase 3: Expose the combined API contract

Two compatible routing choices are acceptable:

- evolve `/api/v1/elevation` to return a named combined object; or
- add `/api/v1/terrain-profile` and migrate callers before retiring the old elevation-only route.

Prefer the second choice if compatibility with deployed clients matters. In either case:

1. Resolve only the authorized mission's `demFilePath` server-side.
2. Keep path-containment and GeoTIFF-extension checks.
3. Validate coordinates, segment distances, resolution, sample limits, and block limits before
   queueing work.
4. Calculate the profile sample count once. Correct the current spacing semantics so a segment of
   length $d$ sampled no farther apart than resolution $r$ uses:

   $$
   N = \left\lceil\frac{d}{r}\right\rceil + 1
   $$

   where $N$ includes both endpoints. Treat this as a behavior change and update golden tests.

5. Prefer deriving sampling spacing from inspected DEM metadata. If `mission.demResolution` is
   retained temporarily, validate it against the raster's native resolution.
6. Return normal `WrappedResponse<T>` errors, with worker saturation and timeout represented as
   HTTP 503 as they are today.

### Phase 4: Update frontend data flow

1. Add a typed HTTP client and thunk for the combined terrain profile.
2. Update every path recalculation flow, not only direct traverse editing:
   - traverse creation and geometry updates;
   - station movement and adjacent traverses;
   - lander movement and adjacent traverses; and
   - measurement creation and editing.
3. Add the parallel fields defined in section 5.1:
   - optional `pathSegmentAbsoluteSlopes` on `Traverse`;
   - required `pathSegmentAbsoluteSlopes` on the transient `Measurement` type.
4. Add matching stage fields:
   - `newPathSegmentAbsoluteSlopes` on `TraverseUpdateStageData`.
5. Update `apply*`, `stage*`, defaults, duplication, legacy database conversion, seeder data, and
   test fixtures together. Preserve the rule that one logical operation produces one Automerge
   change. Generic deep-copy duplication should carry a populated slope profile unchanged, while
   older source entities with no field must remain valid.
6. Ensure old mission documents without absolute-slope arrays load normally. Treat a missing field
   as `null` and compute it when the path is next refreshed; do not require an eager document-wide
   migration or block mission loading.
7. Add a shared profile-shape validator. If a persisted slope profile does not align with the
   current path, distances, and elevation profile, treat it as unavailable rather than rendering
   misregistered values.
8. Keep `calculateWindowedPathSlopes` for signed along-track grade. Feed the returned terrain
   profile to a separate graph-data builder; do not reuse or overwrite the along-track values.
9. Implement the complete two-band Timeline and Measure presentation in section 5.2, including
   graph layout, missing-data behavior, hover values, and a shared legend.
10. Label graph bands and hover values clearly as **Path Grade** and **Terrain Slope**.

### Phase 5: Control live-edit workload

The current map interaction can start elevation work approximately every 100 ms while geometry is
being dragged. A one-worker pool cannot usefully finish every obsolete intermediate profile.
Before enabling the larger neighborhood job:

1. Add request identity or cancellation so stale responses cannot overwrite newer geometry.
2. Coalesce queued profile jobs for the same edited entity, retaining only the newest request.
3. During drag, choose one of:
   - update distance and bearings only, then fetch a full profile on `modifyend`;
   - request a deliberately coarse preview profile; or
   - debounce profile work at a substantially longer interval.
4. Always fetch the final full-resolution profile on `modifyend`.

The first option is the preferred initial behavior because it is simple, deterministic, and avoids
wasted decompression while preserving immediate geometry feedback.

## 8. Performance expectations and acceptance gate

A 3 x 3 calculation performs more extraction and arithmetic than center-cell elevation sampling,
but neighboring pixels usually occupy blocks already needed for the traverse. The expected cost is
therefore dominated by the number of unique TIFF blocks decoded, not nine times the existing cost.
A combined operation also removes the duplicated interpolation, projection, worker queue entry,
HTTP request, and second raster open/read that a separate slope COG would require.

Do not retire the generated slope COG based only on this expectation. Add a benchmark using:

- short, typical, and long mission-50 traverses;
- paths aligned with and diagonal to raster blocks;
- paths crossing block boundaries;
- concurrent requests at realistic editing load; and
- both tiled and striped test rasters.

Record for the existing elevation-only path and the combined path:

- p50 and p95 wall time;
- worker execution and queue time;
- unique blocks read and bytes decoded where measurable;
- peak worker memory;
- response size; and
- API event-loop delay under concurrency.

Acceptance criteria:

1. A typical combined profile completes within the interactive latency budget agreed for traverse
   editing.
2. p95 API event-loop delay is unchanged because computation remains in workers.
3. Worker memory stays bounded under the maximum accepted profile.
4. Queue behavior remains stable under repeated edits after coalescing or final-only sampling.
5. Results meet the numerical comparison tolerances in the next section.

If the combined implementation fails these criteria, retain the precomputed slope COG as a
fallback. Optimization options include reducing preview density, caching decoded neighborhoods,
or precomputing slope only for unusually large DEMs.

## 9. Verification strategy

### 9.1 Unit tests

Add tests for:

- Horn slope on flat, constant-X-grade, constant-Y-grade, and diagonal planes;
- rectangular pixels with different X and Y resolutions;
- negative Y raster resolution;
- DEM scale and offset;
- center-cell NoData;
- individual neighbor NoData;
- raster edges;
- neighborhoods crossing tile and strip boundaries;
- duplicate centers sharing one decoded neighborhood;
- sample and block limit enforcement; and
- segmented output shape and shared endpoints.

For a plane $z=ax+by+c$, the expected terrain slope is:

$$
\theta = \operatorname{atan}\left(\sqrt{a^2+b^2}\right)
$$

Use this analytical result for deterministic tests rather than values copied from the
implementation.

### 9.2 GDAL comparison

Keep `slope_degrees_uint16_cog.tif` temporarily as an oracle. For representative mission-50 paths:

1. Sample the existing GDAL-generated slope COG.
2. Calculate runtime terrain slope from the source DEM at the same center pixels.
3. Compare interior cells separately from edges and NoData boundaries.
4. Report mean, p95, and maximum absolute error in degrees.
5. Investigate systematic differences caused by kernel choice, pixel-center convention, scale,
   edge handling, or projection scale.

Set the operational tolerance with the GIS/domain owner. The slope COG stores values to 0.01
degrees, but that storage precision should not be mistaken for DEM-derived accuracy.

### 9.3 Integration and UI tests

Add coverage for:

- authorization and trusted mission DEM resolution;
- malformed combined-profile requests;
- worker timeout and saturation;
- missing DEM and unsupported metadata;
- partial terrain-slope nulls with valid elevation;
- all traverse and measurement update paths, including adjacent traverses changed by station or
  lander movement;
- old Automerge documents without terrain-slope fields;
- two-band Timeline and Measure rendering, legends, and hover labels for both slope concepts; and
- stale live-edit responses not replacing the final profile.

After each implementation batch, format changed files and run `npm run test:all`. Local full-suite
validation requires `MAESTRO_PAIR_ENV_URL=https://maestro-beta.fit.nasa.gov` because unrelated
Maestro v2 tests require that configuration.

## 10. Pipeline cleanup after acceptance

Once runtime results and performance pass the acceptance gate:

1. Remove `slope-float-cog` from the pipeline's default step selection.
2. Remove `products/dem_to_slope_value_cog.py` and its configuration constants if no external
   workflow uses them.
3. Remove generation summaries, CLI options, stale-file cleanup, and README references.
4. Stop publishing `Data/slope_degrees_uint16_cog.tif` for new missions.
5. Do not immediately delete existing mission files; they can be removed during normal data
   republishing after application rollback risk has passed.
6. Document that the mission DEM is the single source for elevation, along-track grade, and
   terrain slope.

## 11. Risks and mitigations

| Risk                                        | Mitigation                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Runtime values differ from GDAL             | Use the same Horn kernel, compare against the temporary COG, and document edge-policy differences                        |
| DEM noise creates unstable cell-scale slope | Retain Horn smoothing; consider an explicitly configured larger physical baseline only after validation                  |
| Neighborhood reads increase latency         | Deduplicate pixels and blocks, combine elevation and slope, keep work in the existing pool, and benchmark before cleanup |
| Rapid edits fill the worker queue           | Compute final profiles on `modifyend` and coalesce or cancel obsolete requests                                           |
| NoData holes produce misleading values      | Return `null` unless the full initial kernel is valid; never substitute zero slope                                       |
| Projection distortion biases gradients      | Measure mission-area scale error and add local correction only if operationally significant                              |
| Old documents lack new arrays               | Make fields optional/default-null and populate them on the next path refresh                                             |
| Scientific meaning remains ambiguous        | Show and name along-track grade and terrain slope separately                                                             |

## 12. Definition of done

- Elevation and terrain slope come from one mission DEM and one worker job.
- Runtime terrain slope passes the agreed comparison against the GDAL product for valid interior
  cells.
- Along-track grade remains available and signed.
- Timeline and Measure graphs display separate, labeled Path Grade and Terrain Slope bands with a
  shared degree/pattern legend and explicit unavailable states.
- Every path mutation flow refreshes both elevation and terrain slope atomically.
- Live editing cannot accumulate obsolete full-resolution raster jobs or apply stale responses.
- Missing and NoData values cannot appear as finite elevations or zero terrain slopes.
- Performance and memory meet the agreed benchmark thresholds.
- The slope-value COG is no longer generated by default or required in mission configuration.
- Tests, documentation, and pipeline behavior reflect the DEM as the single analytical source.
