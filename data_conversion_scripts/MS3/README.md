# MS3 — Mons Mouton Plateau (Mission 64) Data Processing

Scripts and runbook for producing AEGIS v1 serving products from the GIS data
drop for landing ellipse **A03MP026** (Mons Mouton Plateau, south pole Moon),
rendered into **AEGIS mission 64**.

The current production target is **Leaflet**, so the raster output is one
PNG/TMS layer pyramid per NAC frame on the shared south-pole cap grid
(origin `-931100`, `projResUnitsPerPixel = 12800`).

---

## Scripts in this folder

| Script                                       | Purpose                                                       | Run with               |
| -------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| `_main.py`                                   | Pipeline runner for mission 64                                | `pixi run`             |
| `tile_to_cap_grid.py`                        | Tile any raster onto the shared polar-cap grid (`z0 = 12800`) | `pixi run`             |
| `colorize_slope.py`                          | Parse `.lyrx` color standard to 8-bit RGBA slope GeoTIFF      | `pixi run`             |
| `shp_to_geojson.py`                          | Convert landing-ellipse shapefile to GeoJSON (`EPSG:4326`)    | `uv run` or `pixi run` |
| `NAC_processing/build_nac_layer_pyramids.py` | Stretch and tile each NAC frame into its own layer folder     | `pixi run`             |
| `NAC_processing/stretch_to_8bit.py`          | Percentile-stretch one NAC frame to single-band 8-bit GeoTIFF | `uv run` or `pixi run` |

Parent-folder scripts still reused:

| Script                  | Purpose                                                    | Run with               |
| ----------------------- | ---------------------------------------------------------- | ---------------------- |
| `../geotiff_to_cog.py`  | Re-emit the 1 mpp DEM as a clean GeoTIFF for `demFilePath` | `uv run` or `pixi run` |
| `../inspect_geotiff.py` | Sanity-check raster outputs                                | `uv run` or `pixi run` |

---

## Pipeline runner — `_main.py`

Run from the parent `data_conversion_scripts/` directory:

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

# Default pipeline
pixi run python MS3/_main.py

# List steps
pixi run python MS3/_main.py --list

# Run selected steps
pixi run python MS3/_main.py --steps 0 1 4

# Optional slope overlay
pixi run python MS3/_main.py --steps 5
```

### Step reference

| #   | Name    | Description                                                 | Optional |
| --- | ------- | ----------------------------------------------------------- | -------- |
| 0   | stage   | Remove `.sr.lock` files; create output folders              |          |
| 1   | nac     | Stretch each NAC frame and tile it to its own layer pyramid |          |
| 2   | dem     | 1 mpp SFS DEM to clean GeoTIFF                              |          |
| 3   | ellipse | Shapefile to GeoJSON                                        |          |
| 4   | inspect | Summarize generated NAC layer pyramids                      |          |
| 5   | slope   | Colorize and tile slope overlay                             | ✓        |

---

## Input data

```text
C:\Users\bfeist\code\aegis_static\
├── A03MP026\
│   ├── SFS_1mpp_DEM\mp2-sfs-dem_MoonSP_COG.tif
│   ├── Ellipse_shapefile\A03MP026_Ellipse.shp
│   └── Slope\SiteUD1_final_adj_5mpp_slp.tif
└── A03MP026_SFS_1mpp_orthoimages\
    ├── M*LE-tile.5.2-map.tif
    ├── M*RE-tile.5.2-map.tif
    └── mm2-tile.5.2-*.tif
```

## Output root

`F:\_repos\aegis_static\missionFiles\64\Layers`

Each NAC frame becomes its own layer folder named after the source stem, for example:

```text
F:\_repos\aegis_static\missionFiles\64\Layers\M1409412744RE-tile.5.2-map\
```

---

## Per-frame NAC process

The final understanding of the source imagery is:

- The `M*-map.tif` files are already orthorectified, single-band float32 NAC frames.
- They do **not** need to be mosaicked for the current mission goal.
- Each frame can stand alone as an importable AEGIS tile layer.
- Each frame still needs its own contrast stretch before tiling.
- Each frame must be tiled on the shared cap grid so it overlays the Leaflet basemap.

The per-frame pipeline is:

1. Discover all `M*-map.tif` frames, excluding `mm2-*` QA rasters.
2. Stretch each frame independently with `NAC_processing/stretch_to_8bit.py` using the default `2–98%` cut.
3. Tile the stretched frame with `tile_to_cap_grid.py`.
4. Write the layer pyramid to `missionFiles/64/Layers/<frame-stem>/`.

This preserves the original NAC frame boundaries and gives AEGIS one importable tile layer per frame.

---

## Commands

### Step 0 — Stage

```bash
mkdir -p /f/_repos/aegis_static/missionFiles/64/Layers
mkdir -p /f/_repos/aegis_static/missionFiles/64/Data
```

### Step 1 — Build all NAC layer pyramids

```bash
pixi run python MS3/NAC_processing/build_nac_layer_pyramids.py \
    /f/_repos/aegis_static/A03MP026_SFS_1mpp_orthoimages \
    /f/_repos/aegis_static/missionFiles/64/Layers
```

### Step 2 — DEM

```bash
pixi run python geotiff_to_cog.py \
    /f/_repos/aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --compress zstd \
    -o /f/_repos/aegis_static/missionFiles/64/Data/sfs_dem_1mpp.tif
```

### Step 3 — Ellipse

```bash
pixi run python MS3/shp_to_geojson.py \
    /f/_repos/aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    /f/_repos/aegis_static/missionFiles/64/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326
```

### Step 4 — Inspect

```bash
pixi run python MS3/_main.py --steps 4
```

### Step 5 — Optional slope overlay

```bash
pixi run python MS3/colorize_slope.py \
    /f/_repos/aegis_static/A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif \
    /f/_repos/aegis_static/missionFiles/64/slope_5mpp_rgba.tif

pixi run python MS3/tile_to_cap_grid.py \
    /f/_repos/aegis_static/missionFiles/64/slope_5mpp_rgba.tif \
    /f/_repos/aegis_static/missionFiles/64/Layers/slope_5mpp
```

---

## Expected output layout

```text
missionFiles/64/
├── Data/
│   ├── sfs_dem_1mpp.tif
│   └── a03mp026_ellipse.geojson
└── Layers/
    ├── M1409412744RE-tile.5.2-map/
    ├── M1409412744LE-tile.5.2-map/
    ├── ... one folder per NAC frame ...
    └── slope_5mpp/                  # optional
```

---

## AEGIS mission settings

Use the existing south-pole mission projection values:

- `projOriginX = -931100`
- `projOriginY = -931100`
- `projResZoomLevel = 0`
- `projResUnitsPerPixel = 12800`
- `projEpsg = "IAU2000:30166"`

For Leaflet, each NAC layer should be imported as a separate `tile` sublayer whose path points at:

```text
Layers/<frame-name>/{z}/{x}/{y}.png
```

---

## Checklist

- [ ] Run `pixi install`
- [ ] Run step 0
- [ ] Run step 1 to build all NAC layer pyramids
- [ ] Run step 2 for the DEM
- [ ] Run step 3 for the ellipse
- [ ] Run step 4 to verify layer counts
- [ ] Import selected NAC frame layers into AEGIS
- [ ] Validate in Leaflet at `projResUnitsPerPixel = 12800`
