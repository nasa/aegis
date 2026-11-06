# Whole-Moon LGRS in the Browser — Implementation Plan

Status: proposed · Reference library: `lgrs` **0.4.0** (tag `v0.4.0`, commit
`1f11a12ac20e4f4aab89805535319252a2abd2eb`) · Standard: USGS TM 11-E1 (2025), "M2025"

## 1. Goal and scope

Extend AEGIS's TypeScript LGRS implementation from the south polar cap to the whole Moon.
The implementation must stay fast enough for per-`pointermove` work (mouse-rollover readouts)
and per-frame dynamic grid rebuilds.

The work covers:

- Conversion from lat/lon to LGRS and ACC, and between projected coordinates and LGRS/ACC, for
  all three systems: **LPS South**, **LPS North**, and **LTM** (45 zones × N/S hemispheres).
- Display strings everywhere the app shows grid coordinates: mouse readout, station, POI,
  action and lander panes, and exports.
- Dynamic LGRS grid lines and labels on any lunar mission projection, including grids that span
  zone, hemisphere and LPS/LTM seams.
- Grid-north bearings outside the south polar cap.

**Out of scope:** the legacy GIS data conversion pipeline LGRS generator
(`GIS_data_conversion_pipeline/.../grid/generate_lgrs.py`, `convert_lgrs.py`) and the
`server-file` grid mode. Neither changes. The Python `lgrs` package is used only as an offline
**test oracle** that generates fixtures for the TS port. It never ships to the browser.

## 2. Current state

