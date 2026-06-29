# dem

DEM processing has no special-case script — it is simply a **clean Cloud-Optimised
GeoTIFF re-emit** of the delivered DEM, so it reuses the general raster tool in
[`../common/geotiff_to_cog.py`](../common/geotiff_to_cog.py).

The output (`<out>/Data/dem.tif`) is the mission **`demFilePath`** elevation source —
it is *not* a tile layer.

Driven by the `dem` step in [`../main.py`](../main.py):

```bash
pixi run python ../common/geotiff_to_cog.py <dem_in>.tif --compress zstd -o <out>/Data/dem.tif
```

For the A03MP026 drop the input is `A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif`
at 1 m/px (`demResolution = 1.0`). Override the input with `main.py --dem <path>`.
