# AEGIS Data Conversion Scripts

Utilities for converting geospatial data into AEGIS map-rendering formats.

## Setup

The geospatial stack (GDAL CLIs + rasterio/fiona/pyproj) is provided as conda-forge
binaries via **pixi** — no system GDAL, no source builds. Run scripts with
`pixi run python …` from this directory. (Pure-Python helpers also work under
`uv run`.) See [`pyproject.toml`](pyproject.toml) for details.

```bash
cd GIS_data_conversion_pipeline
pixi install
```

## Pipelines

### [`esri-to-aegis-lunar-southpole/`](esri-to-aegis-lunar-southpole/)

The main pipeline: turns a GIS data drop (DEM, NAC mosaic, slope, vectors) into AEGIS-ready
cap-grid tile layers + data products for a lunar south-pole mission, **and registers them on
a running AEGIS server over HTTP** (mission fields, header layers, sublayers, active LGRS
grid) — optionally zipping + uploading the results to Box. You give it an existing
**`--mission-id`** (created in the AEGIS admin); output lands in
`<static>/missionFiles/<id>/` (`STATIC_DIR` from the repo `.env`).

```bash
pixi run python esri-to-aegis-lunar-southpole/main.py --list           # show the steps, then exit
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --in-root <drop> --dem-products hillshade slope aspect tri --register --box
```

#### Selecting which steps run

```text
0 stage · 1 dem · 2 nac · 3 slope · 4 products · 5 vector · 6 rasters · 7 vectors ·
8 grid · 9 register · 10 box
```

By default the pipeline runs only the steps whose inputs are present (e.g. `grid` when a
lander location is given), plus `register`/`box` when `--register`/`--box` are passed.

| You want…                         | Flag                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| Default (input-driven) steps      | _(omit `--steps`/`--from`)_                                   |
| Specific steps, by name           | `--steps dem vector`                                          |
| Specific steps, by index          | `--steps 1 5`                                                 |
| Everything from a step onward     | `--from slope` (or `--from 3`)                                |
| Rebuild layers that already exist | add `--overwrite` (tile steps skip existing layers otherwise) |

#### Specifying source & destination paths

Output goes to `<static>/missionFiles/<mission-id>/` by default (override with `--out-dir`); each
step reads a specific input under `--in-root` that you can override individually. Outputs land in
`<out>/Data/` (DEM, vectors, grid coords, conversion report) and `<out>/Layers/` (tile layers).

| Step       | Source flag (overrides the `--in-root` default)          | Destination (under `--out-dir`)                     |
| ---------- | ---------------------------------------------------- | ----------------------------------------------- |
| `dem`      | `--in-dem <dem.tif>`                                    | `Data/<source>_deflate_cog.tif` (keeps source name) |
| `nac`      | `--in-nac <mosaic.tif>` _(delivered separately)_ | `Layers/nac/`                                   |
| `slope`    | `--in-slope <slope.tif>` + `--in-lyrx <ramp.lyrx>`         | `Layers/slope/`                                 |
| `products` | `--in-dem` + `--dem-products hillshade slope aspect tri`    | `Layers/{hillshade,slope,aspect,tri}/`          |
| `vector`   | `--in-ellipse <ellipse.shp>`                            | `Data/ellipse.geojson`                          |
| `rasters`  | `--in-raster <path>` (repeatable)                       | `Layers/<stem>/` each                           |
| `vectors`  | `--in-vector <path>` (repeatable, shp/geojson)          | `Data/<stem>.geojson` each                      |
| `grid`     | `--lander-lat/--lander-lng` (`--grid-extent 10km`)   | `grid_source.geojson`                           |
| `register` | `--mission-id` (+ `--aegis-url`/`--token`)           | mission fields + layers/sublayers + active grid |
| `box`      | `--mission-name`                                     | zips → Box `<mission name>/{Data,Layers}/`      |

