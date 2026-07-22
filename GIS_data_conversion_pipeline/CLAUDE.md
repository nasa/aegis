# CLAUDE.md — GIS_data_conversion_pipeline

Guidance for Claude Code when working in `GIS_data_conversion_pipeline/`. This is a **standalone
Python toolset** (its own pixi/uv environment), separate from the TypeScript app one level up.

## What this is

Scripts that convert GIS data drops into AEGIS-ready map artifacts: cap-grid tile pyramids,
COGs, GeoJSON, mission grids, time-aware layers, and the `properties.json` / `manifest.json`
sidecars. Beyond producing files, the main pipeline also **registers a mission on a running
AEGIS server over HTTP** (mission GIS fields, header layers, sublayers, active grid) and can
**zip + upload the results to Box** — so a generated mission needs no admin "import from file"
clicking. It is the active implementation of the AEGIS GIS conversion workflow.

## Environment & commands

The geospatial stack is provided as **conda-forge binaries via pixi** — no system GDAL, no
source builds. Run everything from this directory:

```bash
cd GIS_data_conversion_pipeline
pixi install
pixi run python esri-to-aegis-lunar-southpole/main.py --list
pixi run python <script>.py ...
```

- **Dependency split (do not break this):** the geospatial packages (`gdal`, `rasterio`,
  `fiona`, `pyproj`) live in `[tool.pixi.dependencies]` only — NEVER add them to
  `[project.dependencies]`, which would force a from-source PyPI build that fails without a
  system `libgdal`/`gdal-config`. Pure-Python deps (pmtiles, pillow, …) stay on PyPI.
- `osgeo`/`fiona` are only importable under the **pixi** env, not a bare `uv`/`.venv`. Stdlib-
  and rasterio-only scripts can be tested with `.venv`, but anything importing `osgeo`/`fiona`
  must run under `pixi run`.

## Layout

- [`esri-to-aegis-lunar-southpole/`](esri-to-aegis-lunar-southpole/) — main pipeline (lunar
  **south-pole cap grid**). `main.py` is a thin CLI; `pipeline/` holds the runner internals
  (`reporting` output-capture, `steps`, `summary`); `config.py` holds the cap-grid projection
  profile + path resolution + header/external-NAC/grid constants; `aegis_api.py` /
  `register.py` / `box_publish.py` do the HTTP registration + Box upload; `common/` shared
  raster tools; one folder per concern (`dem slope products vector vectortile grid
timeaware properties`). `vectortile/arcgis_cache_to_pmtiles.py` packs a delivered ArcGIS
  vector-tile cache (Compact Cache V2) into a single `.pmtiles` (pure-Python `pmtiles`, no GDAL),
  emitted inside its own `Layers/<name>/` folder; `vectortile/dem_to_contours_pmtiles.py` instead
  _tiles from scratch_ — `gdal_contour` on the DEM → GDAL MVT-dir driver (custom cap-grid
  `TILING_SCHEME`) → PMTiles with synthesized `esri_tile_info` — producing labelled contour
  vector-tile layers. Every produced sublayer (raster tiles, PMTiles,
  COG) is a folder under `Layers/`; AEGIS infers the type from the folder contents (no `isCog`
  flag), and the mission DEM COG stays in `Data/` as `demFilePath`. See
  [`esri-to-aegis-lunar-southpole/CLAUDE.md`](esri-to-aegis-lunar-southpole/CLAUDE.md).
  `products/lyrx_to_ramp.py` converts GIS-delivered ArcGIS `.lyrx` symbology to
  gdaldem ramps; `products/default_color_ramps/` are the built-in fallback ramps.
- [`mercator/`](mercator/) — Mercator/global tiling for **non-polar / Earth** data.

## Conventions for new/edited scripts

- **Run-by-path geo sub-scripts; package-imported orchestration.** The per-concern geo
  scripts (`common/`, `dem/`, `slope/`, `products/`, `vector/`, `grid/`, `timeaware/`)
  are invoked as `pixi run python <path>.py` and orchestrated via `subprocess` (see
  `pipeline/steps.py`). The orchestration layer is the exception: `main.py` imports its
  same-dir modules (`config`, `aegis_api`, `register`, `box_publish`) and the `pipeline/`
  package directly — `sys.path[0]` is the runner's dir, so those imports resolve while the
  hyphenated parent never needs to. New geo sub-scripts stay run-by-path + self-contained.
- **UTF-8 shim.** Start each CLI by reconfiguring `sys.stdout/stderr` to UTF-8 (Windows
  consoles default to cp1252 and crash on `→`/`≥`). Copy the pattern from any existing script.
