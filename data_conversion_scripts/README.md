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
a lunar south-pole mission. Mission-agnostic — pass `--src` (input drop) and `--out`
(output root); no mission numbers.

```bash
pixi run python esri-to-aegis-lunar-southpole/main.py --list
pixi run python esri-to-aegis-lunar-southpole/main.py --out <output-root> --nac-mosaic <mosaic.tif>
```

Pipeline steps: `dem · nac · slope · products · vector`. The `products` step derives
hillshade/aspect/tri from the DEM; every tile layer gets a `properties.json` legend the
AEGIS admin auto-imports. It also ships standalone converters for inputs that aren't part
of the ESRI drop:

- [`grid/convert_lgrs.py`](esri-to-aegis-lunar-southpole/grid/) — raw LGRS GeoJSON → AEGIS
  mission-grid GeoJSON.
- [`timeaware/singleband_timeaware.py`](esri-to-aegis-lunar-southpole/timeaware/) —
  single-band time series → tiles + `manifest.json`.

See its [README](esri-to-aegis-lunar-southpole/README.md) for all data types, folder layout,
AEGIS import settings, and [`docs/LEGACY-COVERAGE.md`](esri-to-aegis-lunar-southpole/docs/LEGACY-COVERAGE.md)
(what was ported from the legacy `lunar_utils/aegis` package). General raster utilities
(`geotiff_to_cog`, `inspect_geotiff`, `raster_to_tiles`) live in its
[`common/`](esri-to-aegis-lunar-southpole/common/) folder.

### [`mercator/`](mercator/)

Mercator / global tiling for **non-polar / Earth** data (the counterpart to the south-pole
cap grid): `--body earth` → EPSG:3857 Web-Mercator tiles; `--body moon` → geodetic tiles.

```bash
pixi run python mercator/tile_mercator.py imagery.tif out_tiles --body earth
```
