# timeaware — single-band time-series → tiles + manifest

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