| File                                                           | Role                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/lgrs/southLps.ts`                                   | Closed-form south polar stereographic forward. `getSouthLpsDisplayCoordinate`.                                                            |
| `src/utils/lgrs/dynamicGrid.ts`                                | South LPS → LGRS/ACC labels. `createDynamicLgrsRenderPlan`. `isCanonicalSouthLpsMission`. Linear `mapCapToLps` / `lpsToMapCap`.           |
| `src/utils/mapping/geoMath.ts`                                 | `getGridCoordinatesFromPoint` (always south LPS when `usingLGRSCoordinates`). `getSegmentBearing`.                                        |
| `src/utils/surf-nav/surfNavWrapper.ts`                         | LPS grid-north bearing through `latlong_to_lps`.                                                                                          |
| `components/interface/map/behaviors/Grid.tsx`                  | Draws the dynamic grid. Only works when the map CRS **is** canonical south stereographic, so grid lines are straight two-vertex segments. |
| `components/interface/map/overlays/MouseCoordinateDisplay.tsx` | Calls `getGridCoordinatesFromPoint` and does two `setState` calls on every `pointermove`.                                                 |
| `pages/admin/mission.tsx`                                      | Disables "Dynamic LGRS" unless `isCanonicalSouthLpsMission`.                                                                              |
| `src/tests/vitest/utils/lgrs.test.ts` + `fixtures/lgrs/0.3.0/` | Parity tests against a corpus of about 6,000 south-LPS cases.                                                                             |

Limitations this plan fixes:

1. Every point with `lat > -80°` returns `null`: no readout, no pane coordinate, no export value.
2. `getSegmentBearing(..., usingLGRS=true)` returns **0** whenever either endpoint is outside south
   LPS, because `latlong_to_lps` returns `null`. An equatorial mission with LGRS enabled therefore
   reports every bearing as 0°.
3. The `"full"` display format assumes a 3-character prefix (`acc.slice(0, 3)`). LTM prefixes are
   4–5 characters, for example `23NFF` and `4NAA`.
4. Dynamic grid rendering assumes map coordinates are an affine transform of LPS coordinates.
5. LGRS types (`LpsCoordinate`, `SouthLpsLabel`, …) are **exported** from `dynamicGrid.ts`. That
   breaks the repo's ambient-types convention; they belong in `src/typings/`.

## 3. lgrs 0.4.0 assessment

### 3.1 What I verified

I verified against `lgrs==0.4.0` installed from PyPI in an isolated venv:

| Check                                                                            | Result                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Committed 0.3.0 south projection corpus (3,010 lat/lon → LPS/LGRS/ACC cases)     | **0 mismatches**                                             |
| Committed 0.3.0 south box-label corpus (3,129 LPS → LGRS/ACC cases)              | **0 mismatches**                                             |
| Closed-form spherical TM vs lgrs/pyproj LTM, 3,000 random points, `\|lat\| < 80` | worst difference **1.1 × 10⁻⁷ m**; zone number always agrees |
| Closed-form N/S polar stereographic vs lgrs/pyproj, 2,000 random points          | worst difference **2.3 × 10⁻¹⁰ m**                           |
| LTM box-centre label vs direct point label (1,500 random points, 10/100/1000 m)  | **0 disagreements**                                          |

Conclusions:

- 0.4.0 does not change the south-pole behaviour the current port depends on. The upgrade is
  safe, and the 0.3.0 fixtures can be retired once the 0.4.0 corpus (a superset) lands.
- Neither projection needs PROJ. Both are closed-form on the IAU 2015 sphere (R = 1,737,400 m).
  A pure-TS port can match the oracle to sub-micrometre accuracy.

### 3.2 Relevant 0.4.0 changes

- Standards-compliant WKT. For example, the south CRS is now named
  `Moon (2015) - Sphere / Ocentric / LPS South`. This matters only if we ever emit WKT.
- Corrected latitude bounds in `lgrs.coords` and zone-boundary nudging in `lgrs.bounds`. The
  corpus must cover boundaries densely (§8).
- `MalformedCoordinate` is renamed `CoordinateError` (now a `ValueError` subclass). Exception
  types are normalised. The oracle script must catch the new names.
- New `lgrs.js` module, a Pyodide bridge with `convert_coordinate` and `make_box_grid`.
- Coordinate truncation is plain `floor`. The tolerance rounding in `_smart_truncate` is disabled.
- The package is still "Pre-Alpha" ("nothing is guaranteed until 1.0"). Pin it exactly and
  regenerate the corpus on every upgrade.

### 3.3 Decision: port to TypeScript, don't run lgrs via Pyodide

`lgrs.js` runs the Python library inside Pyodide. It doesn't fit this use case:

- It needs a multi-megabyte runtime download plus a Python start-up on first use.
- Each Python call costs hundreds of microseconds to milliseconds, and JS proxies leak unless the
  caller asks for `target="json"`.
- It depends on `pyproj`, `rasterio` and `geopandas`.

A measured prototype of the TS hot path (lat/lon → zone → closed-form TM/LPS → 10 m ACC string)
runs at **≈0.27 µs per point (≈3.7 M points/s)** on Node 24. That is three to four orders of
magnitude faster than Python lgrs, which takes ≈55 µs per point even with its internal caching.

## 4. LGRS rules to port (default constraints)

All constants come from `lgrs/srs/wkt.py` and `lgrs/coords.py` and follow M2025.

### 4.1 Region and CRS selection (`database._get_lunar_crs_internal_names`)

- Conform longitude to `[-180, 180)`. Latitude must be in `[-90, 90]`.
- Hemisphere is `N` if `lat >= 0`, otherwise `S`.
- `|lat| < 80` → **LTM**. `|lat| >= 80` → **LPS**. With `extended_ltm` the limit is 82. That is a
  non-default constraint, deferred (§10).
- LTM zone = `floor((lon + 180) / 8) + 1` (1–45). Central meridian = `(zone − 1)·8 − 176`.

### 4.2 Projections (sphere R = 1,737,400 m)

| System | k₀    | False E | False N               | Origin                        |
| ------ | ----- | ------- | --------------------- | ----------------------------- |
| LTM    | 0.999 | 250,000 | 0 (N) / 2,500,000 (S) | lat 0, lon = central meridian |
| LPS    | 0.994 | 500,000 | 500,000               | lat ±90, lon 0                |

- **LTM forward:** `B = cos φ · sin Δλ`, `E = k₀R·atanh(B) + FE`, `N = k₀R·atan2(tan φ, cos Δλ) + FN`.
- **LTM inverse:** `D = (N − FN)/(k₀R)`, `x = (E − FE)/(k₀R)`, `φ = asin(sin D / cosh x)`,
  `λ = λ₀ + atan2(sinh x, cos D)`.
- **LPS:** the existing south formula, plus its north mirror. North: `s = 2k₀/(1 + sin φ)`,
  `N = −R·s·cos φ·cos λ + FN`. South: `s = 2k₀/(1 − sin φ)`, `N = +R·s·cos φ·cos λ + FN`.
  `E = R·s·cos φ·sin λ + FE` in both.

### 4.3 LGRS strings

- **LPS** (`LpsPoint._to_lgrs`): band `A`/`B` (south, west/east of FE) or `Y`/`Z` (north). The
  25 km easting and northing area letters follow Eqs. 102–106. The existing south code already
  implements this. North reuses it with the band letters swapped.
- **LTM** (`LtmPoint._to_lgrs`):
  `zone` + latitude band + easting area + northing area + 5-digit E + 5-digit N, where:
  - Latitude band = `"C" + "CDEFGHJKLMNPQRSTUVWX" + "X"`, indexed by `floor(lat / 8) + 11`.
  - Easting area = `"ABCDEFGHJK"`, indexed by `floor(E / 25000) − 5`.
  - Northing area = letter set `(zone − 1) % 3` of `ABCDEFGHJKLMNPQRSTUV` / `FGHJKLMNPQRSTUVABCDE`
    / `LMNPQRSTUVABCDEFGHJK`, indexed by `floor(N / 25000) % 20`.
  - Digits = `floor(E mod 25000)` and `floor(N mod 25000)`, zero-padded to 5, then truncated to
    the precision: 25 km → 0 digits, 1 km → 2, 100 m → 3, 10 m → 4, 1 m → 5.
- **ACC** (both systems): the first two digits of each axis become a 1 km letter
  (`"-ABCDEFGHJKLMNPQRSTUVWXYZ"`, index 0–24) and the remaining digits stay. The prefix is
  band/zone + area letters, and `condensed` = string minus prefix.
- **Box semantics:** a label names the box whose grid-southwest corner is
  `floor(coord / precision) · precision`. Labels are computed at the box centre. That is the
  current south behaviour, and §3.1 shows it is equivalent for LTM.

Oracle-verified examples (10 m ACC):

| lat, lon        | System  | ACC           |
| --------------- | ------- | ------------- |
| 0, 0            | LTM 23N | `23NFF-00-00` |
| −0.0001, 0.0001 | LTM 23S | `23MFE-00Z99` |
| 45, 90          | LTM 34N | `34TGQS84N71` |
| −45, −90        | LTM 12S | `12GDRG15L28` |
| 79.9, 10        | LTM 24N | `24XFGK62V59` |
| 8, 4            | LTM 24N | `24PAVD91S92` |
| 0, −180         | LTM 1N  | `1NAAC72-00`  |
| 80, 10          | LPS N   | `ZCAB47B40`   |
| −80, 10         | LPS S   | `BCZB47X59`   |
| −89, −133       | LPS S   | `AZMB95D44`   |

## 5. Architecture

### 5.1 Module layout (`src/utils/lgrs/`)

| Module          | Responsibility                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `constants.ts`  | Projection parameters and letter tables, as plain strings indexed by integer. No `SURF_NAV_*` coupling.                              |
| `crs.ts`        | `LgrsCrsId` integer encoding and `classifyLatLon(lat, lon) → LgrsCrsId`. Zone geometry (central meridian, lon/lat limits).           |
| `projection.ts` | Forward and inverse for LPS N/S and LTM zone/hemisphere. Allocation-free variants that write into a caller-owned `Float64Array(2)`.  |
| `format.ts`     | Projected coordinate + CRS + precision → LGRS/ACC. A string-only fast path and a structured variant (prefix, condensed, lower-left). |
| `display.ts`    | `formatLgrsFromLatLon(point, precision, style)`. Replaces `getSouthLpsDisplayCoordinate`. Fixes the prefix split for `"full"`.       |
| `mapAdapter.ts` | Map CRS ↔ lat/lon and map CRS ↔ LGRS CRS adapters, with fast paths (§6.2).                                                           |
| `bearing.ts`    | Grid-north bearing in the origin point's LGRS CRS (§7).                                                                              |
| `grid/plan.ts`  | Whole-Moon dynamic render plan (§6.3). Replaces `createDynamicLgrsRenderPlan`.                                                       |
| `grid/clip.ts`  | Region membership, boundary bisection, adaptive densification.                                                                       |

`southLps.ts` and `dynamicGrid.ts` are deleted. Every caller is rewired to the new modules in the
same change, so no compatibility re-exports are needed. All shared types (`LgrsCrsId`, `LgrsPrecision`, `LgrsLabel`, `LgrsExtent`,
`LgrsRenderPlan`, …) move to a new ambient `src/typings/lgrs.d.ts`, as the repo's type
conventions require.

**CRS encoding:** use one small integer instead of strings on the hot path:
`0` = LPS S, `1` = LPS N, `2 + (zone − 1)·2 + (hemi === "S" ? 1 : 0)` = LTM. Strings like
`"23N"` are produced only when formatting.

### 5.2 Public API (sketch)

```ts
classifyLatLon(lat: number, lon: number): LgrsCrsId;               // −1 if invalid
projectLatLon(lat, lon, crs, out: Float64Array): boolean;           // out = [E, N]
unprojectToLatLon(e, n, crs, out: Float64Array): boolean;           // out = [lat, lon]
formatLgrs(e, n, crs, precision, kind: "lgrs" | "acc", lat?): string | null;
formatLgrsLabel(e, n, crs, precision): LgrsLabel | null;            // structured
formatLgrsFromLatLon(point: AEGISPoint, precision, style: LgrsDisplayStyle): string | null;
getLgrsGridBearing(origin: AEGISPoint, destination: AEGISPoint): number;
createLgrsRenderPlan(options: LgrsRenderOptions): LgrsRenderPlan;
```

`formatLgrs` takes the latitude it already knows for the LTM latitude band, so it avoids an
inverse projection on the hot path. The grid code supplies it from its inverse.

## 6. Performance design

### 6.1 Budgets and measurement

| Path                                        | Budget (Node, CI machine)    | How it's measured                 |
| ------------------------------------------- | ---------------------------- | --------------------------------- |
| lat/lon → 10 m display string               | ≤ 2 µs median                | `vitest bench` (not a CI gate)    |
| map coord → display string (incl. inverse)  | ≤ 5 µs median                | `vitest bench`                    |
| `createLgrsRenderPlan` for a 1920×1080 view | ≤ 4 ms p95, ≤ 2,000 vertices | bench plus a vitest cap assertion |

Benchmarks go in `src/tests/vitest/bench/lgrs.bench.ts`. Hard caps (vertex, line and label counts)
are enforced as normal unit tests, because those are deterministic.

### 6.2 Mouse-rollover path

1. **Map → lat/lon.** `toAegisPoint` currently calls `proj4(projCode, "EPSG:4326", coord)`, which
   resolves both definitions and builds a transformer on every call. `mapAdapter` builds the
   converter once per projection (`proj4(from, to)`) and caches it.
   It also adds **fast paths** that skip proj4 entirely:
   - The map CRS is canonical LPS S or N (`+proj=stere +lat_0=±90 +lon_0=0 +k=1 +x_0=0 +y_0=0`,
     Moon sphere). LPS is then an affine transform of the map coordinate (scale k₀, offset
     500,000). This generalises today's `mapCapToLps`.
   - The map CRS is a TM whose `lon_0` matches an LTM central meridian. Map coordinates are then
     affine to that zone's LTM inside the zone, and we fall back to the general path outside it.
2. **Classify and project:** a couple of comparisons and about six transcendental calls.
3. **Format:** precomputed tables and template strings. No regex and no `padStart` chains in the
   hot path (use a small integer-to-5-digit routine).
4. **React:** `MouseCoordinateDisplay` coalesces `pointermove` with `requestAnimationFrame` and
   calls `setState` only when the formatted lat/lon or grid string actually changes. At 10 m
   precision most pointer moves don't change the string. All per-mission inputs (projection
   adapter, precision, style) are resolved once in a memoised object rather than per event.

### 6.3 Dynamic grid render plan

Each `Grid` rebuild runs on an animation frame while panning, so the plan must be bounded.

1. **View → regions.** Sample the view extent's boundary (and a coarse interior lattice) in map
   CRS. Convert the samples to lat/lon, then determine:
   - the visible lat/lon envelope, handling the antimeridian and a pole inside the view;
   - the set of visible regions: LPS S, LPS N, and each LTM `(zone, hemisphere)` cell (8° × 0–80°).
2. **Tier selection** (by visible ground area and number of visible regions):
   - **Zone tier**, when zoomed far out (spacing would exceed 25 km, or more than about 12 regions
     are visible). Draw only the LGRS zone framework: zone meridians every 8°, latitude-band
     parallels every 8°, the ±80° LPS/LTM seam, and the equator. Label each zone/band cell
     (`23N`, `34T`, …) and each polar band (`A`, `B`, `Y`, `Z`). This is the LGRS analogue of
     MGRS grid-zone designators.
   - **Box tier:** grid lines per region, at standard spacings of 25 km / 1 km / 100 m / 10 m (or
     the user's fixed spacing). This reuses today's auto heuristic (≈100 line cells, ≈25 labels),
     evaluated on the ground area of each region's visible part.
3. **Per region, box tier.**
   - Project that region's visible boundary samples into the region CRS to get an E/N bbox.
   - Emit constant-E and constant-N lines at the chosen spacing.
   - **Clip to the region** along each line:
     - LPS: the existing circle clip, mirrored for north.
     - LTM: `zone(lon) == zone`, `|lat| < 80`, and the correct hemisphere. Membership is
       evaluated on parametric samples, and boundary crossings are refined by bisection to
       sub-pixel accuracy.
   - **Densify into map CRS.** When the map CRS is affine to the region CRS, lines stay
     two-vertex segments (today's behaviour). Otherwise subdivide adaptively until the midpoint
     deviation is under 0.5 px, with a recursion depth cap.
   - **Labels** at line intersections, at label spacing. Each label is the box whose
     grid-southwest corner is the node, computed at the box centre. Precision is derived from
     spacing as today.
4. **Seams.**
   - **Equator:** south FN = 2,500,000 is a multiple of 25,000, so LTM lines and 25 km northing
     letters line up across the equator. Labels switch hemisphere (band `N`/`M`).
   - **Zone meridians:** adjacent zones' lines don't align. Lines terminate at the meridian, and
     the meridian itself is drawn as a framework line.
   - **±80°:** LTM lines terminate at the parallel, and LPS lines clip to the LPS circle.
   - Optionally, framework (seam) lines get a heavier stroke via `mapGridControl.style`.
5. **Caps:** hard limits on total vertices, lines and labels. If a cap would be exceeded, fall
   back to the next coarser spacing. Spacing never silently produces a partial grid.
6. **Dashboard ↔ minimap.** Publish the spacing used for the region at the view centre. The
   minimap applies `coarsenForMinimap` per region, as today.
7. **OL efficiency.** Cache `Style` objects for labels by text, and the line style per render.
   Avoid recreating identical label styles every frame (today every label gets a new `Style`).

## 7. Bearings

`getSegmentBearing(..., usingLGRSCoordinates=true)` becomes the planar bearing between the two
points projected into the **origin's** LGRS CRS. This is the usual UTM practice for segments that
cross a zone seam.

- LPS: identical to today (surf-nav `range_bearing_from_xy` on LPS coordinates). South-pole
  results don't change, and existing tests pin that.
- LTM: the same planar formula on LTM coordinates. This equals true azimuth minus the meridian
  convergence `γ = atan(tan Δλ · sin φ)`.
- If either point is invalid, the function returns `null` or `NaN` with a defined UI fallback,
  not a silent 0.

This changes the bearings shown for missions that are **outside** the south cap and have
`usingLGRSCoordinates` enabled. Today those bearings are 0. List it in the MR as an intentional
behaviour change. Maestro type files (`aegisSlice.d.ts`, `mdau.d.ts`) are not touched.

## 8. Reference oracle and corpus

Because the GIS pipeline is legacy, the oracle moves out of it.

- Create a new standalone tool, `scripts/lgrs-reference/`, with its own `pyproject.toml` +
  `uv.lock` pinning `lgrs==0.4.0` and Python ≥ 3.13. A uv venv installs on Windows from PyPI
  wheels with no GDAL. Run it as `uv run --project scripts/lgrs-reference generate`, with an npm
  alias `npm run lgrs:reference-corpus`.
- Port the useful parts of the existing generator, then remove `generate_lgrs_reference_corpus.py`
  and the `lgrs-reference-corpus` pixi task from the legacy pipeline. The pipeline's own
  `lgrs==0.3.0` pin stays untouched.
- Output goes to `src/tests/vitest/fixtures/lgrs/0.4.0/`, with `metadata.json` recording version,
  tag, commit, seed and counts.

Corpus contents (deterministic, seeded):

| File              | Contents                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projection.json` | lat/lon → CRS id, E, N (to 1e-9 m), plus the inverse round-trip. Global seeded sampling (area-weighted), with oversampling near seams.                                                                                                                                                                                                                                                                        |
| `labels.json`     | Projected coord + CRS → LGRS + ACC (string, prefix, condensed, lower-left) at 25 km, 1 km, 100 m, 10 m and 1 m.                                                                                                                                                                                                                                                                                               |
| `boundaries.json` | Readable edge cases at ±1 mm and exactly on the line: each zone meridian, each 8° band parallel, the equator, ±80°, the antimeridian (−180 / 179.999…), the poles, longitude conformation (182 → −178), and the extreme easting areas (`A`, `K`) at the equator. Includes every 25 km boundary in E/N for sample zones of each of the three northing letter sets, plus the existing south-LPS readable cases. |
| `bearings.json`   | Grid bearings from oracle-projected coordinates, for the LPS and LTM cases in §7.                                                                                                                                                                                                                                                                                                                             |

