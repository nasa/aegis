# RESOLVED — NAC frames on the cap grid (Mission 64 / A03MP026)

**Status:** resolved and reflected in the current per-frame pipeline.

The current MS3 pipeline no longer builds a NAC mosaic. Each `M*-map.tif` frame is stretched and tiled independently into its own AEGIS layer folder under:

```text
F:\_repos\aegis_static\missionFiles\64\Layers\<frame-stem>\
```

## Constraint

AEGIS production currently uses Leaflet. Leaflet builds one custom-CRS resolution pyramid per mission, not per layer. Therefore every raster layer for this mission must be cut on the mission's shared lunar south-pole cap grid:

- `projOriginX = -931100`
- `projOriginY = -931100`
- `projResZoomLevel = 0`
- `projResUnitsPerPixel = 12800`
- `projBoundsMinX/Y = -931100`
- `projBoundsMaxX/Y = 931100`

## Data-side fix

Use `MS3/tile_to_cap_grid.py` for every rendered raster layer. It:

1. builds a temporary full-cap VRT at the nearest cap resolution,
2. restricts GDAL tiling to the data footprint's tile window,
3. writes TMS tiles whose indices match the mission's Leaflet grid,
4. emits `tilemapresource.xml` with full-cap `BoundingBox` and `Origin`.

The full-cap `BoundingBox` is intentional. AEGIS passes `sublayer.boundingBox` to Leaflet's tile-layer `bounds` option, which Leaflet treats as lat/lng. A tight projected-metre data footprint gates out all tiles; the full cap matches existing working polar layers.

## Current NAC workflow

The per-frame NAC workflow is implemented in:

```text
data_conversion_scripts/MS3/NAC_processing/build_nac_layer_pyramids.py
```

For every `M*-map.tif` frame it runs:

```text
MS3/NAC_processing/stretch_to_8bit.py
MS3/tile_to_cap_grid.py
```

No mosaic VRT or `nac_sfs_ortho` layer is produced.

## Verification target

For each generated NAC layer folder:

- `tilemapresource.xml` should contain `Origin x="-931100..." y="-931100..."`.
- `TileSet order="0"` should have `units-per-pixel="12800..."`.
- `BoundingBox` should be the full cap: `-931100 ... 931100`.

These values allow imported per-frame tile layers to render in Leaflet and remain compatible with OpenLayers tile rendering.