Omit a source flag and the step uses its default path under `--in-root` (the A03MP026 layout).
A GIS-delivered `.lyrx` passed with `--in-lyrx` is used **instead of** the built-in colour ramp
(see the pipeline README). Every tile layer also gets a `properties.json` legend.

Use **`--layer-prefix <PREFIX>`** to namespace every generated layer folder **and** its
AEGIS layer name (e.g. `--layer-prefix LOLA` → `Layers/LOLA_hillshade`, layer name
`"LOLA_hillshade"`). This lets you run multiple DEMs into the **same** mission without one
run clobbering another's layer folders. It affects only `Layers/` outputs; `Data/` products
(DEM COG, grid, vectors) are mission-level and stay unprefixed. Pair it with
**`--dem-products-only`** when the extra DEM is _products-only_: that skips the `dem` step (no
`Data/` COG) and leaves the mission's `demFilePath`/`demResolution` untouched on register, so
the supplementary DEM contributes layers only — not a new mission DEM.

```bash
# Add a second (LOLA) DEM's products/contours to mission 50 alongside an existing DEM's:
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 50 --mission-name "..." --layer-prefix LOLA --dem-products-only \
    --in-dem F:/drop/LDEM_83S_10MPP_ADJ.TIF --dem-resolution 10 \
    --dem-products hillshade slope aspect tri --contours \
    --steps products contours register box --overwrite
# -> Layers/LOLA_hillshade, LOLA_slope, LOLA_aspect, LOLA_tri, LOLA_contours_100m, LOLA_contours_20m
```

```bash
# Register a previously-built mission onto another server (e.g. prod) — no rebuild:
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url https://aegis.fit.nasa.gov --mission-id <PROD_ID> \
    --mission-name "..." --lander-lat .. --lander-lng .. \
    --out-dir <static>/missionFiles/<LOCAL_ID> --token <PROD_TOKEN> --steps register

pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id 123 --summary   # print AEGIS values
```

#### Standalone converters (inputs not part of the ESRI drop)

These take positional `input` / `output` paths directly (no `--in-root`/`--out-dir`):

- [`grid/generate_lgrs.py`](esri-to-aegis-lunar-southpole/grid/) — generate the raw LGRS grid
  for a landing site (USGS `lgrs` package; replaces the manual ESRI export).
  `generate_lgrs.py --lat <deg> --lng <deg> [--extent 10km] [--precision 100] -o <raw.geojson>`.
- [`grid/convert_lgrs.py`](esri-to-aegis-lunar-southpole/grid/) — raw LGRS GeoJSON → AEGIS
  mission-grid GeoJSON. `convert_lgrs.py <raw.geojson> [-o <outdir>]` (default: alongside input).
- [`timeaware/singleband_timeaware.py`](esri-to-aegis-lunar-southpole/timeaware/) —
  single-band time series → tiles + `manifest.json`.
  `singleband_timeaware.py <indir> --datatype <mazarico|quickmap> [-o <outdir>]`.

See its [README](esri-to-aegis-lunar-southpole/README.md) for all data types, folder layout,
AEGIS import settings, and [`docs/LEGACY-COVERAGE.md`](esri-to-aegis-lunar-southpole/docs/LEGACY-COVERAGE.md)
(what was ported from the legacy `lunar_utils/aegis` package). General raster utilities
(`geotiff_to_cog`, `inspect_geotiff`, `raster_to_tiles`) live in its
[`common/`](esri-to-aegis-lunar-southpole/common/) folder.

### [`mercator/`](mercator/)

Mercator / global tiling for **non-polar / Earth** data (the counterpart to the south-pole
cap grid). Takes positional `input` raster and `output_dir`: `--body earth` → EPSG:3857
Web-Mercator tiles; `--body moon` → geodetic tiles (`--zoom` optional, default auto).

```bash
pixi run python mercator/tile_mercator.py <imagery.tif> <out_tiles> --body earth
```
