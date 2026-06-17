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

### `mosaic_rasters.py` — Mosaic many overlapping frames → one raster/VRT

Merges many overlapping single-band GeoTIFF frames (e.g. 126 LROC NAC SfS ortho frames) into one
seamless mosaic, nodata-aware. The default output is a tiny **VRT** that the stretch step reads
directly — no multi-GB intermediate. Pass `--materialize` to write a real GeoTIFF.

Requires GDAL CLIs (`gdalbuildvrt` / `gdal_translate`) on PATH — run via `pixi run` on machines
without system GDAL (see `SITE_A03MP026-MONS-MOUTON-PLATEAU.md` §4.2.1).

```bash
# VRT mosaic (preferred), excluding mm2-* QA rasters (excluded by default):
pixi run python mosaic_rasters.py \
    ../../aegis_static/A03MP026_SFS_1mpp_orthoimages \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \
    --glob "M*-map.tif" --nodata -3.4e38

# Materialised GeoTIFF instead of a VRT:
pixi run python mosaic_rasters.py <in_dir> <out.tif> --glob "M*-map.tif" \
    --nodata -3.4e38 --materialize
```

### `stretch_to_8bit.py` — Float radiance → single-band 8-bit grayscale

Percentile-stretches a float raster (radiance/reflectance) to a display-ready single-band 8-bit
grayscale GeoTIFF, reserving `0` as transparent nodata. Samples a decimated histogram for the cut
values (never reads the whole mosaic) and can read a `.vrt` mosaic directly. Uses rasterio's bundled
GDAL, so it runs under `uv run` **or** `pixi run` with no GDAL CLI.

```bash
uv run python stretch_to_8bit.py \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif \
    --pct-low 2 --pct-high 98 --nodata -3.4e38

# Explicit cut values instead of percentiles:
uv run python stretch_to_8bit.py in.vrt out.tif --min 0.0 --max 0.07
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

### Mosaic + Stretch + Tile Many Frames (e.g. A03MP026 NAC SfS ortho)

For a drop of many overlapping float radiance frames that must become one displayable imagery layer.
The mosaic/stretch/tile steps need GDAL CLIs — run them via `pixi run` if there's no system GDAL
(see `SITE_A03MP026-MONS-MOUTON-PLATEAU.md` §4.2.1).

```bash
# 1. Mosaic the frames into a VRT (exclude QA rasters; mm2-* excluded by default)
pixi run python mosaic_rasters.py \
    ../../aegis_static/A03MP026_SFS_1mpp_orthoimages \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \
    --glob "M*-map.tif" --nodata -3.4e38

# 2. Stretch radiance → single-band 8-bit grayscale (reads the VRT directly)
uv run python stretch_to_8bit.py \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif \
    --pct-low 2 --pct-high 98 --nodata -3.4e38

# 3. Tile the 8-bit mosaic into a PNG pyramid (Leaflet production imagery)
pixi run python raster_to_tiles.py \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif \
    ../../aegis_static/processed/A03MP026/Layers/nac_sfs_ortho \
    --profile raster

# 4. DEM for elevation/slope (single GeoTIFF for demFilePath, not a layer)
uv run python geotiff_to_cog.py \
    ../../aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --compress zstd \
    -o ../../aegis_static/processed/A03MP026/Data/DEM/sfs_dem_1mpp.tif

# 5. Landing ellipse shapefile → GeoJSON (EPSG:4326)
uv run python shp_to_geojson.py \
    ../../aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    ../../aegis_static/processed/A03MP026/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326

# 6. Inspect outputs; read back the pyramid z=0 resolution for projResUnitsPerPixel
uv run python inspect_geotiff.py \
    ../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif
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