Viewport render plans are **not** generated by re-implementing AEGIS's spacing heuristic in Python,
as the 0.3.0 generator does. That only tests TS against a Python copy of itself. Grid tests instead
assert properties against the oracle data:

- every emitted label equals the oracle label at its node;
- every densified vertex lies on its claimed constant-E/N line, within tolerance;
- clipped endpoints lie on the region boundary;
- counts respect the caps.

Upgrade procedure for future lgrs versions: bump the pin, regenerate into a new versioned fixture
folder, review the diff, and switch the tests over.

## 9. Delivery

The work ships as **one MR**. Inside it, each workstream below is its own commit, so reviewers
can read the MR commit by commit. The full suite (`npm run test:all`) has to pass only on the
final commit.

No Automerge or database migration is needed: `usingLGRSCoordinates` and
`gridRenderMode: "dynamic-lgrs"` already exist.

### 9.1 Execution order

The workstreams are grouped into waves by dependency. Workstreams in the same wave own disjoint
files, so each one can run as a separate sub-agent in the shared working tree.

**Wave 1 — foundations (parallel)**

- **A. Oracle and corpus.** Add `scripts/lgrs-reference/` and the `lgrs:reference-corpus` npm
  alias. Generate `fixtures/lgrs/0.4.0/` (§8). Remove `generate_lgrs_reference_corpus.py` and its
  pixi task from the legacy pipeline.
  _Owns:_ `scripts/lgrs-reference/**`, `fixtures/lgrs/0.4.0/**`, the legacy generator files.
