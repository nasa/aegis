# MS3 — Mons Mouton Plateau (Mission 595) Data Processing

Scripts and runbook for producing AEGIS v1 serving products from the GIS data
drop for landing ellipse **A03MP026** (Mons Mouton Plateau, south pole Moon),
rendered into **AEGIS mission 595**.

For full background see
`src/components/interface/map/ol/docs/GIS-data-pipelines/SITE_A03MP026-MONS-MOUTON-PLATEAU.md`.

---

## Scripts in this folder

| Script                | Purpose                                                                        | Run with               |
| --------------------- | ------------------------------------------------------------------------------ | ---------------------- |
| `_main.py`            | **Pipeline runner** — run all steps or individual steps (see below)            | `pixi run`             |
| `tile_to_cap_grid.py` | Tile any raster onto the shared polar-cap grid (origin −931100, z0=8192)       | `pixi run`             |
| `mosaic_rasters.py`   | Merge 126 overlapping LROC NAC frames → VRT mosaic                             | `pixi run`             |
| `stretch_to_8bit.py`  | Percentile-stretch float radiance → single-band 8-bit GeoTIFF                  | `uv run` or `pixi run` |
| `colorize_slope.py`   | Parse `.lyrx` colour standard → 8-bit RGBA slope GeoTIFF (no temp `.txt` file) | `pixi run`             |
| `shp_to_geojson.py`   | Convert landing-ellipse shapefile → GeoJSON (EPSG:4326)                        | `uv run` or `pixi run` |
| `verify_dem_units.py` | _(optional)_ Check whether the 5 mpp DEM is meters or ×1000                    | `uv run` or `pixi run` |

The remaining pipeline steps reuse scripts from the parent `data_conversion_scripts/` folder:

| Script                  | Purpose                                                    | Run with               |
| ----------------------- | ---------------------------------------------------------- | ---------------------- |
| `../raster_to_tiles.py` | Tile a raster (data-corner grid) — **not used for step 3** | `pixi run`             |
| `../geotiff_to_cog.py`  | Re-emit the 1 mpp DEM as a clean GeoTIFF for `demFilePath` | `uv run` or `pixi run` |
| `../inspect_geotiff.py` | Sanity-check any output raster                             | `uv run` or `pixi run` |

---

## Pipeline runner — `_main.py`

`_main.py` orchestrates all steps. Must be run from the **parent `data_conversion_scripts/`
directory** via `pixi run`.

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

# Full pipeline (steps 0–6; steps 7 and 8 are opt-in)
pixi run python MS3/_main.py

# List all available steps
pixi run python MS3/_main.py --list

# Run specific steps
pixi run python MS3/_main.py --steps 1 2 3

# Resume from a specific step (runs that step through the end of the default set)
pixi run python MS3/_main.py --from 3

# Include the optional slope overlay (step 7)
pixi run python MS3/_main.py --steps 7

# Full pipeline including optional cleanup
pixi run python MS3/_main.py --steps 0 1 2 3 4 5 6 7 8
```

### Step reference

| #   | Name    | Description                                             | Optional |
| --- | ------- | ------------------------------------------------------- | -------- |
| 0   | stage   | Remove `.sr.lock` files; create output folders          |          |
| 1   | mosaic  | 126 NAC frames → VRT                                    |          |
| 2   | stretch | VRT → 8-bit grayscale GeoTIFF                           |          |
| 3   | tile    | 8-bit mosaic → PNG pyramid (`Layers/nac_sfs_ortho/`)    |          |
| 4   | dem     | 1 mpp SFS DEM → clean GeoTIFF (`Data/sfs_dem_1mpp.tif`) |          |
| 5   | ellipse | Shapefile → GeoJSON (`Data/a03mp026_ellipse.geojson`)   |          |
| 6   | inspect | Sanity-check outputs; print `tilemapresource.xml`       |          |
| 7   | slope   | Colorize + tile slope overlay (`Layers/slope_5mpp/`)    | ✓        |
| 8   | cleanup | Delete VRT scratch files                                | ✓        |

---

## One-time setup

Run from the **parent `data_conversion_scripts/` directory** — that is where `pixi install`
resolves the conda-forge env declared in `pyproject.toml`.

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

# Install the full geospatial stack (GDAL CLIs + Python bindings) via pixi/conda-forge.
# Do NOT `pixi add --pypi gdal/rasterio/fiona/pyproj` — those build from source and fail.
pixi install

# Sanity checks
pixi run gdal2tiles --version
pixi run python -c "import rasterio, fiona, pyproj; print('bindings OK')"
```

> **Run-tool rule:** Scripts that shell out to a GDAL CLI (`mosaic_rasters.py`,
> `raster_to_tiles.py`) **must** run under `pixi run` so `gdalbuildvrt` / `gdal2tiles`
> are on PATH. All other scripts use rasterio/fiona (Python bindings only) and work under
> either `pixi run` or `uv run`. Running everything under `pixi run` is simplest since
> that env is already resolved.

