# Viewsheds — design & implementation plan

**Status:** Plan — not yet implemented
**Scope:** Add a `viewsheds` step to `esri-to-aegis-lunar-southpole` that computes line-of-sight
viewsheds from the mission DEM and emits them as **GeoJSON vector sublayers** that AEGIS can
recolour natively.
**Output format:** GeoJSON only. See §3 for why, and §3.3 for how size is kept in budget without a
tiled fallback.
**Reference data:** `F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260805\01_AEGIS\`
(external-team viewsheds for A03MP026 — Mons Mouton Plateau), used as ground truth.

---

## 1. What we are generating

A **viewshed** answers: from an observer at a given point and height, which surface cells are in
direct line of sight, accounting for terrain occlusion and lunar curvature? On the map it is drawn
as a **mask over the non-visible terrain** — the visible area is left untouched so the basemap,
slope, and traverses read normally underneath.

Every viewshed AEGIS has ever shipped follows that inverted-mask convention, and every one of them
is currently a **pre-colorized raster tile pyramid** — which is precisely the limitation this work
removes:

```
missionFiles/3/Layers/Tiles_Viewshed_2m,  Tiles_Viewshed_30m
missionFiles/4/Layers/Viewshed_Primary_2mHeight,   Viewshed_Primary_30mHeight
                     JETT5_Primary_15m_Viewshed_10kmExtent
missionFiles/5/Layers/Viewshed_Secondary_2mHeight, Viewshed_Secondary_30mHeight
missionFiles/9,12,13/Layers/LunarVR_20mViewshed, _40mViewshed, _60mViewshed
missionFiles/25/Layers/A03MM026_agdt_sfs-loladem_viewshed_54m_obs2m_1mpp_pink
                       A03MM026_AGDT_Viewshed_Inverted_Orange
```

Note the naming: `_54m_obs2m` (observer 54 m, target 2 m), `_Inverted_Orange`, `_pink`. The colour
is baked into the pixels, and the mission-25 `properties.json` is just
`{"type": "tile", "description": "Source imagery", "tilePattern": "{z}/{x}/{y}.png"}`.

---

## 2. What the external team delivered (ground truth)

Three representations of the same analysis, in `00_GIS_Files/`:

**Raster** — `01_Raster/A03MP026_SfS_1mpp_VIEWSHED_{BlueOrigin,SpaceX}.tif`

- `5448 × 5449` Byte, LZW, pixel size `1.0 m`, CRS `Moon_2015_-_Sphere_Ocentric_South_Polar`
  (stereographic, `lat_0=-90`, sphere `1737400 m`).
- Extent `94044 → 99492` E, `143464 → 148913` N; centre `(96768.0, 146188.5)`. The lander sits at
  `(96771.33, 146191.14)` — **the analysis window is a ~5.45 km square centred on the lander**,
  ±2724 m.
- Values `1 = Visible`, `2 = Non-Visible`. The ArcGIS lineage in the `.tif.xml` shows how:
  `Reclassify … Value "0 1 1;NODATA 2"` — the raw viewshed's NoData (out of sight) became class 2.

**Vector** — `00_Vector/00_Shapefiles/…_VIEWSHED_{BlueOrigin,SpaceX}_NONVISIBLE_POLY.shp`

- Only the **non-visible** class is polygonised. Attributes: `FID, Id, gridcode (=2), Shape_Leng,
  Shape_Area`.
- Blue Origin: 531 polygons, 12 626 vertices, **13.15 km²** non-visible (of the 29.7 km² box).
  SpaceX: 487 polygons, 11 045 vertices, **10.24 km²**.
- Median segment length ≈ **5.3 m** on a 1 mpp raster → generalised, not raw pixel boundaries.
  The metadata also lists a `A03MP026_SfS_5mpp_VIEWSHED` (1091 × 1090) — they ran a 5 mpp variant
  too, so a coarser analysis grid is an accepted practice on this data, not a corner cut.
- Delivered GeoJSON is 1.4 MB, but that is full double precision in projected metres. The same
  geometry at EPSG:4326 / 7 decimals is ≈ **300 KB**.
- The delivered GeoJSON has no `crs` member and coordinates in **projected metres** — not loadable
  by AEGIS as-is (vector sublayers are parsed as `dataProjection: "EPSG:4326"`).

**Symbology** — `01_Styles/A03MP026_SfS_1mpp_VIEWSHED_{BlueOrigin,SpaceX}.lyrx`

`CIMRasterUniqueValueColorizer` on `Value`:

| Value | Label       | Colour                                            |
| ----- | ----------- | ------------------------------------------------- |
| `1`   | Visible     | (per-lander hue) **alpha 0**                      |
| `2`   | Non-Visible | `rgb(255, 167, 127)` = `#FFA77F`, **alpha 50 %**  |