- **B. Core library.** Add `src/typings/lgrs.d.ts`, `constants.ts`, `crs.ts`, `projection.ts`,
  `format.ts` and `mapAdapter.ts`, using the §5.2 signatures as the contract. Until A lands,
  validate against the §4.3 example table. Add `lgrs.bench.ts`.
  _Owns:_ those files and their unit tests.

_Gate 1 (lead):_ run B against the full 0.4.0 corpus and against the 0.3.0 south fixtures. Both
must show 0 mismatches before Wave 2 starts. This proves the south results are unchanged. Also
check the §6.1 per-point bench budgets.

**Wave 2 — consumers (parallel, all built on the B API)**

- **C. Display wiring.** Add `display.ts` and fix the `"full"` prefix split. Rewire
  `getGridCoordinatesFromPoint`, the station/POI/action/lander panes, `export.ts` and
  `MouseCoordinateDisplay` (rAF plus change-only `setState`, §6.2). Extend `export.test.ts` with
  LTM and north LPS cases.
  _Owns:_ `geoMath.ts`, the panes, `export.ts`, `MouseCoordinateDisplay.tsx`.
- **D. Bearings.** Add `bearing.ts` and rewire the surf-nav bridge. Add the bearings corpus tests.
  D does **not** edit `geoMath.ts`. The lead switches `getSegmentBearing` to `getLgrsGridBearing`
  at integration, along with the invalid-point UI fallback (§7).
  _Owns:_ `bearing.ts`, `surfNavWrapper.ts`.
