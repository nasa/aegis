# A03MP026 — Mons Mouton Plateau: Final Source Understanding and AEGIS Import Plan

**Status:** Finalized for current implementation  
**Date:** 2026-06-24  
**Site:** Mons Mouton Plateau (`A03MP026`)  
**Body:** Moon — South Pole  
**Target:** AEGIS v1 / Leaflet-first using per-frame PNG/TMS layer pyramids on the shared cap grid  
**Output root:** `F:\_repos\aegis_static\missionFiles\64\`

---

## 1. Final conclusion

The original plan assumed the 126 NAC ortho frames should be mosaicked into one raster before serving. That is no longer the desired delivery.

The final process is:

- keep each NAC frame separate,
- contrast-stretch each frame independently,
- tile each stretched frame onto the shared lunar south-pole cap grid,
- write one AEGIS-importable layer folder per frame under `missionFiles/64/Layers/`.

This matches the current AEGIS implementation because Leaflet consumes PNG/TMS pyramids and the mission already uses the shared cap-grid projection settings with `projResUnitsPerPixel = 12800`.

---

## 2. Source data understanding

### 2.1 DEM and vector data

- `SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif` is the mission DEM.
- `Ellipse_shapefile/A03MP026_Ellipse.shp` is the landing ellipse source.
- `Slope/SiteUD1_final_adj_5mpp_slp.tif` is optional display-only slope imagery.
- The 5 mpp site DEM and regional DEMs are not needed for baseline mission behavior.

The landing ellipse provides the mission anchor:

| Attribute | Value        |
| --------- | ------------ |
| `lat_deg` | `-84.223397` |
| `lon_deg` | `33.5021945` |
| `x_m`     | `96771.33`   |
| `y_m`     | `146191.14`  |
| `diam_m`  | `199`        |
| `ctrl`    | `mm-sfs-dem` |

### 2.2 NAC orthoimage frames

`A03MP026_SFS_1mpp_orthoimages/` contains:

- **126** display-relevant NAC frames matching `M*-map.tif`
- **64** `LE` frames
- **62** `RE` frames
- **2** `mm2-*` QA rasters that are not display layers

Each `M*-map.tif` frame is:

- single-band,
- float32 radiance/reflectance,
- already orthorectified,
- already in the correct south-pole stereographic CRS,
- nodata-aware with `-3.4e38`,
- suitable for standalone display after contrast stretching.

The frames do **not** need to be merged for the current mission objective. They can be imported as separate AEGIS tile layers.

---

## 3. Projection and tile grid

All raster display output must stay on the shared lunar south-pole cap grid used by the existing basemap.

Mission projection values remain:

- `projIsCustom = true`
- `projEpsg = "IAU2000:30166"`
- `projProj4String = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"`
- `projBoundsMinX = -931100`
- `projBoundsMinY = -931100`
- `projBoundsMaxX = 931100`
- `projBoundsMaxY = 931100`
- `projOriginX = -931100`
- `projOriginY = -931100`
- `projResZoomLevel = 0`
- `projResUnitsPerPixel = 12800`

This is the critical Leaflet constraint: every layer pyramid must be cut on the same cap grid the mission declares.

---

## 4. Final raster-serving strategy

Instead of one mosaic layer, the mission serves one tile pyramid per NAC frame.

Example:

- source file: `M1409412744RE-tile.5.2-map.tif`
- layer folder: `M1409412744RE-tile.5.2-map`
- AEGIS URL template: `Layers/M1409412744RE-tile.5.2-map/{z}/{x}/{y}.png`

This preserves original frame boundaries and avoids a synthetic merged product.

---

## 5. Final processing pipeline

### Step 0 — Stage

- remove ArcGIS `.sr.lock` files
- create `missionFiles/64/Layers`
- create `missionFiles/64/Data`

### Step 1 — NAC per-frame processing

For every `M*-map.tif` frame:

1. run `MS3/NAC_processing/stretch_to_8bit.py`,
2. write a temporary 8-bit grayscale GeoTIFF,
3. run `MS3/tile_to_cap_grid.py`,
4. write tiles to `missionFiles/64/Layers/<frame-stem>/`.

The temporary stretched GeoTIFF is scratch only.

### Step 2 — DEM

Re-emit the 1 mpp DEM as:

- `missionFiles/64/Data/sfs_dem_1mpp.tif`

### Step 3 — Ellipse

Convert the ellipse shapefile to:

- `missionFiles/64/Data/a03mp026_ellipse.geojson`

### Step 4 — Inspect

Summarize expected NAC frame count, built layer count, missing layer count, and a sample `tilemapresource.xml`.

### Step 5 — Optional slope overlay

Colorize `SiteUD1_final_adj_5mpp_slp.tif`, then tile it with `MS3/tile_to_cap_grid.py` into `missionFiles/64/Layers/slope_5mpp/`.

---

## 6. Script layout

NAC-frame processing lives in:

```text
data_conversion_scripts/MS3/NAC_processing/
```

Scripts:

- `build_nac_layer_pyramids.py` — orchestrates per-frame stretch + tile.
- `stretch_to_8bit.py` — stretches one float32 NAC frame to uint8 grayscale.

The obsolete mosaic script has been removed from the MS3 pipeline.

---

## 7. Commands

Run from:

```bash
cd /f/_repos/aegis/data_conversion_scripts
```

### Full default pipeline

```bash
pixi run python MS3/_main.py
```

### Build only NAC frame layers

```bash
pixi run python MS3/_main.py --steps 1
```

### Direct NAC-processing command

```bash
pixi run python MS3/NAC_processing/build_nac_layer_pyramids.py \
    /f/_repos/aegis_static/A03MP026_SFS_1mpp_orthoimages \
    /f/_repos/aegis_static/missionFiles/64/Layers
```

---

## 8. Expected output layout

```text
missionFiles/64/
├── Data/
│   ├── sfs_dem_1mpp.tif
│   └── a03mp026_ellipse.geojson
└── Layers/
    ├── M1409412744RE-tile.5.2-map/
    ├── M1409412744LE-tile.5.2-map/
    ├── M1409412745RE-tile.5.2-map/
    ├── ... one folder per NAC frame ...
    └── slope_5mpp/   # optional
```

---

## 9. AEGIS import implications

For the current Leaflet implementation:

- import each NAC frame as its own `tile` sublayer,
- keep mission projection settings at `12800` units per pixel,
- do not change mission origin,
- do not use a mosaic layer path.

OpenLayers compatibility is still preserved because the output is standard tile pyramids, but the primary target remains Leaflet.

---

## 10. Final checklist

- [ ] Stage mission 64 output folders
- [ ] Build all per-frame NAC layer pyramids
- [ ] Build DEM output
- [ ] Build ellipse GeoJSON
- [ ] Verify layer count matches frame count
- [ ] Import selected NAC layers into AEGIS
- [ ] Validate in Leaflet on the `12800` cap grid