- **argparse CLI**, `from __future__ import annotations`, lazy heavy imports where it helps.
- **Reuse, don't re-tile.** Cut every south-pole layer with `common/tile_to_cap_grid.py` so it
  lands on the shared cap grid; Mercator reuses `common/raster_to_tiles.py` (`gdal2tiles`).
- **Projection constants live once** in `esri-to-aegis-lunar-southpole/config.py`
  (`CAP_MIN`, `CAP_Z0_RES`, `PROJ_EPSG`, …) and are imported by the tiler — never hardcode
  them elsewhere or the tiler and AEGIS admin summary drift apart.

## AEGIS output contracts (must match the app)

- **`properties.json`** is validated against `../.local/schemas/sublayerImportable.json`
  (`additionalProperties: false`) — emit only allowed keys. Generate via
  `properties/write_properties.py`. `boundingBox`/zoom come from `tilemapresource.xml`, not
  here.
- **`manifest.json`** (time-aware): `{ time_layers: [{ datetime, dirName }] }`. AEGIS allows
  **one** time-based sublayer per mission.
- **Mission grid GeoJSON**: top-level `row_total`/`column_total`/`name`/`crs`/`spacing` (spacing =
  metres between grid lines) + Point features with `id, LGRS_ACC, L_coord, R_coord, row, column`
  (see `grid/convert_lgrs.py`). One grid per mission; metadata is stored on the mission Automerge
  doc (`mission.grid`), coordinates as `Data/<name>.json` — no `Grid_db` / `activeGridUuid`.
- **DEM** is registered as the mission `demFilePath`/`demResolution`, not a sublayer. The COG
  keeps its source filename with a compression + `_cog` suffix (e.g.
  `Data/mp2-sfs-dem_MoonSP_COG_deflate_cog.tif`). All generated COGs use **deflate**, never
  **zstd** — geotiff.js/OpenLayers can't decode zstd (TIFF tag 50000), so a zstd COG is blank
  in the browser.
- **HTTP registration** (the `register` step, `register.py` + `aegis_api.py`) replaces admin
  clicking: `POST /api/v1/missionAutomerge/fields` (projection/DEM/lander/`actionSystemVersion=2`/
  `usingLGRSCoordinates=true`), `POST /api/v1/layer` (Common_LSP/Raster/Vector header layers),
  `POST /api/v1/sublayer`, and `POST /api/v1/grid` (writes the mission grid → `Data/<name>.json`
  + `mission.grid` on the doc). The
  server-side endpoint `POST /api/v1/missionAutomerge/fields` exists specifically for this (the
  app otherwise mutates the mission only via the Automerge websocket) and requires the EMSS API
  token. Changed lander coordinates are rejected when affected mission assets already exist,
  because the browser-only lander-location workflow must update station walkbacks and
  lander-connected EVA traverses. Each run also writes a `Data/conversion_report.md` (full
  console log + per-step timings).

## Gotchas

- **Colour ramps**: `products/default_color_ramps/` are the **fallback** ramps. When the GIS
  team delivers symbology as a `.lyrx`, the `slope`/`products` steps convert it
  (`products/lyrx_to_ramp.py`) and use it **instead of** the default — for both the colorize
  and the legend — so there is no longer a `slope.txt`↔`.lyrx` "keep in sync" burden (the
  fallback `slope.txt` still matches the MS3 `AMPES_Slope 1.lyrx`). **TRI is
  resolution-dependent** — the `products` step auto-selects `default_color_ramps/ARCHIVE/
TRIColors_{1m,5m,10m}_DEM.txt` to match `--dem-resolution`.
- `tile_to_cap_grid.py` pads its virtual cap canvas to **`2**max_zoom` tiles**, not to the next
  whole tile at max zoom. `gdal raster tile` anchors at the top-left and re-derives the row
  count per zoom as `ceil(rows / 2)`, so anything other than a power-of-two tile count walks
  the bottom row off `CAP_MIN` on the way up and shifts the coarser levels north (the layer
  visibly jumps as you zoom out past its native level). Keep the padding power-of-two.
- `tile_to_cap_grid.py` honours a real alpha band when input is RGBA; for ≤3-band input it
  infers transparency from band 0 == nodata/0. Colorized products should be RGBA so colours
  with red=0 (e.g. darkest TRI `rgb(0,38,115)`) aren't clipped.
- `*.egg-info` is a build artifact (gitignored via the root `.gitignore`); don't commit it.
