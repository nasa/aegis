# AEGIS Data Conversion Scripts

Utilities for converting geospatial data into AEGIS map-rendering formats.

## Setup

The geospatial stack (GDAL CLIs + rasterio/fiona/pyproj) is provided as conda-forge
binaries via **pixi** — no system GDAL, no source builds. Run scripts with
`pixi run python …` from this directory. (Pure-Python helpers also work under
`uv run`.) See [`pyproject.toml`](pyproject.toml) for details.

```bash
cd data_conversion_scripts
pixi install
```

## Pipelines

### [`esri-to-aegis-lunar-southpole/`](esri-to-aegis-lunar-southpole/)

The main pipeline: turns an ArcGIS/ESRI GIS data drop (DEM, NAC mosaic, slope,
landing-ellipse shapefile) into AEGIS-ready cap-grid tile layers + data products for
a lunar south-pole mission. Mission-agnostic — there are no mission numbers; you point
it at an input drop and an output root.

```bash
pixi run python esri-to-aegis-lunar-southpole/main.py --list          # show the steps, then exit
pixi run python esri-to-aegis-lunar-southpole/main.py --out <output-root> --nac-mosaic <mosaic.tif>
```

#### Selecting which steps run

The pipeline is six ordered steps; `--out` is always required.

```text
0 stage · 1 dem · 2 nac · 3 slope · 4 products · 5 vector
```

| You want…                       | Flag                                  |
| ------------------------------- | ------------------------------------- |
| All steps (the default)         | _(omit `--steps`/`--from`)_           |
| Specific steps, by name         | `--steps dem vector`                  |
| Specific steps, by index        | `--steps 1 5`                         |
| Everything from a step onward   | `--from slope` (or `--from 3`)        |
| Rebuild layers that already exist | add `--overwrite` (tile steps skip existing layers otherwise) |

```bash
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps dem vector
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --from slope --overwrite
```

#### Specifying source & destination paths

There is one **destination** (`--out`) and one **source root** (`--src`); each step then
reads a specific input under `--src` that you can override individually. Outputs land in
`<out>/Data/` (dem, ellipse) and `<out>/Layers/` (tile layers).

| Step       | Source flag (overrides the `--src` default)   | Destination (under `--out`)          |
| ---------- | --------------------------------------------- | ------------------------------------ |
| `dem`      | `--dem <dem.tif>`                             | `Data/dem.tif`                       |
| `nac`      | `--nac-mosaic <mosaic.tif>` _(required; delivered separately)_ | `Layers/nac/`        |
| `slope`    | `--slope <slope.tif>` + `--lyrx <ramp.lyrx>` | `Layers/slope/`                      |
| `products` | `--dem <dem.tif>` (derives hillshade/aspect/tri) | `Layers/{hillshade,aspect,tri}/`  |
| `vector`   | `--ellipse <ellipse.shp>`                    | `Data/ellipse.geojson`               |

Omit a source flag and the step uses its default path under `--src` (the A03MP026 layout).
`--nac-mosaic` is delivered outside the ESRI drop, so it has no default — pass it whenever
the `nac` step runs. Every tile layer also gets a `properties.json` legend the AEGIS admin
auto-imports.

```bash
# Custom source root, default per-step inputs inside it:
pixi run python esri-to-aegis-lunar-southpole/main.py --src <drop> --out <dir> --nac-mosaic <mosaic.tif>

# Override individual inputs regardless of --src:
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> \
    --steps dem slope --dem <dem.tif> --slope <slope.tif> --lyrx <ramp.lyrx>

pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --summary   # print AEGIS admin values
```

#### Standalone converters (inputs not part of the ESRI drop)

These take positional `input` / `output` paths directly (no `--src`/`--out`):

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