---

## Input data (on this workstation)

```
C:\Users\bfeist\code\aegis_static\
├── A03MP026\
│   ├── SFS_1mpp_DEM\mp2-sfs-dem_MoonSP_COG.tif   ← THE DEM (57840×41790, 1 m/px, float32)
│   ├── Ellipse_shapefile\A03MP026_Ellipse.shp      ← landing ellipse (1 polygon)
│   ├── DEM\SiteUD1_5mpp_scaled.tif                 ← not needed (baseline)
│   └── Slope\SiteUD1_final_adj_5mpp_slp.tif        ← optional slope overlay
└── A03MP026_SFS_1mpp_orthoimages\
    ├── M*LE-tile.5.2-map.tif   ← 64 LROC NAC left CCD frames (float32 radiance)
    ├── M*RE-tile.5.2-map.tif   ← 62 LROC NAC right CCD frames (float32 radiance)
    └── mm2-tile.5.2-*.tif      ← QA rasters (auto-excluded, not for display)
```

**Output root:** `C:\Users\bfeist\code\aegis_static\MissionFiles\595\`

> The 1 mpp DEM has already been copied to `MissionFiles\595\Data\mp2-sfs-dem_MoonSP_COG.tif`.
> Step 4 re-emits a clean copy as `Data\sfs_dem_1mpp.tif`. Use whichever path you set in
> `mission.demFilePath`.

---

## Step 0 — Stage & clean

```bash
# Remove ArcGIS "shared read" lock files (not data)
rm -f /c/Users/bfeist/code/aegis_static/A03MP026/Ellipse_shapefile/*.sr.lock

# Create output folders
mkdir -p /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers
mkdir -p /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data
```

---

## Step 1 — Mosaic the 126 NAC frames → VRT

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

pixi run python MS3/mosaic_rasters.py \
    /c/Users/bfeist/code/aegis_static/A03MP026_SFS_1mpp_orthoimages \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
    --glob "M*-map.tif" \
    --nodata -3.4e38
```

Selects the 126 `M*-map.tif` frames; the `mm2-*` QA rasters are excluded by the default
`--exclude mm2-` filter. Writes a tiny VRT (no multi-GB intermediate).

---

## Step 2 — Stretch radiance → 8-bit grayscale

```bash
pixi run python MS3/stretch_to_8bit.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif \
    --pct-low 2 --pct-high 98 \
    --nodata -3.4e38
```

Reads the VRT directly, samples a decimated histogram, maps the 2–98% range to `[1, 255]`, and
reserves `0` as transparent nodata. **Keep `nac_sfs_ortho_8bit.tif`** after tiling — it is the
one-command source for a future COG if/when OpenLayers reaches production.

---

## Step 3 — Tile the 8-bit mosaic → PNG pyramid (cap grid)

```bash
pixi run python MS3/_main.py --steps 3
# or directly:
pixi run python MS3/tile_to_cap_grid.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/nac_sfs_ortho
```

Tiles the ortho onto the **shared polar-cap grid** (origin −931100, z0=8192) so it overlays
the production `NAC_POLE_SOUTH_CM_AVG_MERGE` basemap. Result: 623 tiles at z0–13, indices
x 4006–4026 / y(TMS) 4206–4226. Takes ~6 s. Writes its own `tilemapresource.xml`.

See [`PROBLEM_nac-ortho-scale.md`](./PROBLEM_nac-ortho-scale.md) for the full investigation
of why `raster_to_tiles.py` cannot be used here.

---

## Step 4 — DEM → clean GeoTIFF for `demFilePath`

```bash
pixi run python geotiff_to_cog.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --compress zstd \
    -o /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data/sfs_dem_1mpp.tif
```

Sets up the elevation/slope source (not a rendered layer). In AEGIS:

- `mission.demFilePath` → `"Data/sfs_dem_1mpp.tif"`
- `mission.demResolution` → `1.0`

**Optional:** the DEM is already at `Data\mp2-sfs-dem_MoonSP_COG.tif`. Point `demFilePath` there
and skip this step if you prefer.

---

## Step 5 — Ellipse shapefile → GeoJSON

```bash
pixi run python MS3/shp_to_geojson.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326
```

Reprojects to EPSG:4326 and carries all attributes (`ellipse_id`, `diam_m`, `lat_deg`,
`lon_deg`, etc.). Load in AEGIS as a `"vector"` sublayer with
`dataProjection: "EPSG:4326"`, `featureProjection: "IAU2000:30166"`.

---

## Step 6 — Verify outputs

```bash
# Confirm CRS / extent of the 8-bit mosaic
pixi run python inspect_geotiff.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif

# Confirm the pyramid grid matches the cap (Origin = -931100, z0 = 8192.0):
cat /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/nac_sfs_ortho/tilemapresource.xml
```

---

## Step 7 _(optional)_ — Slope display overlay

Only needed if the team wants a pre-rendered slope colour overlay. AEGIS computes slope live from
the DEM, so this layer is for visual context only — it does **not** affect AEGIS slope numbers.

> **Colour standard:** The data drop included **no symbology** (no `.lyrx`, no embedded colour
> table). The GIS team supplied **`AMPES_Slope 1.lyrx`** on 2026-06-16. `colorize_slope.py`
> parses it directly — no intermediate `.txt` ramp file. The `.lyrx` must be in the same
> directory as the slope raster, or pass it explicitly with `--lyrx`.
>
> **Why two steps?** `gdal2tiles` refuses float32 input; `colorize_slope.py` converts first.

### Step 7a — Colorize (float32 → 8-bit RGBA)

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

pixi run python MS3/colorize_slope.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif
```

The script auto-detects `AMPES_Slope 1.lyrx` in the same folder as the slope raster.
To use a different `.lyrx`, add `--lyrx /path/to/file.lyrx`.

### Step 7b — Tile the RGBA result (cap grid)

```bash
pixi run python MS3/tile_to_cap_grid.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/slope_5mpp
```

The 5 mpp slope snaps to cap level z11 (4 m/px), so it overlays the basemap and the ortho
on the same cap grid (origin −931100, z0=8192). No `raster_to_tiles.py` — same reason as step 3.

### Step 7c — Remove intermediate _(optional)_

```bash
rm -f /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif
```

---

## Step 8 _(optional)_ — Clean up scratch files

```bash
# Remove the VRT + input list once tiling is complete (keep the 8-bit tif for a future COG)
rm -f /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
      /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.inputs.txt
```

---

## Expected output layout

```
MissionFiles/595/
├── Data/
│   ├── sfs_dem_1mpp.tif              # demFilePath (elevation/slope source)
│   ├── mp2-sfs-dem_MoonSP_COG.tif    # pre-existing copy (use either)
│   └── a03mp026_ellipse.geojson      # "vector" sublayer
├── Layers/
│   ├── nac_sfs_ortho/                # "tile" sublayer — PNG pyramid + tilemapresource.xml
│   └── slope_5mpp/                   # optional "tile" sublayer
└── nac_sfs_ortho_8bit.tif            # keep for a future COG (or delete)
```

---

## AEGIS mission 595 configuration

| Field                  | Value                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `landerLocation`       | `{ lat: -84.223397, lng: 33.5021945 }`                                                         |
| `planetRadius`         | `1737400`                                                                                      |
| `demFilePath`          | `"Data/sfs_dem_1mpp.tif"`                                                                      |
| `demResolution`        | `1.0`                                                                                          |
| `projIsCustom`         | `true`                                                                                         |
| `projEpsg`             | `"IAU2000:30166"`                                                                              |
| `projProj4String`      | `"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"` |
| `projBoundsMinX/MinY`  | `-931100`                                                                                      |
| `projBoundsMaxX/MaxY`  | `931100`                                                                                       |
| `projOriginX/OriginY`  | `-931100`                                                                                      |
| `projResZoomLevel`     | `0`                                                                                            |
| `projResUnitsPerPixel` | `8192` (z0 resolution of the shared cap grid — already set; no change needed)                  |

---

## Checklist

- [x] `pixi install` — sanity-check `pixi run gdal2tiles --version`
- [x] Step 0 — delete `*.sr.lock`; create output folders
- [x] Step 1 — mosaic → `nac_sfs_ortho_mosaic.vrt`
- [x] Step 2 — stretch → `nac_sfs_ortho_8bit.tif`
- [x] Step 3 — tile → `Layers/nac_sfs_ortho/` PNG pyramid (623 tiles, cap grid, origin −931100, z0–13)
- [ ] Step 4 — DEM → `Data/DEM/sfs_dem_1mpp.tif` (or use pre-existing `Data/mp2-sfs-dem_MoonSP_COG.tif`)
- [x] Step 5 — ellipse → `Data/a03mp026_ellipse.geojson`
- [ ] Step 6 — inspect outputs
- [ ] Step 7 _(optional)_ — slope overlay (`tile_to_cap_grid.py` → `Layers/slope_5mpp/`, snaps to z11)
- [ ] Step 8 _(optional)_ — delete scratch files
- [ ] Create AEGIS mission 595 `"tile"` sublayer for the ortho (path `nac_sfs_ortho`, tileFormat `tms`, zoom 0–13)
- [ ] Validate in Leaflet production; spot-check elevation profile at ellipse centre
