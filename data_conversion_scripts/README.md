# AEGIS Data Conversion Scripts

Utilities for converting geospatial data into formats suitable for AEGIS map rendering (OpenLayers).

## Setup

These scripts use [uv](https://docs.astral.sh/uv/) for dependency management. No virtual environment setup required — `uv run` handles it automatically.

```bash
cd data_conversion_scripts
```

## Scripts

### `inspect_geotiff.py` — Inspect a GeoTIFF

Quick summary of a GeoTIFF's properties: dimensions, CRS, compression, overviews, pixel values.
Use this first to understand what you're working with.

```bash
uv run python inspect_geotiff.py <input.tif>
```

### `geotiff_to_cog.py` — GeoTIFF → Cloud Optimized GeoTIFF (COG)

Converts a raw GeoTIFF to a COG with internal tiling, overviews, and compression.
COGs can be served directly to `ol/source/GeoTIFF` via HTTP Range requests — no tile server needed.

```bash
# Default (ZSTD lossless):
uv run python geotiff_to_cog.py <input.tif>

# JPEG lossy (smallest file, good for visual imagery):
uv run python geotiff_to_cog.py <input.tif> --compress jpeg

# Custom output path:
uv run python geotiff_to_cog.py <input.tif> -o <output_cog.tif>
```

**When to use COG vs raster tiles:** COGs are simpler (one file, no tile pyramid) and work well
for moderate-size rasters. For very large imagery (>10 GB) or when you need pixel-perfect zoom
control, use `raster_to_tiles.py` instead.

### `raster_to_tiles.py` — GeoTIFF → TMS Raster Tile Pyramid

Generates a standard TMS tile directory with `tilemapresource.xml` using `gdal2tiles`.
This is the **standard pipeline for new AEGIS missions** (tile_grid_version = 2).

Requires GDAL on PATH (install via `brew install gdal`, `apt install gdal-bin`, or use the `aegis/gdal` Docker image).

```bash
# Lunar south pole (custom projection) — 'raster' profile:
uv run python raster_to_tiles.py \
    ../../aegis_static/missions/25/NAC_merge.tif \
    ../../aegis_static/missions/25/tiles \
    --profile raster

# Earth mission (Web Mercator) — 'mercator' profile:
uv run python raster_to_tiles.py \
    ../../aegis_static/missions/4/imagery.tif \
    ../../aegis_static/missions/4/tiles \
    --profile mercator --zoom 0-17
```

**Important:** Do NOT post-process or reorganise tiles after generation. The `tilemapresource.xml`
and tile layout must stay consistent. See `TILESET-MIGRATION-STRATEGY.md`.

### `MS3/NAC_processing/build_nac_layer_pyramids.py` — NAC frames → per-frame layer pyramids

Builds one AEGIS-importable PNG/TMS layer pyramid per LROC NAC frame. Each `M*-map.tif` frame is
contrast-stretched independently by `MS3/NAC_processing/stretch_to_8bit.py`, then tiled with
`MS3/tile_to_cap_grid.py` onto the shared south-pole cap grid (`projResUnitsPerPixel = 12800`).

```bash
pixi run python MS3/NAC_processing/build_nac_layer_pyramids.py \
    ../../aegis_static/A03MP026_SFS_1mpp_orthoimages \
    ../../aegis_static/missionFiles/64/Layers
```

### `MS3/NAC_processing/stretch_to_8bit.py` — NAC float radiance → 8-bit grayscale

Percentile-stretches one float NAC frame to a display-ready single-band 8-bit grayscale GeoTIFF,
reserving `0` as transparent nodata. This is normally called by `build_nac_layer_pyramids.py`.

```bash
uv run python MS3/NAC_processing/stretch_to_8bit.py in.tif out_8bit.tif \
    --pct-low 2 --pct-high 98 --nodata -3.4e38
```

### `shp_to_geojson.py` — Shapefile → GeoJSON (reproject + attributes)

Converts a shapefile to a GeoJSON FeatureCollection, reprojecting to EPSG:4326 and carrying all
attributes into `feature.properties`. AEGIS loads the result as a `"vector"` sublayer with
`new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "IAU2000:30166" })`.

Needs `fiona` + `pyproj` (both in `pyproject.toml`; or pass `--with` to `uv run`):

```bash
uv run python shp_to_geojson.py \
    ../../aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    ../../aegis_static/processed/A03MP026/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326
```

### `verify_dem_units.py` — Check if a DEM is in meters or scaled (×1000)

**Optional helper.** Compares samples of a candidate DEM against a known-good reference DEM at a
lon/lat to detect whether the candidate was scaled (e.g. ×1000). Reports the ratio/offset and can
emit a scale-corrected COG with `--emit-corrected`. Not needed for the baseline A03MP026 mission
(AEGIS uses only the 1 mpp DEM); run only if a 5 mpp DEM display overlay is wanted.

```bash
uv run python verify_dem_units.py \
    --reference ../../aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --candidate ../../aegis_static/A03MP026/DEM/SiteUD1_5mpp_scaled.tif \
    --lat -84.223397 --lon 33.5021945
```

### `arcgis_compact_cache_v2_to_pmtiles.py` — ArcGIS Bundles → PMTiles

Extracts vector tiles from ArcGIS CompactV2 `.bundle` files into a PMTiles archive.
Embeds ESRI tile grid metadata (`root.json`) into the PMTiles JSON metadata section.

```bash
uv run python arcgis_compact_cache_v2_to_pmtiles.py \
    ../../aegis_static/test/AggregatedContour/p12 \
    ../../aegis_static/test/AggregatedContour/extracted \
    --pmtiles ../../aegis_static/test/AggregatedContour/extracted/contours.pmtiles
```

**Flags:**

- `--pmtiles <path>` — override output PMTiles path (default: `<output_dir>/contours.pmtiles`)
- `--keep-gzip` — keep tiles gzip-compressed (default: decompress for direct serving)

## Typical Workflows

### New Lunar South Pole Mission

```bash
# 1. Inspect the source raster
uv run python inspect_geotiff.py source_imagery.tif

# 2. Generate tile pyramid (raster profile for custom projection)
uv run python raster_to_tiles.py source_imagery.tif tiles/ --profile raster

# 3. Upload tiles/ directory to S3
# 4. Set tile_grid_version = 2 in mission database
```

### New Earth Mission

```bash
# 1. Inspect the source raster
uv run python inspect_geotiff.py source_imagery.tif

# 2. Generate tile pyramid (mercator profile)
uv run python raster_to_tiles.py source_imagery.tif tiles/ --profile mercator

# 3. Upload tiles/ directory to S3
```

### Per-frame NAC layer pyramids (A03MP026)

For A03MP026, do not mosaic the NAC frames. Build one layer pyramid per frame under mission 64:

```bash
# 1. Build one cap-grid tile pyramid per NAC frame
pixi run python MS3/NAC_processing/build_nac_layer_pyramids.py \
    ../../aegis_static/A03MP026_SFS_1mpp_orthoimages \
    ../../aegis_static/missionFiles/64/Layers

# 2. DEM for elevation/slope (single GeoTIFF for demFilePath, not a layer)
uv run python geotiff_to_cog.py \
    ../../aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --compress zstd \
    -o ../../aegis_static/missionFiles/64/Data/sfs_dem_1mpp.tif

# 3. Landing ellipse shapefile → GeoJSON (EPSG:4326)
uv run python shp_to_geojson.py \
    ../../aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    ../../aegis_static/missionFiles/64/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326
```

### Convert Large Raster to COG (Alternative to Tiling)

```bash
# 1. Inspect
uv run python inspect_geotiff.py source.tif

# 2. Convert to COG
uv run python geotiff_to_cog.py source.tif --compress zstd

# 3. Upload single COG file to any static host with Range request support
# 4. Use ol/source/GeoTIFF + ol/layer/WebGLTile in OpenLayers
```

### Extract ArcGIS Vector Tile Cache

```bash
# 1. Extract bundles → PMTiles
uv run python arcgis_compact_cache_v2_to_pmtiles.py \
    path/to/arcgis_cache \
    output/ \
    --pmtiles output/tiles.pmtiles

# 2. Upload single .pmtiles file to static host
# 3. Use ol-pmtiles + custom TileGrid in OpenLayers
```