Both files agree. The per-lander "visible" hues are invisible noise — **the entire delivered
symbology is one fill colour at one opacity**, which AEGIS expresses natively and the user can
change in the layer panel.

---

## 3. Output format: GeoJSON

| Option                            | Size (MS3) | AEGIS recolour?     | Verdict |
| --------------------------------- | ---------- | ------------------- | ------- |
| PNG tile pyramid (cap grid)       | ~MBs       | ❌ CSS filters only | What we do today; the problem being solved. |
| COG                               | ~360 KB    | ❌ CSS filters only | Smallest, but a 1/2-valued Byte band renders near-black under `WebGLTile`; RGBA bakes the colour in. |
| **GeoJSON (`Data/*.geojson`)**    | **~300 KB** | ✅ full            | **Chosen.** |
| PMTiles                           | ~MBs       | ✅ full             | Dropped — the size ceiling GeoJSON has is reachable with the knobs in §3.3, and PMTiles costs a shared-tiling refactor. |

Only `vector` and `vector-tile` sublayers get real recolouring: `buildVectorStyleFn`
([layerFactory.ts:331](../../../src/components/interface/map/utils/layers/layerFactory.ts#L331))
reads `style.fillColor` / `fillOpacity` / `color` / `weight` / `isDashed` per sublayer. Raster
sublayers go through `buildCSSFilter` and can only be dimmed or hue-rotated. GeoJSON also reuses
the pipeline path that already exists (`Data/*.geojson` → `build_vector_sublayer`,
`register.py:183`) and needs no new tiling machinery.

### 3.1 Can AEGIS fill visible vs non-visible differently? — One class per sublayer

**No, not within a single GeoJSON.** `buildVectorStyleFn` builds **one** `Style` from the
sublayer's `MapSublayerStyle` and applies it to every feature. A file containing both `gridcode 1`
and `gridcode 2` polygons would render both in the same fill. There is no per-class rule engine,
no data-driven styling expression, and no legend-to-style binding for vector sublayers.

There is one partial exception, and it is the wrong tool here: `fillColor` supports a
`"prop:<propertyName>"` form that reads the colour from each feature's properties. That would bake
the colours into the GeoJSON and take the fill swatch away from the user — the opposite of the
goal.

**So: one sublayer per class.** The step therefore emits separate files:

- `--viewshed-emit nonvisible` (**default**) → one sublayer, the occlusion mask. Matches the
  `.lyrx` (visible is alpha 0), matches `A03MM026_AGDT_Viewshed_Inverted_Orange`, and is the only
  class that carries information on a map that already shows the terrain.
- `--viewshed-emit both` → two files, two sublayers, each independently recolourable and
  independently toggled by its own eyeball.

This is a better outcome than the raster it replaces, where the two classes were fused into one
image and neither could be changed.

### 3.2 What the user can change, per sublayer

`fillColor`, `fillOpacity`, `color` (stroke), `weight`, `isDashed`/`dashLen`, `opacity`,
`blendMode`, plus `showLabels`. The `.lyrx` intent is reproduced by `fillColor: #FFA77F`,
`fillOpacity: 0.5`, `weight: 0`.

### 3.3 Staying inside the GeoJSON size budget

Dropping PMTiles means the size ceiling has to be managed by the analysis, not by a fallback
format. Three knobs, all defaulted so the common case needs none of them:

| Knob | Default | Effect |
| ---- | ------- | ------ |
| `--viewshed-resolution` | native ≤ 2 km range; **5 m** above that | Resamples the DEM in the crop step. Vertex count scales ~linearly with perimeter/resolution. |
| `--viewshed-simplify` | `2 × analysis resolution` | `ogr2ogr -simplify` in projected metres. This is what took the delivered set to 12.6 k vertices. |
| `--viewshed-min-area` | `0` (keep all) | Drops speckle polygons. |

Coordinate output is fixed at **7 decimals** (≈1 cm at 84°S) — that alone is a 4–5× saving over
the delivered encoding.

Budget check: the MS3 case is ~300 KB. A 10 km-radius far-field run (≈13× the area) at 5 m
analysis / 10 m simplify lands around 1–2 MB — comfortably inside a single `VectorImageLayer`
fetch. The step enforces `config.VIEWSHED_GEOJSON_MAX_MB` (**16 MB**) as a **hard error** that
names the three knobs and the resulting vertex count, rather than silently shipping a layer that
janks the map. If a site ever legitimately needs more, that is the signal to revisit tiling — not
a reason to build it now.

---

## 4. Which variations to generate

### 4.1 What the drop does and does not tell us

**The observer heights used for `BlueOrigin` and `SpaceX` are not recorded anywhere in the
delivery.** Checked and came up empty: the two `.lyrx` files (symbology only), the `.tif.xml`
ArcGIS lineage (records the reclassify, not the viewshed call), `02_Tables/FGDC_Metadata_Summary.csv`
(extents and CRS only), and `02_Tables/export_log_20260805_155731.txt` (a file-export log — no tool
parameters).

What we *can* establish:

1. **The height ladder** comes from the horizon deliverables, which do encode it in the filename:
   `MP026_Horizon_1mSfS_10mLOLA_alt_{0, 1_5, 2, 36, 41, 54}_rng_9998_28` → **0, 1.5, 2, 36, 41,
   54 m**, all at ~9998 m range on a merged 1 m SfS + 10 m LOLA DEM.
2. **The target height convention is 2 m**, from AEGIS's own history: `…viewshed_54m_obs2m_1mpp…`
   and `Viewshed_Primary_2mHeight` / `_30mHeight`.
3. **SpaceX is the taller observer.** Its non-visible area is 10.24 km² against Blue Origin's
   13.15 km² on the identical window — a higher eye point sees more. So in the {36, 41, 54} band,
   `BlueOrigin < SpaceX`.
4. `alt_0` is a surface horizon and degenerate as a viewshed observer; `alt_1_5` / `alt_2` are the
   crew ladder.

### 4.2 The set to generate

Default ladder in `config.py`, overridable per run:

| Slug           | `-oz`  | `-tz` | Rationale |
| -------------- | ------ | ----- | --------- |
| `crew`         | 2 m    | 2 m   | EVA crew-to-crew / crew-to-asset LOS. Matches `Viewshed_*_2mHeight`. |
| `lander_low`   | 36 m   | 2 m   | Lower lander deck / antenna. From the horizon ladder. |
| `lander_mid`   | 41 m   | 2 m   | From the horizon ladder. |
| `lander_high`  | 54 m   | 2 m   | Matches the existing `…viewshed_54m_obs2m…` layer. |

```python
VIEWSHED_HEIGHT_LADDER_DEFAULT = [2.0, 36.0, 41.0, 54.0]   # metres above surface
VIEWSHED_TARGET_HEIGHT_DEFAULT = 2.0
```

Running with no `--viewshed` flags but a lander location produces those four, named
`viewshed_<slug>_<oz>m_nonvisible.geojson`. Four sublayers at ~300 KB each is nothing.

**Two open items, neither blocking Phase 1:**

- **Which height is Blue Origin and which is SpaceX** is a question for the GIS team. Until
  answered, the pipeline ships vendor-neutral slugs (`lander_low/mid/high`) rather than guessing a
  vendor label onto a number. `--viewshed BlueOrigin:36` relabels at any time.
- We can also **recover the heights empirically** — see §8.1. Both delivered rasters and a 1 mpp
  SfS DEM covering the window are on disk, so sweeping `-oz` and scoring against the delivered
  class-2 mask turns this from a guess into a measurement. Worth doing regardless, as it validates
  the whole chain.

---

## 5. Analysis design

### 5.1 Chain

`gdal_viewshed` is present in the pixi env (GDAL **3.12.3**, verified). Per observer:

```
gdalwarp        crop the DEM to the analysis window (and optionally resample)
gdal_viewshed   line-of-sight sweep → Byte raster (1 visible / 2 non-visible / 0 out-of-range)
gdal_polygonize polygons with a `gridcode` attribute
ogr2ogr         filter to the emitted class, simplify (metres, source CRS), drop small parts
ogr2ogr         reproject to EPSG:4326 at 7-decimal precision → Data/<name>.geojson
```

All shell-outs to the pixi GDAL binaries, matching the run-by-path convention. No new Python
dependencies.

### 5.2 `gdal_viewshed` invocation

```
gdal_viewshed -ox <x_m> -oy <y_m> -oz <observer_height_m> -tz <target_height_m> \
              -md <max_distance_m> -cc 1.0 \
              -vv 1 -iv 2 -ov 0 -a_nodata 255 \
              -of GTiff -co COMPRESS=LZW <window.tif> <viewshed.tif>
```

- **`-cc 1.0` is the critical lunar parameter.** GDAL defaults to `0.85714`, the *terrestrial
  atmospheric-refraction* coefficient. The Moon has no atmosphere, so the correction must be pure
  geometry. GDAL applies `height_corrected = height − cc · d² / (2R)` with `R` from the **DEM's SRS
  spheroid**. At 10 km the lunar curvature drop is `1e8 / (2 · 1 737 400)` = **28.8 m**; with
  Earth's radius it would be 7.9 m.
- **`-vv 1 -iv 2` mirrors the delivered ESRI convention**, so generated output is directly
  diff-able against the reference rasters.
- **`-ov 0` must differ from `-iv`.** Both default to `0`, which makes "outside the analysis
  radius" indistinguishable from "in range but occluded" — with `-md` set and the defaults, every
  cell beyond the radius polygonises into the mask and the layer becomes one orange square.
- `-a_nodata 255` keeps the output Byte and lets DEM voids drop out of polygonisation
  (`gdal_polygonize` masks nodata by default).

### 5.3 The crop is mandatory, not an optimisation

`gdal_viewshed` writes an output the size of its input. The MS3 mission DEM already in
`missionFiles/50/Data/mp2-sfs-dem_MoonSP_COG_deflate_cog.tif` is **57 840 × 41 790 = 2.4 billion
cells** (57.8 × 41.8 km at 1 m). Running the tool against that unclipped is not viable at any
`-md`.

- `--viewshed-max-distance 0` (default) → crop to the DEM extent as-is. Only sane when the DEM is
  already a site-sized window.
- `--viewshed-max-distance R` → `gdalwarp -te (ox−R) (oy−R) (ox+R) (oy+R)`, clipped to the DEM
  extent, then `-md R` so the corners outside the circle are flagged out-of-range.

Given the mission DEM's real size, the step **requires** a max distance when the DEM exceeds
`config.VIEWSHED_AUTO_CROP_CELLS` (250 M) and errors with the suggested flag rather than starting a
run that will not finish. The delivered geometry corresponds to a ±2724 m window.

### 5.4 Feature properties (and the label trap)

`buildVectorStyleFn` renders a per-feature text label from the first of
`label` → `elevation` / `ELEVATION` / `elev` / `Contour` → `name` / `NAME`, and
`defaultSublayerStyle.showLabels` is **`true`**
([sublayer.ts:8](../../../src/store/storeUtils/sublayer.ts#L8)). A viewshed with 531 polygons each
carrying a `name` would draw 531 labels the first time it is switched on.

Emitted properties are therefore deliberately label-free:

```json
{ "gridcode": 2, "visible": false, "observer": "lander_high",
  "observer_height_m": 54, "target_height_m": 2, "max_range_m": 0 }
```

`gridcode` is kept for parity with the delivered shapefiles. `gdal_polygonize` names its field
`DN`; rename via the `ogr2ogr -sql` select. The script **asserts** that no emitted property key is
in the label-trigger set — a guard, not a convention, since the cost of regression here is a
visibly broken layer.

---

## 6. AEGIS-side contract

### 6.1 Registration — no pipeline change needed

`register.classify` already routes `Data/*.geojson` → `build_vector_sublayer` → `type: "vector"`,
`path: <filename>`, `name: <file stem>`, header bucket `Vector`. Writing the file is sufficient.

### 6.2 Default styling — the one gap the system does *not* close

`defaultSublayerStyle` is `fillColor: "none"`, `fillOpacity: 0`, `color: "#FFFFFF"`, `weight: 1`,
`showLabels: true`. A freshly registered viewshed therefore renders as **white outlines with no
fill** until someone sets the fill in the layer panel. Functional, but not the `.lyrx` intent, and
it will read as "the layer is broken" to anyone who does not know to look.

Options, in cost order:

1. **Document it** (Phase 4). The `#FFA77F` / 50 % / weight-0 recipe goes in the site doc. Zero
   code, but relies on the operator.
2. **Register a mission-default preset** (Phase 5, optional). `POST /api/v1/preset` exists and
   `upsert_sublayers` returns created sublayers with their uuids, so `register.py` could build a
   `Preset` whose `mapSublayerControls[uuid].style` sets `fillColor: "#FFA77F"`, `fillOpacity: 0.5`,
   `weight: 0`, `showLabels: false`. Adds a preset surface to `aegis_api.py`, needs an `ownerId`,
   and would overwrite an existing mission default — worth deciding separately.

Note `properties.json` is only read for `Layers/<folder>`; the admin importer
([layerSublayerEdit.tsx:283](../../../src/components/admin/layerSublayerEdit.tsx#L283)) builds its
root path from `Layers/`, so a GeoJSON in `Data/` has no sidecar channel. If a prettier display
name / description / legend is wanted, the cheap route is a **pipeline-side** sidecar:
`build_vector_sublayer` reads an optional `Data/<stem>.properties.json` and merges `name` /
`description` / `legend` into the POST body. `register.py` only — the app is untouched, since
register sets those fields directly. Phase 5.

---

## 7. CLI surface

New argument group in `main.py`, following the `--contours*` / `--grid*` pattern:

```
Viewsheds (--viewshed*)
  --viewshed NAME:OZ[,LAT,LNG]     Repeatable. Observer name and height (m) above the surface.
                                   LAT/LNG default to --lander-lat/--lander-lng.
                                   Omit entirely to use the default height ladder (2/36/41/54 m).
                                   e.g. --viewshed BlueOrigin:36 --viewshed Crew:2
                                        --viewshed Ridge:2,-84.2401,33.6118
  --in-viewshed-observers FILE     Bulk observers from a point .geojson/.shp/.csv
                                   (fields: name, height[, target_height]).
  --viewshed-dem PATH              DEM for the analysis (default: the mission DEM). Use a merged
                                   near+far-field DEM for ranges beyond the SfS footprint.
  --viewshed-target-height M       -tz (default 2.0, crew eye height).
  --viewshed-max-distance M        -md and the crop window (default 0 = whole DEM; required for
                                   DEMs above ~250 M cells).
  --viewshed-resolution M          Resample the DEM before analysis (default: native, or 5 m
                                   when the range exceeds 2 km).
  --viewshed-simplify M            Simplify tolerance, metres (default 2 x resolution; 0 = off).
  --viewshed-min-area M2           Drop polygons smaller than this (default 0).
  --viewshed-curvature C           -cc (default 1.0 - airless body, no refraction).
  --viewshed-emit {nonvisible,visible,both}   Default nonvisible. `both` writes two sublayers.
  --viewshed-keep-raster           Also keep the intermediate viewshed GeoTIFF under Data/.
```

`--viewshed NAME:OZ` is parsed by `parse_observer_spec()` in `config.py` so `main.py` stays thin;
the file variant normalises into the same `Observer` dataclass.

---

## 8. Files, constants, phases

### Files

| File                          | Change |
| ----------------------------- | ------ |
| `viewshed/__init__.py`        | **new** — package marker (matches `slope/`, `vector/`). |
| `viewshed/dem_to_viewshed.py` | **new** — run-by-path converter, one observer per invocation: crop → viewshed → polygonise → filter/simplify → EPSG:4326 GeoJSON. UTF-8 shim, `argparse`, `from __future__ import annotations`, `sys.path.insert` for `config`. |
| `config.py`                   | Viewshed constants (below), `Observer`, `parse_observer_spec()`, `viewshed_layer_name()`. |
| `pipeline/steps.py`           | `VIEWSHED = ROOT / "viewshed" / "dem_to_viewshed.py"`; `step_viewsheds()`; entries in `STEPS`, `STEP_FNS`, `DATA_STEPS`; `default_steps()` appends `viewsheds` when observers are given. |
| `main.py`                     | The `--viewshed*` argument group. |
| `pipeline/summary.py`         | Echo observers, `cc`, analysis resolution in `--summary`. |
| `register.py`                 | Phase 5 only — optional `Data/<stem>.properties.json` sidecar. |
| `README.md`, `CLAUDE.md`      | New step in the step table + the `-cc` / `-ov` / crop gotchas. |
| `docs/SITE_A03MP026-…md`      | Worked MS3 example: the height ladder, calibration result, styling recipe. |

`box_publish.py` needs no change — it already zips `Data/`.

### Constants

```python
# --- Viewsheds -------------------------------------------------------------
# Airless body: geometric curvature only. GDAL's 0.85714 default bakes in Earth's
# atmospheric refraction. R comes from the DEM SRS spheroid (1737400 m).
VIEWSHED_CURVATURE_COEFF = 1.0
VIEWSHED_TARGET_HEIGHT_DEFAULT = 2.0     # crew eye height (m)
VIEWSHED_HEIGHT_LADDER_DEFAULT = [2.0, 36.0, 41.0, 54.0]   # see §4.2
VIEWSHED_MAX_DISTANCE_DEFAULT = 0.0      # 0 = whole DEM extent
VIEWSHED_COARSE_RANGE_M = 2000.0         # above this range, default to a coarser analysis grid
VIEWSHED_COARSE_RESOLUTION_M = 5.0
VIEWSHED_SIMPLIFY_FACTOR = 2.0           # tolerance = factor x analysis resolution
VIEWSHED_MIN_AREA_DEFAULT = 0.0
VIEWSHED_AUTO_CROP_CELLS = 250_000_000   # above this, require --viewshed-max-distance

# Raster class values — mirror the delivered ESRI convention so generated output is
# directly comparable with the GIS team's product.
VIEWSHED_VALUE_VISIBLE = 1
VIEWSHED_VALUE_NONVISIBLE = 2
VIEWSHED_VALUE_OUT_OF_RANGE = 0          # MUST differ from NONVISIBLE (see §5.2)
VIEWSHED_NODATA = 255

# Symbology from the MS3 .lyrx (both landers agree). Users can override it in AEGIS.
VIEWSHED_FILL_COLOR = "#FFA77F"
VIEWSHED_FILL_OPACITY = 0.5

VIEWSHED_GEOJSON_MAX_MB = 16             # hard error above this (see §3.3)

# Property keys that would trigger per-feature labels in buildVectorStyleFn.
VIEWSHED_FORBIDDEN_PROPS = {"label", "elev", "elevation", "ELEVATION", "Contour", "name", "NAME"}
```

### Phases

**Phase 1 — analysis core.** `viewshed/dem_to_viewshed.py` end-to-end for one observer; constants;
`--viewshed NAME:OZ` + the default ladder; `step_viewsheds`; the size and crop guards. Covers the
MS3 case.

**Phase 2 — calibration + ergonomics.** Run §8.1 against the delivered rasters and record the
recovered heights. Add `--in-viewshed-observers`, `--viewshed-emit both`, `--viewshed-keep-raster`,
`--summary` echo.

**Phase 3 — docs.** README step table, CLAUDE.md gotchas, site doc worked example, styling recipe.

**Phase 4 (optional) — `Data/` vector sidecar.** `register.py` reads `Data/<stem>.properties.json`
for `name` / `description` / `legend`. Benefits every GeoJSON sublayer, not just viewsheds.

**Phase 5 (optional, decide separately) — default preset.** Register a mission-default preset
applying `#FFA77F` @ 50 %. Adds a preset surface and can clobber an existing mission default.

---

## 8.1 Calibration: recovering the observer heights

Everything needed is already on disk, so this is a real measurement rather than an estimate:

- Reference masks: `01_Raster/A03MP026_SfS_1mpp_VIEWSHED_{BlueOrigin,SpaceX}.tif`, class 2.
- DEM: `missionFiles/50/Data/mp2-sfs-dem_MoonSP_COG_deflate_cog.tif` — 1 mpp, extent
  `71470–129310 E / 118030–159820 N`, which fully contains the `94044–99492 / 143464–148913`
  viewshed window.
- Observer: the lander at `(96771.33, 146191.14)`, matching the window centre to ~3 m.

Procedure: crop the DEM to the reference window, sweep `-oz` over `{1.5, 2, 20, 30, 36, 41, 54,
60}` with `-tz 2` and `-cc 1.0`, rasterise each result to the reference grid, and report **IoU
against the reference class-2 mask**. The best-scoring height is the recovered value; expect the
90 %+ range at the right one, with residual disagreement from ArcGIS-vs-GDAL sweep differences.
Cross-check against §4.1 fact 3 — whichever height wins for SpaceX must exceed Blue Origin's.

Note the two datasets name their CRS differently (`Moon_2000_South_Pole_Stereographic` on the DEM
vs `Moon_2015_-_Sphere_Ocentric_South_Polar` on the reference). Both are stereographic `lat_0=-90`
on the same 1737400 m sphere, so the coordinates are numerically interchangeable — but GDAL will
warn, and the warning should be understood rather than suppressed.

---

## 9. Risk register — what the system handles and what it does not

| Risk | Handled by GeoJSON? | Who handles it |
| ---- | ------------------- | -------------- |
| **`-cc` defaults to Earth's refraction** (21 m of curvature error at 10 km) | ❌ Format-independent | Us. Pinned in `config.VIEWSHED_CURVATURE_COEFF = 1.0`, never a bare CLI default. Verified by the §8.1 calibration and the `-cc 0.85714` A/B in §10. |
| **`-ov` defaults equal to `-iv`** (mask swallows everything outside the radius) | ⚠️ Not prevented, but loud — feature count and file size explode, and the §3.3 hard cap trips | Us. Distinct sentinel in config + the §10 regression test. |
| **Per-feature labels** (`showLabels` defaults true) | ✅ Fully | Us — we control the emitted properties, with a runtime assert against `VIEWSHED_FORBIDDEN_PROPS`. |
| **Full-DEM run is 2.4 B cells** | ❌ Format-independent | Us. Mandatory crop + the `VIEWSHED_AUTO_CROP_CELLS` guard that errors with the flag to pass. |
| **GeoJSON size / render cost** (new risk from dropping PMTiles) | ⚠️ Bounded, not eliminated | Us. Resolution + simplify + precision defaults (§3.3) and a hard 16 MB error. MS3 lands at ~300 KB, far-field at 1–2 MB. |
| **Visible and non-visible cannot differ in one sublayer** | ✅ By design | One sublayer per class (§3.1). Default emits only the mask. |
| **Default style is `fillColor: "none"`** — layer looks empty on first load | ❌ Not handled | **Open.** Documentation (Phase 3) or the optional preset (Phase 5). This is the only listed risk with no code-side fix in the base plan. |
| **Delivered GeoJSON is in projected metres with no `crs`** | ✅ | The reprojection pass; same rule `vector/shp_to_geojson.py` documents. |
| **Lander↔height mapping unknown** | ❌ Not derivable from the drop | Vendor-neutral slugs now; GIS-team confirmation and/or the §8.1 calibration. |

---

## 10. Verification

1. **Agreement with the delivered product** — the §8.1 IoU sweep. Record the recovered heights in
   the site doc.
2. **Curvature is plumbed through** — rerun the best-scoring height with `-cc 0.85714`; the result
   must differ visibly near the window edge (≈6 m of apparent height at 2.7 km). Identical output
   means `-cc` is not reaching GDAL or the DEM SRS is not lunar.
3. **`-ov` regression** — `--viewshed-max-distance 2000` on the 5.45 km window; the mask must stop
   at the circle instead of filling the square corners.
4. **Label guard** — `jq` the output for any key in `VIEWSHED_FORBIDDEN_PROPS`; must be empty.
5. **Size** — MS3 output near 300 KB; confirm the hard-cap error fires by forcing
   `--viewshed-simplify 0` at 1 m.
6. **Both-class mode** — `--viewshed-emit both` produces two files whose areas sum to the window
   area minus nodata.
7. **Round trip** — `--steps register --dry-run` prints `type: "vector"`, `path:
   viewshed_lander_high_54m_nonvisible.geojson`, header `Vector`. Then load in the app, set fill
   `#FFA77F` @ 50 %, weight 0, and confirm the mask aligns with the NAC basemap and the delivered
   raster.
8. **Standard gates** — `python -m py_compile` the new/edited files, then
   `pixi run python esri-to-aegis-lunar-southpole/main.py --list` and `--summary`. Anything
   touching GDAL runs under `pixi run`.

---

## 11. Related data in the drop — not in this scope

- **Horizon lines** (`MP026_Horizon_1mSfS_10mLOLA_alt_{0,1_5,2,36,41,54}_rng_9998_28`) — one
  LineString each, in **geographic** `GCS_Moon_2000` degrees (unlike the viewsheds), on a merged
  1 m SfS + 10 m LOLA DEM at ~9998 m range. The skyline as seen from the observer, and the source
  of the height ladder in §4.2. A `horizons` step is a natural follow-up and should share the
  `Observer` model defined here. The delivered files are small (66 KB) and can go through
  `--in-vector` today.
- **`MP026_20deg_Slope_KeepOutZone.tif`** — a slope threshold mask, not a viewshed. Belongs with
  the slope/products step.
- **PSR, contours, buffers, DEM `.lyrx`** — covered by the existing `products` / `contours` /
  `slope` steps.
