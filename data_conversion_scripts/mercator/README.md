# mercator — Web-Mercator / global tiling (non-polar / Earth)

The non-polar counterpart to [`esri-to-aegis-lunar-southpole`](../esri-to-aegis-lunar-southpole/)
(which tiles onto the lunar south-pole *cap grid*). Use this for **Earth** missions or
**global / non-polar Moon** datasets. South-pole products should still go through the
cap-grid pipeline.

```bash
cd data_conversion_scripts
pixi run python mercator/tile_mercator.py imagery.tif out_tiles --body earth
pixi run python mercator/tile_mercator.py moon_global.tif out_tiles --body moon --zoom 0-7
```

| `--body`        | Projection                | Profile      | Notes                                              |
| --------------- | ------------------------- | ------------ | -------------------------------------------------- |
| `earth` (default) | reproject to **EPSG:3857** | `mercator` | Standard Web-Mercator tiles.                       |
| `moon`          | as-is (lon/lat)           | `geodetic`   | gdal2tiles' `mercator` profile assumes Earth, so the Moon uses an equirectangular global layout. |

Ported from the `_tile_earth` path of `lunar_utils/aegis/tiling.py`. Reprojection uses
`gdal.Warp`; tiling reuses
[`../esri-to-aegis-lunar-southpole/common/raster_to_tiles.py`](../esri-to-aegis-lunar-southpole/common/raster_to_tiles.py)
(a thin `gdal2tiles` wrapper) — no vendored tiling scripts. As in the legacy code, if
`gdal2tiles` rejects non-8-bit input the raster is rescaled to Byte and tiling is retried.

GDAL / `gdal2tiles` are provided by **pixi/conda-forge** — no system GDAL install required.
Runs under the shared [`../pyproject.toml`](../pyproject.toml) pixi environment.