- **E. Whole-Moon grid.** Add `grid/plan.ts` and `grid/clip.ts`. Update `Grid.tsx` and the
  `map-menu` base spacing, and keep minimap mirroring working. Add the property tests (§8) and the
  `Grid.browser.test.tsx` cases: a Mercator (Apollo 14-like) mission, a north-pole mission and a
  zone-seam viewport. E is the critical path. It needs visual iteration in the running app, not
  only tests.
  _Owns:_ `grid/**`, `Grid.tsx`, `map-menu`.

**Wave 3 — integration (lead, serial)**

1. Rewire `getSegmentBearing` (from D) and resolve any merge conflicts between workstreams.
2. Replace `isCanonicalSouthLpsMission` with `getLgrsCompatibility(mission)` (Moon sphere radius
   plus a proj4-parseable projection) and update the admin text.
3. Delete `southLps.ts`, `dynamicGrid.ts`, the 0.3.0 fixtures and the old `lgrs.test.ts` cases
   they covered. Confirm nothing still imports them.
4. Update `src/components/interface/map/CLAUDE.md` §3/§12.
5. Add the Playwright scenario: an equatorial mission with dynamic LGRS, checking the mouse
   readout and that the grid renders.
6. Run `npm run test:all`, the Playwright suite and the benches. Do a manual check in the running
   app with a south-pole, north-pole and equatorial mission.

