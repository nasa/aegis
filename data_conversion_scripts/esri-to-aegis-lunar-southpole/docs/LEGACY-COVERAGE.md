# Legacy coverage — `lunar_utils/aegis` → this pipeline

This pipeline (pixi-based, no system binaries) supersedes the legacy
`../../../lunar_utils/lunar_utils/aegis` package. This table records what was ported, where
it lives now, and what was intentionally left behind — so "did we miss anything?" stays
answered.

## Ported

| Legacy module | AEGIS use-case | Now lives in | Notes |
| --- | --- | --- | --- |
| `grid/convert_lgrs.py` | Mission-grid (LGRS) GeoJSON upload | [`grid/convert_lgrs.py`](../grid/) | Reimplemented with the **standard library** (dropped geopandas/tqdm). `--shp` output removed. |
| `timeaware/singleband_timeaware_raster.py` + `timemanifest.py` | Time-aware tile layers + `manifest.json` | [`timeaware/singleband_timeaware.py`](../timeaware/) | Tiling now via `common/tile_to_cap_grid.py`; single-band check via rasterio; **robust** datetime parsing. |
| `products.py` | DEM-derived slope/hillshade/aspect/TRI | [`products/dem_products.py`](../products/) | Same `gdal.DEMProcessing` engine, now from pixi GDAL. RGBA output (alpha band) instead of `noData=0,0,0`. |
| `properties.py` | Per-layer `properties.json` + legend | [`properties/write_properties.py`](../properties/) | Output trimmed to the schema-allowed keys (`additionalProperties:false`). `tiff_manager` coupling dropped. |
| `default_color_ramps/` (+ `ARCHIVE/`) | Built-in colour treatment (fallback) | [`products/default_color_ramps/`](../products/default_color_ramps/) | Copied verbatim; renamed from `color_ramps/` → `default_color_ramps/`. Used only when no `.lyrx` is delivered. `slope.txt` confirmed identical to the MS3 `AMPES_Slope 1.lyrx`. |
| (new) `.lyrx` → gdaldem ramp | Use GIS-delivered symbology directly | [`products/lyrx_to_ramp.py`](../products/) | Converts an ArcGIS `CIMRasterClassifyColorizer` to a `gdaldem color-relief` ramp; `dem_products.py` `--*-lyrx` and the `slope`/`products` steps use it instead of the fallback ramp. |
| `client.py` (AEGIS REST client) | Register mission/layers/sublayers/grid over HTTP | [`aegis_api.py`](../aegis_api.py) + [`register.py`](../register.py) | New: `POST /api/v1/{missionAutomerge/fields,layer,sublayer,grid}`. Replaces admin "import from file". |
| Box upload | Zip + upload the built mission to Box | [`box_publish.py`](../box_publish.py) | Ported from `lunar_utils/box_client.py` (legacy `boxsdk` CCG auth); parallel zip + upload. |
| `tiling.py` `_tile_earth` (EPSG:3857) | Earth / non-polar tiling | [`../../mercator/tile_mercator.py`](../../mercator/) | Reuses `common/raster_to_tiles.py` (`gdal2tiles`). Adds a `--body moon` geodetic mode. |

## Already covered before this work

| Legacy concern | Equivalent here |
| --- | --- |
| `tiling.py` `_tile_sps` (lunar SPS tiling) | `common/tile_to_cap_grid.py` (pure rasterio cap grid) |
| DEM → COG, raster inspection | `common/geotiff_to_cog.py`, `common/inspect_geotiff.py` |
| GIS-delivered slope colorize (`.lyrx`) | `slope/colorize_slope.py` |

## Intentionally NOT ported

| Legacy item | Why |
| --- | --- |
| `gdal2tiles.py` / `gdal2customtiles.py` (vendored, ~180 KB each) | Replaced by `common/tile_to_cap_grid.py` (south pole) and pixi's GDAL `gdal2tiles` (mercator). No vendored scripts to maintain. |
| `error.py` (`GDAL2TilesError`) | Only used by the vendored tilers. |
| `viewshed` / `geounits` / `wac` generators | No generator existed in legacy either (only descriptions/ramps). Descriptions are kept in `properties/write_properties.py`; `viewshed.txt` / comm-mask ramps are kept in `products/default_color_ramps/`. |

## Verified

- Slope colour standard: legacy `slope_color11_blue.txt` == MS3 `AMPES_Slope 1.lyrx` (same
  11 bins). DEM-derived slope and GIS-delivered slope render identically.
- `properties.json` output conforms to `.local/schemas/sublayerImportable.json`.
- `convert_lgrs.py` output matches `gridUpload.tsx`'s `GridGeoJson` shape.
- `tile_to_cap_grid.py` now honours a real alpha band, so colorized products whose colour
  has red=0 (e.g. the darkest TRI class `rgb(0,38,115)`) are no longer clipped to transparent.
