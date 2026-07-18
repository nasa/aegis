# CLAUDE.md — esri-to-aegis-lunar-southpole

Guidance for Claude Code when working **in this pipeline** (the lunar south-pole ESRI→AEGIS
converter). Read this before touching anything under
`GIS_data_conversion_pipeline/esri-to-aegis-lunar-southpole/`. The parent
[`../CLAUDE.md`](../CLAUDE.md) covers the shared Python-toolset environment (pixi, dependency
split, UTF-8 shim, run-by-path vs package-import convention) — this file is the pipeline-specific
layer on top of it, and [`README.md`](README.md) is the full user-facing reference (steps, CLI,
worked examples). Prefer updating those two rather than duplicating them here.

## What this pipeline is

A thin CLI (`main.py`) that turns a GIS data drop into AEGIS-ready, **OpenLayers-first** map
products for a **lunar south-pole cap-grid** mission, then registers them on a running AEGIS
server over HTTP and (optionally) zips + uploads to Box. `main.py` is a thin runner; the internals
live in `pipeline/` (`reporting` output capture, `steps`, `summary`). Each `step_*` shells out to a
per-concern converter via `subprocess` so the pixi env is inherited.

## Output contract (must match the app)

**Every produced sublayer is a folder under `Layers/`.** The AEGIS app and `register.py` both infer
a layer's type from the folder's **contents**, not from any stored flag:

| Folder contains… | AEGIS type | sublayer `path` | served from |
|------------------|-----------|-----------------|-------------|
| `{z}/{x}/{y}.png` + `tilemapresource.xml` | `tile` (raster) | `<folder>` | `Layers/<folder>/<tilePattern>` |
| `<name>.pmtiles` | `vector-tile` | `<folder>/<name>.pmtiles` | `Layers/<folder>/<name>.pmtiles` |
| `<name>.tif` / `.tiff` | `tile` (COG) | `<folder>/<name>.tif` | `Layers/<folder>/<name>.tif` |

- **PMTiles** (`step_vectortiles` → `vectortile/arcgis_cache_to_pmtiles.py`) write
  `Layers/<name>/<name>.pmtiles`. The converter copies the ArcGIS cache's `esri_tile_info`
  (lods/origin/extent) into the PMTiles metadata — that is the OpenLayers tile-grid contract;
  without it the layer renders blank. It also **drops phantom deepest LODs** (`--min-coverage-ratio`,
  default 0.5): ArcGIS caches sometimes declare a `maxLOD` deeper than was actually tiled, and
  since OpenLayers over-zooms by requesting tiles at the max LOD, a phantom level makes the whole
  layer blank right at that resolution. The converter caps `maxLOD`/`lods` (and the written tiles)
  to the last fully-tiled level so OpenLayers over-zooms from there instead.
- **COG raster sublayers** (`step_cogs` → `common/geotiff_to_cog.py`) write
  `Layers/<stem>/<stem>.tif`. There is **no `isCog` field** — a COG is identified by the `.tif`
  path. Removed across the app (typings/model/store/schema) and here; do not re-introduce it.
- **The mission DEM COG is different** — `step_dem` writes `Data/<source>_zstd.tif` and it is the
  mission `demFilePath` (not a sublayer). It stays in `Data/`.
- **GeoJSON vectors** stay `Data/<name>.geojson` (`type: "vector"`).
- **`properties.json`** (name/description/legend) is validated against
  `../../.local/schemas/sublayerImportable.json` (`additionalProperties: false`, generated from the
  app's `SublayerImportable` type via `npm run schema:create`) — emit only allowed keys. Raster
  folders also carry a `tilemapresource.xml` (bbox/zoom). Both are auto-imported by the admin and
  read by `register.py`.
- **`manifest.json`** (time-aware): `{ time_layers: [{ datetime, dirName }] }`; AEGIS allows **one**
  time-based sublayer per mission.

## `register.py` (HTTP registration — replaces admin clicking)

`classify_layer_dir()` inspects each `Layers/<dir>` and routes to `build_raster_sublayer` /
`build_cog_sublayer` / `build_vector_tile_sublayer`; GeoJSON under `Data/` → `build_vector_sublayer`.
Header buckets: `Common_LSP` (external NAC only), `Raster` (raster tiles **and** COG), `Vector`
(GeoJSON **and** PMTiles). Registration is idempotent (skips existing `(layerUuid, path)` pairs).
Internal `path`s are id-independent (folder-relative), so the same local build registers on any
server — see README "Registering on another server".

## Box publish (`box_publish.py`)

Zips each `Data/` and each `Layers/<dir>` and uploads in parallel. Folders that hold an
already-compressed artifact (`.pmtiles` / COG `.tif`) are zipped with **`ZIP_STORED` (0
compression)** via `_dir_is_precompressed()` — re-compressing them wastes CPU and PMTiles/COG are
range-requested by the client. Everything else uses DEFLATE.

## Conventions specific to this pipeline

- **Projection constants live once** in `config.py` (`CAP_MIN`, `CAP_Z0_RES`, `PROJ_EPSG`, …) and
  are imported by the tiler and echoed by `register.py`/`--summary` — never hardcode them elsewhere
  or the tiler and the AEGIS admin summary drift apart.
- **Reuse, don't re-tile.** Cut every south-pole layer with `common/tile_to_cap_grid.py` so it lands
  on the shared cap grid (its own native max-zoom; projected-metre `<BoundingBox>`).
- Steps run only when their inputs are present; `--steps`/`--from` override. Each run writes
  `Data/conversion_report.md`.

## Verifying a change here

- `python -m py_compile` the edited files (stdlib/rasterio-only scripts run under `.venv`; anything
  importing `osgeo`/`fiona` needs `pixi run`).
- `pixi run python esri-to-aegis-lunar-southpole/main.py --list` and `--summary` (no API calls).
- Build a sample with `--vector-tile-cache` and/or `--cog`, then confirm the
  `Layers/<name>/<name>.pmtiles` and `Layers/<name>/<name>.tif` folders exist and
  `... --steps register --dry-run` prints the expected `type`/`path` (and no `isCog`).
