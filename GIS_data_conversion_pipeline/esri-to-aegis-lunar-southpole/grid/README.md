# grid — LGRS → AEGIS mission-grid GeoJSON

Produces the AEGIS mission-grid GeoJSON (the same shape the admin ingests at
`/admin/mission_grid/<id>` via `src/components/admin/gridUpload.tsx`).

```
lander coords ──▶ generate_lgrs.py ──▶ raw GeoJSON ──▶ convert_lgrs.py ──▶ AEGIS GeoJSON
```

> **In the pipeline this is automated.** `main.py`'s `grid` step runs both scripts (default
> 10 km @ 100 m around `--lander-lat/--lander-lng`) → `grid_source.geojson`, and the
> `register` step POSTs it to `POST /api/v1/grid` as the **active** grid (the server writes
> the coordinates to `Data/<name>.json` and sets the mission's `activeGridUuid`) — no manual
> admin upload. The standalone usage below is for running the scripts directly.

## Quick start

```bash
cd data_conversion_scripts

# 1. Generate the raw LGRS grid from lander coordinates.
pixi run python esri-to-aegis-lunar-southpole/grid/generate_lgrs.py \
    --lat -84.8 --lng 0 --extent 10km --precision 100 -o raw_grid.geojson

# 2. Convert to AEGIS mission-grid GeoJSON.
pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py raw_grid.geojson -o out_dir
# → out_dir/Cleaned_raw_grid.geojson
```

Then upload `Cleaned_*.geojson` in the AEGIS admin.

## Step 1 — `generate_lgrs.py`

Generates a raw LGRS grid GeoJSON from **lander coordinates** using the USGS/SETI
[`lgrs`](https://github.com/rbeyer/lgrs) package. No ArcGIS or GIS-team export required.

| Flag            | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `--lat`/`--lng` | Lander location in degrees (required).                                          |
| `--extent`      | Square grid extent centred on the lander (e.g. `10km`, `500m`; default `10km`). |
| `--precision`   | Cell size in metres (default `100`).                                            |
| `-o/--out`      | Output raw GeoJSON path.                                                        |

Calls `lgrs.write_grid(..., acc=True)` over a Lunar Polar Stereographic (metres) bounding
box, reprojects cell corners to lon/lat, and emits one Polygon feature per cell with:

- **`LGRS_ACC`** — the full grid reference string (e.g. `"AZUZ4F3"`);
- **`L_coord`** / **`R_coord`** — the ACC condensed easting/northing halves (e.g. `Z4`/`F3`),
  which AEGIS displays as the cell label `"L_coord R_coord"`;
- **`centY`** — cell-centre northing in metres, used by `convert_lgrs.py` to detect row
  boundaries;
- vertex 0 = cell's bottom-left corner (the label anchor AEGIS uses).

`lgrs` and `geopandas` are provided by the pixi environment, so run this step under `pixi run`.

> **Alternate input:** a hand-export from ESRI/ArcGIS with "Output as WGS84" is also
> accepted by `convert_lgrs.py` — both inputs satisfy the same contract.

## Step 2 — `convert_lgrs.py`

Converts the raw GeoJSON from Step 1 into the shape AEGIS expects. Uses the standard
library only (no geo stack needed — the input is already WGS84 GeoJSON).

**Input contract** — one Polygon/line feature per cell with:

- vertex 0 = bottom-left corner;
- `LGRS_ACC` (or `LGRS` or `ACC`) — full LGRS grid reference;
- `centY` (or `cent_Y_LPS`) — centre northing in metres;
- `L_coord`/`R_coord` pre-split (supplied by `generate_lgrs.py`) or absent (derived by
  truncating `LGRS_ACC`).

**Output contract** — `FeatureCollection` with top-level `type`, `name`, `crs`,
`row_total`, `column_total`, and one **Point** feature per cell with properties `id`,
`LGRS_ACC`, `L_coord`, `R_coord`, `row`, `column`:

- `L_coord` = ACC easting label, `R_coord` = ACC northing label (e.g. `U9`/`A8` at 100 m,
  `U`/`A` at 1 km);
- blank `L_coord`/`R_coord` on the last point before each new row (AEGIS requirement);
- `row_total` / `column_total` = max index + 1.
