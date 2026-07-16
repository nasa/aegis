# OpenLayers-era pipeline improvements (dual-support, no cutover)

This is the **forward-looking task list** for the `esri-to-aegis-lunar-southpole` scripts:
what the pipeline can start producing for **new** missions once AEGIS renders with OpenLayers,
and — just as important — what it must **keep** producing so the OpenLayers app can still render
the **old** missions unchanged.

It **complements** [`leaflet-notes.md`](./leaflet-notes.md), which is the *reference* for which
parts of the pipeline output exist only because of Leaflet. That doc answers "what is
Leaflet-specific?"; this doc answers "given that both eras coexist forever, what do we build?"

For **vector tiles** specifically — the one OpenLayers-era output this pipeline does **not**
produce yet — see the dedicated reference [`PMTILES-VECTOR-TILES.md`](./PMTILES-VECTOR-TILES.md).
§8 below is its task-list entry; that doc is the technical reference (source format, the
converter to port, the `esri_tile_info` contract, the tile grid, app-side consumption).

> **Scope note.** This doc (and §8) was written on the `MS3-import` branch **before** the
> OpenLayers app was merged. The app-side details it cites (COG-by-type routing, `ol-pmtiles`
> consumption, `parseEsriPmtilesMetadata`) currently live on the `map-prototype` branch. Treat
> them as the target to reconcile against once OpenLayers lands here and this branch is rebased.

Distilled from the early OpenLayers investigation notes in `D:/tempD/GIS-data-pipelines`
(`CURRENT_MISSION-GIS-ANALYSIS.md §15-16`, `V2_TILESET-MIGRATION-STRATEGY.md`,
`V2_COG-SERVING-STRATEGY.md`, `V2_ELEVATION-STRATEGY.md`,
`V2_MISSION-AND-DATA-MIGRATION.md`), reconciled against the pipeline as it stands today.

---

## The governing constraint: no cutover, no back-fixing

- AEGIS is switching to OpenLayers, but **old missions and their layers stay exactly as they
  were built** — TMS y-from-bottom tiles, `<BoundingBox>` in lon/lat degrees, the shared
  `12800` cap-grid pyramid clamped at z13, `projResUnitsPerPixel`-driven resolutions, etc.
  **They will not be regenerated or corrected.**
- Therefore the OpenLayers app carries the **legacy rendering path permanently**. Nothing in
  the pipeline "cuts over." The pipeline only ever builds *new* missions; the burden of
  supporting both eras lands on the **app**, and our job here is to make new pipeline output
  **cheap for the app to tell apart from legacy output** and, where practical, to converge on
  formats the app can render through *one* path.

So every item below is framed as one of three kinds:

- **Additive** — a genuinely new output type/field the app treats as new; legacy data never
  has it, so there's no ambiguity (e.g. COG sublayers).
- **Self-identifying variant** — a changed output that the app can distinguish from legacy via
  an **existing** discriminator (tile format, bbox unit, sublayer type), so no new global flag
  is needed.
- **Needs a version marker** — a change the app *cannot* distinguish from legacy by inspection,
  which therefore requires an explicit era flag on the mission or sublayer.

---

## Discriminators: how the app tells legacy from new

Most of what we want to improve is already distinguishable **per sublayer** using fields that
exist today — prefer these over a mission-wide flag, because a single old mission may later
gain a brand-new layer:

| Concern            | Existing discriminator                              | New marker needed? |
| ------------------ | --------------------------------------------------- | ------------------ |
| Tile order         | `sublayer.tileFormat` (`"tms"` vs `"xyz"`)          | No — set it correctly per layer |
| Raster vs COG      | `sublayer.type` (`"tile"` vs new `"cog"`/`"dem"`)   | No — new type is unambiguous |
| Vector: file vs tiled | `sublayer.type` (`"vector"` GeoJSON vs `"vector-tile"` PMTiles) | No — both types already exist in the schema (§8) |
| BoundingBox units  | value range is self-evident (±180/±90° vs ±931100 m)| No — auto-detect (`getBoundsUnits`) |
| Per-layer zoom     | `sublayer.minNativeZoom`/`maxNativeZoom`            | No — already per layer |
| Trust layer grid vs mission pyramid | *(none — see §2)*                  | **Yes** — legacy-broken tilesets need a fallback flag |

The one genuine gap is §2: whether the app builds a tile layer's grid from the **layer's own**
metadata or from the **mission's** shared `projResUnitsPerPixel` pyramid. Everything else the
app can decide by looking at the sublayer.

