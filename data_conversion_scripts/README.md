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

See its [README](esri-to-aegis-lunar-southpole/README.md) for the four data types,
folder layout, and AEGIS import settings. General raster utilities
(`geotiff_to_cog`, `inspect_geotiff`, `raster_to_tiles`) live in its
[`common/`](esri-to-aegis-lunar-southpole/common/) folder.