### 9.2 Done when

- 0 corpus mismatches across every 0.4.0 fixture file, and 0 against the 0.3.0 south fixtures
  (Gate 1) before those fixtures are deleted.
- The metadata pins `v0.4.0` / `1f11a12a`.
- South bearings are bit-identical, and the LTM bearing corpus passes.
- Readouts, panes and exports show correct strings for LTM and north LPS points, including the
  `"full"` format.
- The grid property tests and browser tests pass, the caps hold, and the §6.1 budgets are met.
- No imports of `southLps.ts` / `dynamicGrid.ts` remain, and no LGRS types are exported.
- `npm run test:all` and the new Playwright scenario pass.

## 10. Risks and open questions

- **Non-default constraints** (`extended_ltm`, `prefer_lps`, `prefer_ltm`, `preferred_ltm_zone`).
  These change which CRS owns a point near seams. Supporting them needs a new mission field (and
  an Automerge migration) plus a port of `Constraints._test_forced_lgrs_box`. **Proposed:** defer
  them, and ship default M2025 partitioning. Decide whether any planned mission needs them.
- **Planet radius gate:** LGRS is defined on R = 1,737,400 m. Should missions with a slightly
  different `planetRadius` be allowed LGRS (lat/lon are still valid), or stay gated on exact
  equality as today?
- **lgrs is pre-1.0:** it says outputs may change between releases. The versioned corpus and
  diff review contain this risk.
- **Seams in the mouse readout:** the label jumps CRS when the cursor crosses a zone or the ±80°
  seam. That is correct per M2025, but users may expect a cue, such as showing the zone/band
  prefix in the readout.
- **Map projections with singularities** (Mercator near the poles, the antimeridian in
  equirectangular). View sampling must drop non-finite proj4 results and split the envelope at
  ±180°.
- **Label density across seams:** neighbouring regions may choose different auto spacings in one
  view. The plan uses the view-centre region's spacing for all box-tier regions in a frame, so
  density stays visually uniform.
