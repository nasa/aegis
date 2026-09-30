# timeaware — time-series layers + manifests

Tiles a directory of single-band time-series rasters (e.g. illumination over a lunar day)
onto the south-pole cap grid and writes the `manifest.json` AEGIS reads for time-aware
layers (`loadManifestFromFile` in `src/components/admin/layerSublayerEdit.tsx`).

```bash
cd GIS_data_conversion_pipeline
pixi run python esri-to-aegis-lunar-southpole/timeaware/singleband_timeaware.py \
    /path/to/illum_frames --datatype mazarico -o /path/to/output

# manifest only (skip tiling)
pixi run python esri-to-aegis-lunar-southpole/timeaware/singleband_timeaware.py \
    /path/to/illum_frames --datatype quickmap --no-tile
```

## Output layout

```text
<out>/<indir.stem>_singleband_time-aware_data/
├── manifest.json            # { time_layers: [ { datetime: <ISO-8601>, dirName }, … ] }
├── tilemapresource.xml      # shared cap grid (lifted from the first frame)
├── <frame-1-stem>/ {z}/{x}/{y}.png
├── <frame-2-stem>/ {z}/{x}/{y}.png
└── …
```

AEGIS derives per-frame time _ranges_ itself (midpoints between adjacent frames), so the
manifest only needs `datetime` + `dirName`. **Only one time-based sublayer is allowed per
mission** (enforced by the admin).

## Nested COG time layers

[`timeaware_cogs.py`](timeaware_cogs.py) produces one temporal layer whose frame assets are
deflate COGs rather than tile pyramids. It accepts multiple source directories so disconnected
windows can live in one AEGIS layer without asking the user to choose a scenario layer.

```bash
cd GIS_data_conversion_pipeline
pixi run python esri-to-aegis-lunar-southpole/main.py \
  --mission-id 50 \
  --in-time-cog-dir /drop/window-a \
  --in-time-cog-dir /drop/window-b \
  --out-time-cog temporal_raster \
  --time-cog-datatype mazarico \
  --time-cog-illumination-alpha \
  --steps time-cogs
```

```text
Layers/temporal_raster/
├── manifest.json
├── properties.json
├── window-a/
│   └── <frame>_cog.tif
└── window-b/
  └── <frame>_cog.tif
```

Every input frame must share width, height, band count, CRS, and affine transform. By default,
the COG processor preserves source values and nodata; it does not apply the single-band display
stretch used by the legacy tile converter.

For illumination fractions, pass `--time-cog-illumination-alpha`. The processor writes black
RGBA pixels with alpha $1 - \text{illumination}$, directly preserving the delivered visible-flux
fraction: fully shadowed pixels are opaque, fully illuminated pixels are transparent, and partial
illumination stays partially transparent. Nodata pixels are transparent. Omit the option for
generic time rasters whose source values must be retained unchanged.

The COG manifest uses `dirName` as a relative `.tif` target and writes `lowerBound` / `upperBound`
for every frame. Bounds are computed within each source directory, so the layer is hidden between
disconnected observation windows instead of extending a frame across the gap. Existing manifests
with tile-directory `dirName` values and no explicit bounds keep their midpoint-based behavior.

## Filename datetime formats (`--datatype`)

- **mazarico** — a 12-digit `YYMMDDHHMMSS` token in the filename.
- **quickmap** — `MM_DD_YYYY_HH` (four underscore-joined tokens).

The parser scans tokens for the first that matches (robust to extra prefix/suffix tokens)
and errors clearly if none do — replacing the fragile fixed-index slicing in the legacy
`lunar_utils/aegis/timeaware/singleband_timeaware_raster.py`.

## Notes

- Tiling reuses [`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) (pure
  rasterio, cap grid) — not the vendored `gdal2customtiles`.
- Non-8-bit frames are linearly rescaled to 1–255 (0 = transparent nodata) **per frame**.
  For cross-frame visual comparability you may want a fixed scale instead — adapt
  `to_8bit_if_needed` if needed.
- Both formats share the same `manifest.json` entry point. AEGIS selects a COG only when the
  resolved `dirName` ends in `.tif` or `.tiff`; legacy tile-directory layers remain supported.
