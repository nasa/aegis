# Earth Grid with Lunar ACC Labels — Implementation Plan

Status: proposed (revision 4) · Builds on: whole-Moon LGRS (`docs/lgrs-whole-moon-plan.md`,
branch `feat-lgrs2`) · Basis: WGS84 UTM/UPS and MGRS (NGA), USGS terrestrial LGRS training grids
([doi:10.5066/P14KSANW](https://doi.org/10.5066/P14KSANW))

## 1. Goal and scope

Earth analog missions (JSC, Texas field sites, Iceland, Arizona, …) currently get grid
coordinates by uploading pregenerated JSON grid files (`gridRenderMode: "server-file"`). Replace
that with a dynamic, worldwide Earth grid that crews read **in the same coordinate language they
use on the Moon**, with a switch to canonical MGRS.

AEGIS missions cover at most a few tens of km around a landing site. The plan is sized for that:
it uses the standard UTM zones as they are and handles zone boundaries the way MGRS does, with no
custom extensions. UPS is included anyway so that the grid covers the whole Earth, and so that the
polar-cap handling it shares with lunar LPS stays body-neutral for a later body such as Mars
(§4.1).

The work covers:

- Whole-Earth coordinates on WGS84: UTM zones 1–60 (80° S ≤ lat < 84° N) and UPS at both poles.
- Two label schemes on the same grid, switchable per mission and per user (§5):
  - **ACC** (default for training): MGRS 100 km square + a 25 km sub-area, then the lunar ACC
    1 km letters and digits (`X51 W77`).
  - **MGRS**: canonical MGRS (`15R TN 9751 7177`).
- Mouse readout, station/POI/action/lander panes, exports, dynamic grid lines and labels, and
  grid-north bearings for Earth missions, all driven by the mission's explicit grid system.

**Out of scope:** removing the `server-file` grid mode (existing missions keep working, and an
admin switches each Earth mission to the dynamic grid). Spherical distance and area calculations
that use `planetRadius` don't change. Lunar LGRS behaviour doesn't change.

**Deferred** (not needed for sites of this size; each can be added later without changing the
design):

| Item                          | Why it can wait                                                                                   | Revisit when                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Pinning a mission to one zone | A site tens of km across rarely straddles a zone boundary, and the grid still works there (§3.5). | A real site sits on a zone boundary. |
| Grid at continental zoom      | At zone-tier zoom the Earth grid is hidden. Missions are viewed at site scale.                    | Users ask for a zone overview.       |

## 2. Background

### 2.1 What the USGS release does

The USGS terrestrial training grids cover a handful of clipped sites: Yucca Flat (11N), Buffalo
Park, Cinder Lake, JETT3, JETT5 and Meteor Crater (12N), HAATS (13N), JSC (15N) and the JETT2
Icelandic Highlands (28N). They use WGS84 UTM coordinates, put a 1 km grid inside the LGRS 25 km
grid, and truncate to 10 m in ACC form. The 6-character coordinate is relative to the lower-left
corner of the 25 km area, and the zone is left off unless it's needed. The release does **not**
define a worldwide naming scheme for the 25 km areas. This plan defines one, which makes the ACC
labels an **AEGIS-defined** terrestrial system rather than a published standard.

The ScienceBase metadata could not be retrieved while writing this plan. Gate 0 (§9) checks the
actual shapefiles before anything is built.

### 2.2 Why the lunar letter tables can't be reused

The part crews speak (`X51 W77`) depends only on position inside a 25 km area. It carries over
unchanged. The **prefix** that names the 25 km area does not:

|                                 | Moon (LTM, R = 1,737.4 km) | Earth (UTM, WGS84)                              |
| ------------------------------- | -------------------------- | ----------------------------------------------- |
| Zone width at the equator       | ≈ 243 km → 10 columns      | ≈ 668 km → **28 columns**                       |
| Easting area letters available  | 10 (`ABCDEFGHJK`)          | 24 letters max (A–Z without I, O)               |
| 8° latitude band height         | ≈ 243 km                   | ≈ 890 km                                        |
| 20-letter northing cycle period | 500 km (> band)            | 500 km (**<** band, so labels repeat in a band) |

With the lunar tables, two different 25 km areas in the same zone and band would get the same
label. MGRS's 100 km square ID is already unique within a zone and band, and 100 km is exactly
4 × 25 km. The UTM false easting (500,000) and false northings (0 / 10,000,000) and the UPS
2,000,000 m offsets are all multiples of 25 km, so the 25 km areas line up with MGRS squares
everywhere.

## 3. Coordinate system definition

### 3.1 Region and projection

- **Datum:** WGS84. AEGIS lat/lon for Earth missions are treated as WGS84 geodetic coordinates,
  which is what GPS and EPSG:3857 maps already assume.
- **UTM:** zones 1–60, 6° wide, `k₀ = 0.9996`, FE 500,000, FN 0 (N) / 10,000,000 (S), for
  80° S ≤ lat < 84° N. MGRS latitude bands C–X are 8° each, except X, which is 12° (72–84° N).
- **UPS:** polar stereographic on WGS84, `k₀ = 0.994`, FE = FN = 2,000,000, for lat ≥ 84° N and
  lat < 80° S. Bands `A`/`B` (south) and `Y`/`Z` (north), split at FE, the same band letters
  LPS uses on the Moon.
- **Zone exceptions:** the Norway (31V/32V) and Svalbard (31X/33X/35X/37X) exceptions are part
  of zone classification, so canonical MGRS is correct at Norwegian and Svalbard analog sites.
  Renderer clipping uses the same classifier (§4.4), so it follows them without extra geometry.
- **Hemisphere:** N iff lat ≥ 0, matching the lunar classifier.
- **Projection implementation:** cached proj4 converters (proj4js `etmerc` for UTM, ellipsoidal
  `stere` for UPS), wrapped behind the system's `Float64Array` out-parameter API. Cached proj4 measured 0.29 µs forward and
  0.25 µs inverse for UTM, and 0.17 µs for EPSG:3857 → lat/lon (Node, warm). That leaves ample
  room in the §6 budgets. A closed-form port happens only if the end-to-end benches miss budget.

### 3.2 ACC labels

```
<zone><band><100 km col><100 km row><25 km E sub><25 km N sub>  <E 1 km letter><digits> <N 1 km letter><digits>
```

- **100 km square ID:** WGS84 MGRS lettering ("AA" scheme). Column letter sets cycle with
  `(zone − 1) % 3`, and the row letters of even zones are offset by 5. UPS uses the MGRS polar
  letter tables, and its prefix starts with the band letter instead of a zone number
  (`<A|B|Y|Z><col><row><E sub><N sub>`), as LPS does on the Moon.
- **25 km sub-area:** `ABCD`, indexed by `floor((E mod 100000) / 25000)` and
  `floor((N mod 100000) / 25000)`. The easting letter comes first, mirroring the lunar
  easting-area/northing-area order.
- **Within the 25 km area:** exactly the lunar ACC rules. The 1 km letter
  `"-ABCDEFGHJKLMNPQRSTUVWXYZ"` is indexed by `floor((v mod 25000) / 1000)`, and the remaining
  digits are truncated (`floor`) to the precision.
- **Display styles** match the lunar ones: `"condensed"` = `X51 W77`, `"full"` =
  `15RTNDC X51 W77`.
- **Uniqueness:** the full reference is unique worldwide. The condensed form repeats every 25 km,
  so stored and exported values use the full form.

### 3.3 Canonical MGRS

`formatCanonicalMgrs(lat, lon, precision)` converts from geographic coordinates in the point's
UTM zone (with the exceptions) or UPS cap, and it is the only code that produces MGRS strings. Digits are
**truncated**, not rounded (NGA convention). At the 10 m display precision: `15R TN 9751 7177`.

ACC and MGRS share the classifier, the projection and the 100 km square ID, so for any point they
always name the same zone, band and 100 km square.

### 3.4 Worked examples

Computed with proj4 2.22 and checked by hand (and reproduced independently in review). The oracle
corpus (§8) supersedes these.

| Site (lat, lon)                   | UTM | E, N (m)                 | MGRS (10 m)        | ACC (full)        |
| --------------------------------- | --- | ------------------------ | ------------------ | ----------------- |
| JSC (29.5593, −95.0900)           | 15N | 297,516.44, 3,271,776.23 | `15R TN 9751 7177` | `15RTNDC X51 W77` |
| Big Bend, TX (29.25, −103.25)     | 13N | 670,052.04, 3,236,953.18 | `13R FN 7005 3695` | `13RFNCB V05 L95` |
| Iceland highlands (64.80, −17.00) | 28N | 404,994.40, 7,187,665.84 | `28W DS 0499 8766` | `28WDSAD D99 M66` |
| Antimeridian (0.0001, −179.9999)  | 1N  | 166,032.59, 11.07        | `1N AA 6603 0001`  | `1NAACA R03 -01`  |

UPS examples are generated by the oracle (§8.4) rather than worked by hand.

### 3.5 Zone and band boundaries

Zone boundaries are 6° apart (≈ 580 km at 30° N, ≈ 290 km at 64° N), so a site tens of km
across seldom crosses one. JSC, for example, is about 88 km east of the 14/15 boundary. Where a
site does cross one, the grid behaves like MGRS and like lunar LTM:

- Grid lines end at the zone boundary, which is drawn as a seam line. The neighbouring zone's
  lines start there, and they don't line up.
- Readouts, labels and grid north switch to the new zone at the boundary.

A **band** boundary (e.g. 64° N through Iceland) changes only the band letter in the full
prefix. The grid lines, digits, condensed ACC and grid north are continuous across it.

## 4. Architecture

### 4.1 Grid-system abstraction

Today `crs.ts`, `projection.ts`, `format.ts`, `mapAdapter.ts`, `grid/plan.ts`, `grid/clip.ts`,
`bearing.ts` and `compatibility.ts` read lunar constants and lunar CRS helpers directly. Introduce
an ambient `LgrsGridSystem` interface, and route all CRS-dependent behaviour through it:

```ts
interface LgrsGridSystem {
  /** Cache key: system id plus configuration, e.g. `moon-m2025` or `earth-wgs84/mgrs`. */
  readonly key: string;
  readonly scheme: GridLabelScheme;
  isValidCrs(crs: LgrsCrsId): boolean;
  /** Point semantics: the CRS that owns this point, or invalid. */
  classifyLatLon(lat: number, lon: number): LgrsCrsId;
  projectLatLon(lat: number, lon: number, crs: LgrsCrsId, out: Float64Array): boolean;
  unprojectToLatLon(e: number, n: number, crs: LgrsCrsId, out: Float64Array): boolean;
  formatPoint(lat: number, lon: number, precision: number): LgrsLabel | null;
  formatBox(
    lowerLeftE: number,
    lowerLeftN: number,
    crs: LgrsCrsId,
    precision: number
  ): LgrsLabel | null;
  // Region geometry (§4.4)
  isInRegion(lat: number, lon: number, crs: LgrsCrsId): boolean;
  getRegionBounds(crs: LgrsCrsId, out: Float64Array): void;
  getSeams(envelope: LgrsViewEnvelope): LgrsFrameworkLines;
  getBoxSpacings(): readonly number[];
  /** Whether the zone tier (continental zoom) is drawn. Earth: false (§1). */
  readonly drawsZoneTier: boolean;
  /** Map CRS → grid CRS affine relation for a parsed map projection, if one exists. */
  getAffine(map: LgrsProj4Params, crs: LgrsCrsId): LgrsMapAffine | null;
  formatCrsName(crs: LgrsCrsId): string;
}
```

- **CRS ids are only meaningful with their system.** Earth ids follow the lunar pattern: `0` =
  UPS S, `1` = UPS N, `2 + (zone − 1)·2 + (S ? 1 : 0)` = UTM. The ids overlap with lunar ids,
  so no function may accept a bare `LgrsCrsId` without the system. There is no global
  `isValidCrs`. Lunar validation stops at zone 45, so Earth zones 46–60 would otherwise fail.
- **System instances:** `moonGridSystem` (`scheme: "lunar-acc"`), plus two cached Earth
  instances from `getEarthGridSystem(scheme)`, one each for `"lunar-acc"` and `"mgrs"`.
- Box spacings: ACC uses 25 km / 1 km / 100 m / 10 m (as on the Moon). MGRS uses
  100 km / 10 km / 1 km / 100 m / 10 m. The map-menu resolution choices follow the active system.
- **Shared polar-cap handling.** Lunar LPS and Earth UPS are both polar stereographic caps split
  into two bands at the false easting. The planner and clip code treat a cap as a generic region:
  a circle around the pole in projected coordinates, with radius from the system's projection of
  the cap's limiting latitude. The two systems keep their own projection code, so lunar results
  stay bit-identical. A future body such as Mars then supplies its projections, zone layout and
  label tables, and reuses the planner, clipping, densification and both region kinds (zones and
  caps) unchanged.

### 4.2 Module layout

| Module                                         | Change                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/typings/lgrs.d.ts`                        | `LgrsGridSystem`, `GridLabelScheme`, `MissionGridSystemId`, seam types.                |
| `src/utils/lgrs/moon/`                         | Today's lunar modules move here behind `moonGridSystem`. No behaviour change.          |
| `src/utils/lgrs/earth/constants.ts`            | WGS84, UTM and UPS parameters, MGRS letter tables (incl. polar), ACC sub-area letters. |
| `src/utils/lgrs/earth/zones.ts`                | Zone/band/cap classification with the Norway/Svalbard exceptions.                      |
| `src/utils/lgrs/earth/projection.ts`           | Cached proj4 UTM and UPS converters behind the `Float64Array` API.                     |
| `src/utils/lgrs/earth/mgrs.ts`                 | 100 km square IDs and `formatCanonicalMgrs`.                                           |
| `src/utils/lgrs/earth/acc.ts`                  | ACC point and box labels.                                                              |
| `src/utils/lgrs/earth/system.ts`               | `getEarthGridSystem(scheme)`.                                                          |
| `src/utils/lgrs/system.ts`                     | `getMissionGridSystem(mission, userSchemeOverride)` → `{ system, compatibility }`.     |
| `mapAdapter.ts`                                | Split into map projection and grid binding (§4.5).                                     |
| `grid/plan.ts`, `grid/clip.ts`                 | Take the system from `LgrsRenderOptions`. Lunar constants and helpers removed.         |
| `display.ts`, `bearing.ts`, `compatibility.ts` | Take a system instead of assuming the Moon.                                            |

### 4.3 Explicit grid system on the mission

Add `mission.gridSystem: "moon-m2025" | "earth-wgs84"`. Selection never infers WGS84 from the
radius at runtime. `isEarthScale` (`planetRadius > 4,000,000`) is a view-fitting heuristic and is
used only to **initialize or suggest** a value:

- The migration (§9, workstream D) sets `"earth-wgs84"` for Earth-scale missions and
  `"moon-m2025"` for all others. Every current mission is treated as lunar for LGRS readouts
  today, so this preserves existing behaviour.
- New missions and the admin page pre-select from the radius. Changing the radius suggests a
  value but never changes `gridSystem` by itself.

Compatibility:

- `moon-m2025`: today's checks unchanged (exact lunar radius plus a proj4-parseable projection),
  keeping workstream B behaviour-neutral.
- `earth-wgs84`: proj4-parseable projection. A radius that isn't Earth-scale shows an admin
  warning but doesn't block.

`usingLGRSCoordinates` and `gridRenderMode: "dynamic-lgrs"` keep their meaning: "show grid
coordinates" and "draw the dynamic grid". Only the admin labels change for Earth missions.

### 4.4 Region geometry

Readout classification and renderer geometry use the **same** classifier in `earth/zones.ts`, so
they can't disagree, including at the Norway and Svalbard exceptions:

- **Visible regions** come from classifying the view's boundary and interior samples, as the
  lunar planner already does. Exception zones are therefore found without special enumeration.
- **Clipping** uses `system.isInRegion` (that is, `classifyLatLon(...) === crs`) on parametric
  samples and bisects boundary crossings, as the lunar LTM clip does. UPS caps use the shared
  circle clip (§4.1).
- **Seam lines** at box-tier zoom are the zone boundaries, band parallels, and the 80° S / 84° N
  UTM/UPS seams inside the view, derived from the same classifier.
- **Zone tier:** Earth sets `drawsZoneTier: false`, so the grid is hidden at continental zoom.
- **Agreement property test:** for points sampled inside every rendered region,
  `system.classifyLatLon(point) === region`, including views on the 14/15 boundary in Texas,
  around Norway's 31V/32V exception, and across the 84° N UTM/UPS seam.

### 4.5 Map adapter

The current adapter calls lunar `projectLatLon`/`unprojectToLatLon` and `isValidCrs`, builds
LTM/LPS affine transforms from lunar constants, and caches by map projection alone. Split it:

- **`MapProjection`** (system-independent): map ↔ lat/lon, proj4 converters and the existing
  closed-form fast paths. Cached by map projection key, as today.
- **`GridBinding`** (map projection × grid system): `mapToGrid`/`gridToMap` validate the CRS with
  `system.isValidCrs` and use `system.getAffine` (lunar: today's LPS/LTM affine transforms;
  Earth: a UTM or UPS map CRS whose parameters match a grid CRS), otherwise falling back to the system's
  project/unproject through lat/lon. Cached by `projectionKey + system.key`.
- Every cache that holds system-dependent behaviour (bindings, label style caches in `Grid.tsx`,
  memoised readout formatters) includes `system.key`.

### 4.6 Caller wiring

Every caller currently assumes the lunar system through `formatLgrsFromLatLon`,
`getLgrsGridBearing` and `getLgrsCompatibility`. Each one gets the resolved system instead:

- `utils/mapping/geoMath.ts` — `getGridCoordinatesFromPoint` and `getSegmentBearing` take the
  resolved system instead of the `usingLGRSCoordinates` / `dynamicLgrs` booleans.
- `MouseCoordinateDisplay.tsx` — the memoised per-mission formatter is keyed by `system.key`.
- Station, POI, action and lander panes (`station-right-info`, `poi-right-info`,
  `actions-action-body`, `mission-right-prefs`).
- `utils/export.ts` — `gridCoordinates` uses the **mission default** scheme in the full form,
  never the per-user override. Where the export format has a header, it records the grid system
  and scheme.
- **MGRS export field:** on `earth-wgs84` missions, every exported item with a location (the
  types in `src/typings/network/export.d.ts`) also gets `mgrsCoordinates`, from
  `formatCanonicalMgrs` at 10 m. It is always present on Earth missions, whatever the scheme or
  grid settings, so the export layout doesn't depend on mission configuration. Lunar exports
  don't include it. It is an added field, so existing consumers that read `gridCoordinates` are
  unaffected.
- `Grid.tsx`, `map-menu.tsx`, `pages/admin/mission.tsx`.

Maestro and DUST payloads don't carry LGRS strings, so the Maestro type files aren't affected.
No grid string is persisted. Coordinates are always computed from lat/lon, so switching schemes
never touches stored data.

## 5. Label scheme toggle

Both schemes use the same zones, projection and grid north. The toggle changes only labels and
spacings:

| Scheme | Labels                | Spacings                             |
| ------ | --------------------- | ------------------------------------ |
| ACC    | ACC (§3.2)            | 25 km / 1 km / 100 m / 10 m          |
| MGRS   | Canonical MGRS (§3.3) | 100 km / 10 km / 1 km / 100 m / 10 m |

- Readouts, pane coordinates and grid labels switch. Bearings, zone seams, and the 1 km / 100 m /
  10 m grid lines are identical in both schemes.
- **Settings:** the mission default is `mission.earthGridLabelScheme: "lunar-acc" | "mgrs"`
  (admin page). Each user can override it from the map menu (Redux UI state, cookie-backed like
  other map preferences). The toggle is hidden on lunar missions.
- **Indicator:** readouts and the map menu always show the active scheme (`ACC` or `MGRS`), so a
  screenshot or call-out can't be misread.
- A training lock (hiding the override) is deferred until a training lead asks for it.

## 6. Performance

Same budgets as the lunar plan (§6.1 there), measured in `src/tests/vitest/bench/lgrs.bench.ts`
with Earth cases added:

| Path                                                  | Budget                       |
| ----------------------------------------------------- | ---------------------------- |
| lat/lon → 10 m display string (ACC or MGRS)           | ≤ 2 µs median                |
| map coord → display string (EPSG:3857)                | ≤ 5 µs median                |
| `createLgrsRenderPlan`, 1920×1080 view, either scheme | ≤ 4 ms p95, ≤ 2,000 vertices |

Projection uses cached proj4 converters first (§3.1). proj4 allocates a result array per call, so
the grid-plan bench is the one to watch. Lines in EPSG:3857 maps are curved, so they go through
the existing adaptive densification.

## 7. Bearings

Grid-north bearings use the **origin** point's UTM zone or UPS cap, the same rule as LTM/LPS on
the Moon. The bearing is `NaN` (rendered `—`, existing `formatBearingDegrees`) if either point is
invalid or can't be projected. Earth missions with `usingLGRSCoordinates` off keep true-north great-circle
azimuths. Missions that turn on the Earth grid switch to grid-north bearings, which goes in the
MR as an intentional behaviour change.

## 8. Numerical policy, oracle and corpus

### 8.1 Boundary ownership

All boundaries are half-open, and **no snapping** is applied. Snapping only moves the ambiguity
to the edge of the snap window, while `floor` of the computed value is deterministic.

- **Geographic** (exact on the input lat/lon, no tolerance): hemisphere N iff `lat ≥ 0`. UTM for
  `−80 ≤ lat < 84`, otherwise UPS. Zones and exception slices own
  `[west, east)` after conforming longitude to `[−180, 180)`. Bands own `[south, north)`, with
  X = `[72, 84)`.
- **Boxes** (projected): a box of size `p` owns `[k·p, (k+1)·p)` on each axis, so a value exactly
  on a grid line belongs to the box east or north of it.

### 8.2 Point readouts vs box labels

- **Point readouts** (mouse, panes, exports): the CRS comes from classifying the point, the band
  from the point's latitude, and the digits from `floor` of the point's projected E/N.
- **Box labels** (grid renderer): formatted from the region's CRS and the box's exact lower-left
  multiple `k·p`, with no projection of the corner. The band letter comes from the latitude of the
  box centre, unprojected in that CRS. A partial box at a zone edge is therefore labelled in the
  region being drawn, even when its centre lies outside that region.
- A readout inside a box that a band parallel splits can show a different band letter than the
  box label. That is expected, as in MGRS and lunar LTM, and the browser tests pin it.

### 8.3 Tolerances

Projection accuracy and string equality are tested separately:

| Check                               | Requirement                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection, proj4 vs pyproj         | `\|ΔE\|, \|ΔN\| ≤ 1 µm`; round trip ≤ 1 µm                                                                                                  |
| Classification from lat/lon         | Exact, including values exactly on zone, band, exception and UTM/UPS boundaries                                                             |
| Formatting from E/N (no projection) | Exact, including values exactly on box lines                                                                                                |
| End-to-end lat/lon → string         | Exact when the oracle E and N are ≥ 10 µm from every box boundary at that precision; closer cases must equal one of the two adjacent labels |

The corpus records each case's distance to the nearest box boundary, so the end-to-end filter is
explicit rather than a hidden tolerance. Readable "exactly on the line" cases are built in
projected coordinates and go through the E/N formatter path.

### 8.4 Oracle

Add an Earth generator to `scripts/lgrs-reference/` (new `earth` entry point, npm alias
`lgrs:reference-corpus-earth`), with fixtures in `src/tests/vitest/fixtures/lgrs-earth/v1/` and
a `metadata.json` that pins the pyproj and `mgrs` versions and the seed.

- **Projection:** pyproj with EPSG:326xx/327xx (UTM) and EPSG:32661/32761 (UPS), plus round
  trips.
- **100 km square IDs:** the PyPI `mgrs` package (GeoTrans-based), used only for the square ID.
  Digits are derived from the pyproj E/N with `floor`. The npm `mgrs` package **rounds** digits
  (confirmed in its source; in the Iceland example it gives `87666` for northing `…665.84`), so
  no `mgrs` package is trusted for digits until its truncation is confirmed.
- **ACC strings:** an independent Python implementation of §3.2 built on the pyproj E/N. This is
  the one place the oracle re-implements our rules, because no external reference exists.
- **Corpus contents:** seeded global sampling plus dense boundary cases at ±1 mm and exactly on
  the line: every zone meridian, every band parallel (including 72° N), the equator, the
  80° S / 84° N UTM/UPS seams, both poles, the UPS band split at FE, the antimeridian, every
  exception edge, and 25 km and 100 km boundaries in sample zones of all three column-letter sets
  and both row-offset parities, plus UPS squares in all four polar bands.
- **Grid tests** follow the lunar approach: property tests against oracle data (every label
  equals the oracle at its node, vertices lie on their lines, clipped ends lie on region
  boundaries, caps hold) plus the §4.4 agreement test. Render plans aren't regenerated in Python.

**USGS compatibility fixtures:** small extracts of the released JSC (15N) and JETT2 (28N) 1 km,
100 m and 10 m grids, for checking line positions and label attributes against ours (Gate 0).

## 9. Delivery

A separate MR, branched from `int` after the whole-Moon LGRS MR merges. Each workstream is its
own commit. `npm run test:all` must pass on the final commit.

**Gate 0 — confirm the USGS conventions (before any code).** Download the JSC and JETT2
shapefiles and record in this doc:

1. whether their 25 km and 1 km lines fall on UTM multiples of 25,000 m and 1,000 m;
2. their label attributes and how they name the 25 km areas;
3. whether the 1 km letter for km 0 is `-`, as in lunar ACC.

If the lines are anchored somewhere other than UTM multiples (e.g. a site origin), revisit §3.2
before continuing. "Matches the USGS sites" is the acceptance target, so this decides whether
it's achievable.

**Workstreams:**

- **A. Oracle and corpus** (§8). _Owns:_ `scripts/lgrs-reference/**`, `fixtures/lgrs-earth/**`.
- **B. Grid-system refactor, Moon only.** Introduce `LgrsGridSystem`, move the lunar modules
  behind `moonGridSystem`, split the map adapter (§4.5), turn the LPS circle clip into the shared
  polar-cap region (§4.1), and make `plan.ts`/`clip.ts` and every caller system-driven. **Zero
  behaviour change:** the 0.4.0 lunar corpus, grid golden/property
  tests and browser tests pass unmodified. This commit can be reviewed on its own and is the main
  risk-reduction step.
- **C. Earth core.** `earth/` modules: zone and cap classification, proj4-backed UTM/UPS
  projection, MGRS (including polar) and ACC formatters. Gated on 0 corpus mismatches under the §8.3 policy, and on the per-point budgets.
- **D. Mission settings.** **One Automerge migration** adding `gridSystem` (initialized from the
  radius, §4.3) and `earthGridLabelScheme` (default `"lunar-acc"`) to every mission, following
  the migration rules in the root `CLAUDE.md`. Admin page controls, the map-menu override, the
  scheme indicator, and the `mgrsCoordinates` export field with `export.test.ts` cases for Earth
  and lunar missions.
- **E. Earth grid rendering.** Box tiers per scheme, zone, band and UTM/UPS seams, UPS caps, box
  labels (§8.2), hidden zone tier, and minimap mirroring. Needs visual iteration in the running app.
- **F. End-to-end.** `Grid.browser.test.tsx` cases (an EPSG:3857 Texas view crossing the 14/15
  zone boundary in both schemes, an Iceland view crossing the V/W band boundary, and a polar
  stereographic view across the 84° N seam), a
  Playwright scenario for an Earth mission that switches schemes, benches, and updates to
  `src/components/interface/map/CLAUDE.md`.

### 9.1 Gate 0 findings

**Status: unresolved** (2026-11-06). The grid shapefiles couldn't be downloaded without a
browser, so questions 1 and 3 are still open, and question 2 is only partly answered. The
release's FGDC metadata (`Publication_Data_Release_LGRS4.xml`) was retrieved, and nothing in it
contradicts §3.2. §3.2 stands provisionally until the shapefiles are checked.

**What was tried.** The DOI resolves to ScienceBase item `6751db29d34e5c4500cf2c7b`. Its JSON
lists `JSC.zip` (198,914,577 B), `JETT2_Icelandic_Highlands.zip` (516,485,512 B), six other site
zips and the XML. The zips are S3-backed and unpublished (`published: false`):

| Route                                                         | Result                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| File `url` / `downloadUri` (`sciencebase.usgs.gov/manager/…`) | HTML file-manager app, no file                                            |
| `api.sciencebase.gov/graphql`, `file(cuid)` → `downloadUri`   | `UNAUTHENTICATED`: needs a Keycloak login                                 |
| Item page link (`catalog/item/managerRequestDownload/…`)      | reCAPTCHA page ("Before downloading, please complete the captcha")        |
| S3 object URL                                                 | 403                                                                       |
| "Download Attached Files" bulk zip (`catalog/file/get/<id>`)  | 6,849 B: only the XML; every site zip is a 0-byte entry                   |
| data.usgs.gov catalog entry                                   | Links back to the DOI only                                                |
| GitHub search for mirrors                                     | Only `rbeyer/lgrs` (vendored USGS **lunar** reference code, no UTM grids) |

**What the metadata establishes:**

| Question            | Finding                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Line positions   | **Open.** The lineage says only "written using standard UTM map projections to the specified grid spacing of LGRS", and the grids are "projected … based on their positions in LGRS and centered on a specific location for … display". That reads like an LGRS-anchored grid clipped around a site, but it doesn't say whether the 25 km origin is a UTM multiple.                    |
| 2. Attributes       | Features are **polygons, one per grid cell**, not lines. Fields: `ID`, `LGRS_ACC_E`, `LGRS_ACC_N` (strings), `centX`, `centY` (cell centre), `ULX`, `ULY`, `LRX`, `LRY` (corners, UTM metres). Only the JETT5 100 m table is documented. No field names the zone, band or 25 km area, so the release doesn't name 25 km areas (as §2.1 assumed). The metadata gives no example values. |
| 3. `-` for km 0     | **Open** for the terrestrial grids. The USGS lunar reference code (`LGRS_Coordinate_Conversion.py`) uses `'-ABCDEFGHJKLMNPQRSTUVWXYZ'  # "-" is a zero character`, and its ACC regex allows `[-A-Z]` for the 1 km letters.                                                                                                                                                             |
| 4. CRS              | "UTM Zone, ESPG [sic]: 326XX", WGS84 ellipsoid (6,378,137 m, 1/298.257223563), but the horizontal datum is given as `North_American_Datum_1983`. That's inconsistent, so the `.prj` files must settle it. NAD83 and WGS84 differ by about 1–2 m in the US, which matters for line positions but not for labels.                                                                        |
| 4. Spacings, digits | 1 km, 100 m and 10 m shapefiles per site (HAATS also has three clipped sets). Digits are truncated to 10 m ("truncating the grid precision to 10m"). Coordinates are relative to the lower-left corner of the 25 km area, and the zone is left off but "can be reported".                                                                                                              |
| 4. Other            | License CC0 1.0. The metadata bounding box (south 35.571°) leaves out JSC (29.56° N), so it is incomplete. Parts of the abstract are copied from the lunar release ("projected in the LTM or LPS PCRSs").                                                                                                                                                                              |

**Our side.** pyproj (EPSG:32601/32613/32615/32628) reproduces all four §3.4 rows exactly,
both E/N to 0.01 m and the ACC strings.

**Effect on the fixtures (§8.4).** The comparison is per cell, not per line: each cell's
`LGRS_ACC_E`/`LGRS_ACC_N` should equal the §3.2 axis labels of its lower-left corner
(`ULX`, `LRY`), at the cell's precision.

**To close Gate 0:** someone downloads `JSC.zip` and `JETT2_Icelandic_Highlands.zip` from the
item page in a browser (the captcha), then:

1. reads each `.prj`, the field list and a few records;
2. measures `max |v − round(v / s) · s|` over all vertices for the file's spacing `s`, and over
   vertices near 25 km lines for `s = 25,000`;
3. compares `LGRS_ACC_E`/`LGRS_ACC_N` with the §3.2 labels of each cell's lower-left corner;
4. adds the 2–3 km extracts to `src/tests/vitest/fixtures/lgrs-earth/usgs/`, and replaces this
   subsection's status with a verdict.

Workstream B is Moon-only and doesn't depend on these answers.

## 10. Done when

- Gate 0 findings are recorded, and the USGS JSC/JETT2 extracts match our lines and condensed
  labels (or each difference is explained and accepted).
- 0 corpus mismatches under the §8.3 policy.
- Lunar behaviour is bit-identical: the existing lunar corpus and grid tests pass unmodified.
- The §4.4 agreement test passes.
- Earth missions show correct readouts, pane coordinates, exports and grids in both schemes, the
  toggle switches them without reloading, and the indicator always matches the active scheme.
- Earth-mission exports carry `mgrsCoordinates` on every located item, and lunar exports don't.
- §6 budgets and caps hold. `npm run test:all` and the new Playwright scenario pass.

## 11. Decisions

| #   | Question                                                                    | Decision / proposal                                                                         |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Training lock on the scheme override?                                       | **Decided:** deferred until a training lead asks. Keep the default, override and indicator. |
| 2   | Zone pinning and the continental-zoom grid?                                 | **Decided:** deferred (§1). Missions cover at most tens of km.                              |
| 3   | UPS?                                                                        | **Decided:** included, for whole-Earth coverage and a body-neutral polar-cap path (§4.1).   |
| 4   | Full-form spacing: `15RTNDC X51 W77` (mirrors lunar) or `15RTN DC X51 W77`? | **Decided:** mirror lunar (`15RTNDC X51 W77`).                                              |
| 5   | Should exports add an MGRS column next to ACC?                              | **Decided:** yes, `mgrsCoordinates` on every Earth-mission export item (§4.6).              |

## 12. Risks

- **AEGIS-defined labels.** The 25 km naming is ours, not a USGS or NGA standard. Document it in
  the user-facing help and keep canonical MGRS one toggle away.
- **A site on a zone boundary.** Labels and grid north change across the boundary, as in MGRS.
  If a planned site needs one continuous grid across it, pinning (§1) is the follow-up.
- **Ellipsoid vs sphere.** Readouts and bearings are ellipsoidal UTM (scale within 1,000 ppm
  inside a zone), while AEGIS distances use `planetRadius` on a sphere. Measured and grid
  distances can differ by a few tenths of a percent. That is documented, not fixed here.
- **proj4 allocation** on the grid-plan hot path. Watched by the bench, and a closed-form port is
  the fallback.
