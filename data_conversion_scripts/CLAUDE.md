# CLAUDE.md — data_conversion_scripts

Guidance for Claude Code when working in `data_conversion_scripts/`. This is a **standalone
Python toolset** (its own pixi/uv environment), separate from the TypeScript app one level up.

## What this is

Scripts that convert GIS data drops into AEGIS-ready map artifacts: cap-grid tile pyramids,
COGs, GeoJSON, mission grids, time-aware layers, and the `properties.json` / `manifest.json`
sidecars the AEGIS admin imports. It supersedes the legacy `../../lunar_utils/lunar_utils/aegis`
package — see [`esri-to-aegis-lunar-southpole/docs/LEGACY-COVERAGE.md`](esri-to-aegis-lunar-southpole/docs/LEGACY-COVERAGE.md).

## Environment & commands

The geospatial stack is provided as **conda-forge binaries via pixi** — no system GDAL, no
source builds. Run everything from this directory:

```bash
cd data_conversion_scripts
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
  **south-pole cap grid**). `main.py` runner; `config.py` holds the cap-grid projection
  profile + path resolution; `common/` shared raster tools; one folder per concern
  (`dem nac slope products vector grid timeaware properties`).
- [`mercator/`](mercator/) — Mercator/global tiling for **non-polar / Earth** data.

## Conventions for new/edited scripts

- **Run-by-path, not importable.** Scripts are invoked as `pixi run python <path>.py` and
  orchestrate sub-scripts via `subprocess` (see `main.py`). There are no console entry points
  and nothing is imported as a dotted package (the dir name is hyphenated on purpose).
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
- **Mission grid GeoJSON**: top-level `row_total`/`column_total`/`name`/`crs` + Point features
  with `id, LGRS_ACC, L_coord, R_coord, row, column` (see `grid/convert_lgrs.py`).
- **DEM** is registered as the mission `demFilePath`/`demResolution`, not a sublayer.

## Gotchas

- **Colour standards** in `products/color_ramps/` are the single source of truth.
  `slope.txt` is **identical** to the GIS-team `AMPES_Slope 1.lyrx`; keep them in sync.
  **TRI is resolution-dependent** — pick a ramp from `color_ramps/ARCHIVE/` per DEM resolution.
- `tile_to_cap_grid.py` honours a real alpha band when input is RGBA; for ≤3-band input it
  infers transparency from band 0 == nodata/0. Colorized products should be RGBA so colours
  with red=0 (e.g. darkest TRI `rgb(0,38,115)`) aren't clipped.
- `*.egg-info` is a build artifact (gitignored via the root `.gitignore`); don't commit it.