---

## 1. Tile order & bounding-box units — emit OL-native for new layers, keep legacy readable

Legacy tiles are **TMS** with a **lon/lat** `<BoundingBox>` (see [`leaflet-notes.md`](./leaflet-notes.md)
§2–§3). The app must keep reading exactly that. For **new** layers the pipeline can emit the
OL-native forms, because both are self-identifying:

- **Tile order.** OL consumes TMS fine (flip y in the `tileUrlFunction`), so the low-risk
  choice is to **keep emitting TMS** and let the app honour `tileFormat: "tms"` uniformly for
  old and new. Only switch new layers to XYZ if we want stock external-tool compatibility — and
  if we do, set `tileFormat: "xyz"` so the app branches on the field it already stores. Either
  way, **no new flag** — `tileFormat` already carries it. (Emitted by
  [`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) /
  [`../register.py`](../register.py).)
- **BoundingBox units.** OL clips in **projected** coordinates, so new tile layers should write
  `<BoundingBox>` in projected metres (the value is already computed just before
  `write_tilemapresource`; skip the `_proj_bbox_to_lonlat` reprojection). The app can tell a
  projected box (±931100) from a lon/lat box (±180/±90) by range — no flag needed — but confirm
  the app's `getBoundsUnits`-style detection is in place before emitting projected boxes, and
  reconcile the external-NAC bbox, which is *already* projected metres in
  [`../config.py`](../config.py) while legacy per-layer boxes are lon/lat.

**Recommendation:** keep TMS (least churn); switch new `<BoundingBox>` to projected metres once
the app's unit auto-detection is confirmed. Both are backward-compatible by inspection.

---

## 2. Per-layer native resolution — the one place a version marker is unavoidable

**Legacy behaviour.** Every layer shares the mission's single pyramid, and the tiler clamps
every layer to `CAP_MAX_ZOOM = 13` (`12800 / 2**13 = 1.5625 m/px`):

```python
# common/tile_to_cap_grid.py — tile_raster()
max_zoom = min(cap_max_zoom, max(0, round(math.log2(z0_res / r_in))))
```

A native 1 m/px DEM (and its products) loses ~36 % of its spatial detail. Legacy missions keep
this forever.

**OpenLayers unlocks per-layer tile grids** — layers with different max zooms coexist as long
as they share the same **origin and projection** (the cap grid still provides both, preserving
basemap overlay). For **new** layers, relax the clamp so each cuts to its own native resolution
(e.g. z14 = 0.78125 m/px for a 1 m/px DEM).

**Why this needs an explicit marker.** The app must decide where a tile layer's *resolutions*
come from:

- **Preferred, forward-looking:** build each tile layer's `TileGrid` from **that layer's own**
  `tilemapresource.xml`/manifest (extent, resolutions, origin, zoom range). This pipeline's XML
  is self-consistent (tiles match XML — see [`LEGACY-COVERAGE.md`](./LEGACY-COVERAGE.md)), so
  both its old *and* new layers render correctly this way, and a new deep-zoom layer "just
  works."
- **Fallback for genuinely-broken legacy:** the truly ancient `lunar_utils` tilesets had XML
  that did **not** match their tiles (the `CURRENT_MISSION-GIS-ANALYSIS §15` finding); those
  can only be rendered by deriving resolutions from `mission.projResUnitsPerPixel`. The app
  needs a way to know "don't trust this layer's XML, use the mission pyramid instead."

So carry a **`tileGridVersion`** (or equivalent) — `1` = legacy, derive resolutions from the
mission pyramid; `2` = trust the layer's own metadata. New pipeline missions stamp `2`; the old
broken ones default to `1`. This is the single new discriminator the improvements require.
*(App-side field; the pipeline's job is to set it on the missions it builds.)*

**Pipeline TODO:** make `CAP_MAX_ZOOM` a per-run/per-layer arg (cap-grid value as default, not
a hard ceiling) so new layers can tile to native resolution while the shared origin/projection
stay fixed. Watch tile-count growth (~4× per extra level) — the main argument for COG (§3) on
the highest-resolution layers.

---

## 3. COG on-the-fly serving — purely additive, the cleanest new path

OL renders a **Cloud-Optimized GeoTIFF directly** via `WebGLTileLayer` + `ol/source/GeoTIFF`
(geotiff.js) over HTTP Range — no tile pyramid, no `tilemapresource.xml`. This is **additive**:
legacy missions have no COG sublayers, so there's zero ambiguity — the app routes on
`sublayer.type`.

Why it fits our data (`V2_COG-SERVING-STRATEGY.md`): single self-describing file (trivial to
store/copy/back up, good for offline), full resolution + arbitrary zoom (no 36 % loss, §2),
native projection (stays `IAU2000:30166`), no tile-generation step.

**Generation already exists and is OL-ready.**
[`../common/geotiff_to_cog.py`](../common/geotiff_to_cog.py) emits internally-tiled COGs
(512 px blocks) with `average` overviews + ZSTD — exactly what geotiff.js needs. No change to
*make* COGs.

**What's missing is the serving + registration path:**

- **New sublayer type.** The pipeline only emits `type: "tile"` today
  ([`../properties/write_properties.py`](../properties/write_properties.py),
  [`../register.py`](../register.py)). Add a path that, for a COG layer, ships the `.tif` and
  registers a `"cog"` sublayer (`path` = file URL; no `tilePattern`/`tileFormat`/bbox — the COG
  is self-describing). New only; legacy tile layers are untouched.
- **Serving requirements** (hosting contract the output assumes): HTTP **Range**
  (`Accept-Ranges: bytes`), **CORS** (`Access-Control-Allow-Headers: Range`), and **nginx
  byte-range slice caching** (`slice 512k` + `proxy_cache`). The POC was blunt: COGs are
  **fast with nginx slice caching, poor without it** (raw S3 / dev-proxy both slow), because
  geotiff.js fires dozens of small Range requests per viewport. Full nginx config in
  `V2_COG-SERVING-STRATEGY.md §2`.
- **Coexistence policy:** keep the cap-grid tiler for layers that must overlay the shared
  basemap at matched zooms, irregular mosaics where a rectangular COG extent over-covers, and
  any non-OL consumer. Recommended: **COG-first for new single-raster / high-res DEM-derived
  layers; pre-tiling as the fallback.**

---

## 4. Elevation / DEM serving — dual path, keep a server-side fallback

OL + geotiff.js reads elevation straight from a **DEM COG** over HTTP Range, which lets the app
do single-point lookups client-side and profiles in Node.js — no dedicated Python/GDAL
service. *(App/infra work: it would retire `src/server/python/elevationService.py`,
`docker/gdal/`, `GDAL_HOST`/`GDAL_PORT`. Listed for context.)*

**Dual-support caveat (no cutover):** old missions' DEMs must keep working too. This pipeline
already re-emits the DEM as a ZSTD COG **with overviews** (`step_dem` →
[`../common/geotiff_to_cog.py`](../common/geotiff_to_cog.py)), so its DEMs are range-readable.
But DEMs from **genuinely old** missions may be plain (non-range-optimized) GeoTIFFs — the app
should **keep a server-side elevation fallback** for any DEM that isn't a proper COG rather than
assume geotiff.js can read every legacy `demFilePath`. Don't delete the GDAL path until every
still-referenced legacy DEM is confirmed range-servable.

**Pipeline TODO (new missions):**

- **noData tag.** `geotiff_to_cog.py` passes source noData through but never sets/asserts one.
  geotiff.js reads `getGDALNoData()`, and the app uses a `-1100101` out-of-bounds sentinel. Add
  a `--nodata` option (and/or verify the source carries a noData tag) so the DEM COG advertises
  noData explicitly.
- **Serving.** New DEM COGs need the same Range + CORS + nginx-slice-cache serving as §3.
- **DEM tiers (future):** per-mission ~1 m/px SfS DEM (current) plus an optional shared
  ~5–10 m/px LOLA DEM referenced by URL rather than copied per mission (§6).

---

## 5. Mission fields — nothing gets deprecated; new missions add, they don't remove

Because old missions stay as-is, the projection fields `../register.py` POSTs must all keep
being emitted — the app needs them to render legacy missions, and there's no harm in new
missions carrying them too (they still define the shared cap origin/projection new tile layers
align to). **Do not remove any of these as pipeline outputs.**

| Field POSTed by `register.py`              | Role going forward |
| ------------------------------------------ | ------------------ |
| `projEpsg`, `projProj4String`              | **Keep, always.** OL registers the custom `IAU2000:30166` projection from these. |
| `planetRadius`                             | **Keep.** Haversine lunar distances. |
| `projOriginX/Y`, `projBounds*`             | **Keep.** Shared cap origin/extent for the tile grid + map view. |
| `projResZoomLevel`, `projResUnitsPerPixel` | **Keep.** Legacy missions (and legacy-broken tilesets, §2) still derive their pyramid from these. New self-describing layers simply don't *depend* on them, but there's no reason to stop emitting them. |
| `tileFormat`, `tilePattern`, `boundingBox` | **Keep per-sublayer.** New layers may set `tileFormat: "xyz"` and a projected `boundingBox` (§1); `"cog"` sublayers omit them. |
| `tileGridVersion` *(new, §2)*              | **Add.** Stamp `2` on new missions so the app trusts per-layer metadata. |

The only *change* here is **adding** `tileGridVersion` (§2). Everything else is retained for
backward compatibility.

---

## 6. Self-describing tilesets & shared catalog (optional, additive)

- **JSON manifest alongside `tilemapresource.xml`.** OL needs only extent + resolutions +
  min/max zoom + origin. A new-era pipeline could emit a small `tiles.json` (in projected
  units) for new layers and have the app prefer it when present, falling back to XML parsing for
  legacy layers. Purely additive; the XML keeps working. If done, keep it distinct from the
  time-aware `manifest.json` (which carries only `{ time_layers: [...] }`).
- **Embed proj4 in the artifact.** Standard XML records `<SRS>IAU2000:30166` but not the proj4
  string; today that lives in the mission fields (§5), which is fine. Add proj4 to the manifest
  only if we want tilesets portable to external tools (QGIS).
- **Shared cross-mission catalog.** Large shared datasets (76 GB NAC mosaic, LOLA DEM, WAC)
  published once to a stable range-served URL and *referenced* by many missions instead of
  copied per `missionFiles/<id>/`. App + hosting change; pipeline side is "publish + emit
  metadata," pairing naturally with the COG work (§3).

---

## 7. Post-generation validation (guard for new output)

Add a `validate_tileset` step that reads each new layer's manifest/XML, computes the expected
tile index for a known projected coordinate (e.g. cap centre), and HTTP-checks those tiles
return 200 — confirming the tiler and its metadata stay in sync, and (once §2 lands) that each
layer's advertised max zoom actually has tiles. This is the empirical method the old
investigation used to *find* the legacy mismatch; here it's a regression guard on new output.
It cannot and should not touch legacy missions.

---

## 8. Vector tiles as PMTiles — the one OL-era output the pipeline dropped

Everything §1–§7 is about **raster**. Vector is a separate story, and there are **two tiers**:

- **Small vectors → GeoJSON (unchanged).** The landing ellipse and similar low-feature-count
  layers are emitted by [`../vector/shp_to_geojson.py`](../vector/shp_to_geojson.py) as lon/lat
  (EPSG:4326) GeoJSON and reprojected client-side (`new GeoJSON({ dataProjection: "EPSG:4326",
  featureProjection: "IAU2000:30166" })`). This is already renderer-agnostic and needs **no
  change** for OpenLayers — keep it.
- **Large / dense vectors → PMTiles vector tiles (new, additive).** Datasets like the
  aggregated **contours** (~286 k line features across z0–z14) are far too heavy to ship as one
  GeoJSON. They must be **vector-tiled** and served as a single `.pmtiles` archive that
  OpenLayers renders via `ol-pmtiles` + `ol/format/MVT`. **The pipeline produces none of this
  today.**

**The gap has history.** A working converter, `arcgis_compact_cache_v2_to_pmtiles.py`, exists on
the **`map-prototype`** branch (`data_conversion_scripts/` root, from the flat prototype era) but
was **not carried over** when those scripts were restructured into
`esri-to-aegis-lunar-southpole/`. It is the piece to port back in. Full detail in
[`PMTILES-VECTOR-TILES.md`](./PMTILES-VECTOR-TILES.md); the essentials:

- **Source format.** ArcGIS **Vector Tile Package / Compact Cache V2** — pre-tiled `.bundle`
  files + a `root.json` that carries the tile grid (`tileInfo.lods`, `origin`, `rows/cols`,
  `spatialReference`, `fullExtent`). Example delivery: `aegis_static/test/AggregatedContour/`
  (`p12/` = raw compact cache, `extracted/contours.pmtiles` = prototype converter output). The
  GIS team tiles in ArcGIS; we do **not** re-tile from raw shapefiles (standard vector-tile
  tooling like tippecanoe is Web-Mercator-only and can't target the lunar polar grid).
- **Producer→consumer contract = the `esri_tile_info` metadata block** embedded in the
  `.pmtiles` (copied from `root.json`) plus `vector_layers`. The OpenLayers side builds the
  vector tile grid **entirely** from `esri_tile_info` (resolutions, origin, extent, tileSize,
  wkid); if it's missing the layer renders blank. The converter must always emit it.
- **Independent tile grid, shared projection.** The vector grid (origin ±8388908.79, 512-px
  tiles, its own ~20 LODs) is **not** the raster cap grid (origin ±931100, 256-px, 12800 m/px,
  z0–z13). OpenLayers lets them coexist because they share the **same projection**: the cache
  declares ESRI `wkid 103878` (Moon South Pole Stereographic), geometrically the same lunar
  south-polar stereographic as AEGIS's `IAU2000:30166`, so the app registers `IAU2000:30166` and
  consumes the tiles with **zero reprojection**. (Verify 103878's sphere radius = 1 737 400 m —
  see the reference doc.)
- **Registration is self-identifying — no new flag.** Emit a `"vector-tile"` sublayer whose
  `path` points at the `.pmtiles`. That `SublayerType` **already exists** in the app schema
  (`src/typings/layer.d.ts`), and `register.py` today emits only `"tile"`/`"vector"` — so adding
  the `"vector-tile"` path is purely additive and legacy layers never have it.
- **Serving.** The single `.pmtiles` archive is read over HTTP **Range** — same Range + CORS +
  nginx slice-cache contract as the COG path (§3–§4).

**Pipeline TODO (new missions / shared catalog):**

1. **Port the converter** into the pipeline as a run-by-path geo sub-script (a `vectortile/`
   concern folder), following the subprocess convention in
   [`../pipeline/steps.py`](../pipeline/steps.py) and `data_conversion_scripts/CLAUDE.md`.
2. **Add a `vectortiles` step** that runs it on any delivered ArcGIS vector-tile cache and lands
   `Data/<name>.pmtiles`.
3. **Register a `"vector-tile"` sublayer** in [`../register.py`](../register.py) (`path` →
   `.pmtiles`; no `tilePattern`/`tileFormat`/bbox — the archive's `esri_tile_info` is
   self-describing, exactly like `"cog"` in §3).
4. Because contours cover the whole cap, treat this as a strong candidate for the **shared
   cross-mission catalog** (§6): publish once to a Range-served URL and reference by many
   missions rather than copying per `missionFiles/<id>/`.

*(App-side, for reference — arrives with the OpenLayers merge, currently only on `map-prototype`:
`ol-pmtiles` `PMTilesVectorSource`, `pmtiles` `PMTiles.getMetadata()`, `parseEsriPmtilesMetadata`
→ `buildTileGrid`, and per-feature styling off the `_symbol` attribute in `contours.ts`.)*

---

## Priority summary

| # | Item                                                  | Kind                 | Effort | Priority |
| - | ----------------------------------------------------- | -------------------- | ------ | -------- |
| 8 | PMTiles vector-tile step + `"vector-tile"` registration (port `map-prototype` converter) | Additive | Med | **High** |
| 3 | COG sublayer output/registration path                 | Additive             | Med    | **High** |
| 2 | `tileGridVersion` + drop per-layer `CAP_MAX_ZOOM` clamp| Version marker       | Low–Med| **High** |
| 1 | New-layer projected `<BoundingBox>` (+ maybe XYZ)      | Self-identifying     | Low    | Medium   |
| 4 | DEM COG noData tag + range serving; keep GDAL fallback | Additive + dual-path | Med    | Medium   |
| 6 | JSON manifest / shared catalog                         | Additive             | Med–High| Low     |
| 7 | `validate_tileset` guard                               | Additive             | Low    | Low      |

Note there is **no** "deprecate mission fields" item — see §5.

## Already OpenLayers-ready — no change needed

- All GDAL/rasterio raster work: reproject, colorize, DEM products, contrast-stretch, COG emit.
- The **tile bytes** themselves (RGBA PNG, alpha-honouring, transparent-tile skipping) — render
  identically for legacy and new layers.
- [`../common/geotiff_to_cog.py`](../common/geotiff_to_cog.py) — already emits internally-tiled
  COGs with overviews for range serving (only the noData tag in §4 is outstanding).
- The DEM COG re-emit (`step_dem`).
- **Small-vector GeoJSON output** ([`../vector/shp_to_geojson.py`](../vector/shp_to_geojson.py)) —
  lon/lat, reprojected client-side; renderer-agnostic. (Large/dense vectors are a *new* output,
  not a no-op — see §8.)
- `projEpsg` / `projProj4String` / `planetRadius` registration — how *both* renderers, and both
  eras, model the custom CRS.
