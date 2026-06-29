# grid — LGRS → AEGIS mission-grid GeoJSON

Converts a "raw" Lunar Grid Reference System (LGRS) GeoJSON into the AEGIS mission-grid
GeoJSON the admin ingests at `/admin/mission_grid/<id>` (`src/components/admin/gridUpload.tsx`).

```bash
cd data_conversion_scripts
pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py raw_grid.geojson -o out_dir
# → out_dir/Cleaned_raw_grid.geojson
```

## Source data (what is the input?)

A `.geojson` of an LGRS grid **exported from ESRI/ArcGIS with "Output as WGS84"**. It
provides:

- one **Polygon** (or line) feature per grid-cell edge, with vertex index 0 = the cell's
  bottom-left corner (the label anchor AEGIS uses);
- a full-length **`LGRS_ACC`** attribute per feature (the column may be named `LGRS_ACC`,
  `LGRS`, or `ACC`);
- a centre-Y attribute in metres (**`centY`** or `cent_Y_LPS`) that steps by the grid
  interval each new row — used to detect row/column boundaries.

## AEGIS output contract

`FeatureCollection` with top-level `type`, `name`, `crs`, `row_total`, `column_total`, and
one **Point** feature per cell with properties `id`, `LGRS_ACC`, `L_coord`, `R_coord`,
`row`, `column`. Rules (ported faithfully):

- `LGRS_ACC` truncated to its last 4 chars, split into `L_coord` / `R_coord`
  (100 m grids = 6-char → "M9"/"Q9"; 1 km grids = 5-char → "L"/"J");
- blank `L_coord`/`R_coord` on the last point before a new row;
- `row_total` / `column_total` = max index + 1.

## Improvement vs legacy

The legacy `lunar_utils/aegis/grid/convert_lgrs.py` depended on `geopandas` + `tqdm`. Since
the input is already WGS84 GeoJSON and the output is GeoJSON (no reprojection), this port
uses the **standard library only**. The legacy `--shp` shapefile output (whose only user was
geopandas) is dropped.
