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
