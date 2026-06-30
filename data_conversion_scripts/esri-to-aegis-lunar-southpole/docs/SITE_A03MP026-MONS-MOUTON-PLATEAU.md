# A03MP026 — Mons Mouton Plateau: Source Understanding & AEGIS Import Notes

**Status:** Worked site example for the `esri-to-aegis-lunar-southpole` pipeline
**Site:** Mons Mouton Plateau (`A03MP026`)
**Body:** Moon — South Pole
**Target:** AEGIS Leaflet-first, cap-grid PNG/TMS tile layers
**Output root:** `<static>/missionFiles/<mission-id>/` (from `main.py --mission-id`)

This is the original data drop the pipeline was built against. Use it as a concrete
example of the inputs and the resulting AEGIS settings. The pipeline both builds the files
and (opt-in) **registers them on a running AEGIS server** — mission GIS fields, header
layers, sublayers, and the active LGRS grid — via the `register` step (see §1, and the
pipeline README "AEGIS import" section).

---

## 1. Processing summary

Each data type is handled by the pipeline (`main.py`) as follows:

- **DEM** — re-emit the 1 mpp DEM as a clean COG (keeps the source name, e.g.
  `Data/mp2-sfs-dem_MoonSP_COG_zstd.tif`), used as `demFilePath`. Not a tile layer.
- **Products** — derive hillshade/slope/aspect/TRI from the DEM (`--products`), colorized;
  slope honours the GIS `.lyrx` symbology when provided.
- **Grid** — generate the LGRS mission grid from the lander location (default 10 km) and
  register it as the active grid.
- **NAC** — the GIS team delivers a **single mosaic raster**; we contrast-stretch it
  (if it is float) and tile it onto the shared cap grid as **one** layer
  (`Layers/nac/`). We do **not** mosaic frames ourselves, and we do **not** ship one
  layer per frame (that earlier test config is kept only as an example — see
  `nac/examples/per_frame_layers/`).
- **Slope** — colorize the float slope raster with the `.lyrx` colour standard, then
  tile it as one layer (`Layers/slope/`). Optional/display-only.
- **Vector** — reproject the landing-ellipse shapefile to EPSG:4326 GeoJSON
  (`Data/ellipse.geojson`).

---

## 2. Source data understanding

### 2.1 DEM and vector data

- `SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif` is the mission DEM (1 m/px).
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

The original drop `A03MP026_SFS_1mpp_orthoimages/` contains the raw per-frame ortho
imagery (126 display-relevant `M*-map.tif` frames + 2 `mm2-*` QA rasters). Each frame
is single-band float32 radiance, already orthorectified, already in the correct
south-pole stereographic CRS, nodata-aware with `-3.4e38`.

For the shipping pipeline these frames are **not** consumed directly — the GIS team
delivers a single merged NAC mosaic which is what `main.py --nac-mosaic` tiles. The
per-frame directory is used only by the preserved example in
`nac/examples/per_frame_layers/`.

---

## 3. Projection and tile grid

All raster display output stays on the shared lunar south-pole **cap grid** used by
the existing basemap. These values are centralized in `config.py` and printed by
`main.py --summary`:

- `projIsCustom = true`
- `projEpsg = "IAU2000:30166"`
- `projProj4String = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"`
- `projBoundsMinX = projBoundsMinY = -931100`
- `projBoundsMaxX = projBoundsMaxY = 931100`
- `projOriginX = projOriginY = -931100`
- `projResZoomLevel = 0`
- `projResUnitsPerPixel = 12800`
- `planetRadius = 1737400`

Critical Leaflet constraint: every layer pyramid must be cut on the same cap grid the
mission declares (`common/tile_to_cap_grid.py` enforces this).

---

## 4. Commands

Run from `data_conversion_scripts/` via pixi:

```bash
# Full pipeline for this site
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --out F:/_repos/aegis_static/<env> \
    --src F:/_repos/aegis_static/MS3 \
    --nac-mosaic F:/path/to/nac_mosaic.tif

# Individual steps
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps dem
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps vector
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps slope
```

Inputs default to the A03MP026 layout under `--src`; the DEM, slope, `.lyrx`, and
ellipse paths can each be overridden on the CLI.

---

## 5. Expected output layout

```text
<out>/                                  # <static>/missionFiles/<mission-id>/
├── grid_source.geojson                # AEGIS mission-grid GeoJSON (register POSTs it)
├── Data/
│   ├── mp2-sfs-dem_MoonSP_COG_zstd.tif # demFilePath (keeps source name)
│   ├── ellipse.geojson
│   ├── <grid>.json                    # active grid coordinates (written by the grid API)
│   └── conversion_report.md           # captured run log + per-step timings
└── Layers/
    ├── nac/                           # one NAC layer (from the GIS mosaic)
    ├── slope/  hillshade/  aspect/  tri/   # DEM-derived products
    └── <custom rasters>/
```

---

## 6. AEGIS import implications

The `register` step performs all of this over HTTP (no manual admin entry); the values below
are what it sets:

- NAC + DEM-derived products → `tile` sublayers under the `Raster` header
  (`Layers/<name>/{z}/{x}/{y}.png`, `tileFormat "tms"`); the shared external NAC basemap →
  the `Common_LSP` header.
- Ellipse + custom vectors → `vector` sublayers under the `Vector` header
  (`dataProjection EPSG:4326`, `featureProjection IAU2000:30166`).
- DEM → `demFilePath` (`Data/mp2-sfs-dem_MoonSP_COG_zstd.tif`, `demResolution = 1.0`).
- Mission projection on the `12800` cap grid (origin unchanged); `actionSystemVersion = 2`,
  `usingLGRSCoordinates = true`; the LGRS grid set active.

---

## 7. Slope colour standard provenance

The original data drop did **not** include slope symbology. The `.lyrx` (`AMPES_Slope 1.lyrx`,
ColorBrewer RdYlBu 10-class reversed + dark-purple hazard cap >20°) was obtained separately
from the GIS team on 2026-06-16; a later drop includes it at the `A03MP026/` root.
`slope/colorize_slope.py` parses it directly, and `products/lyrx_to_ramp.py` converts it to a
`gdaldem color-relief` ramp so the `slope`/`products` steps use the delivered symbology
instead of the built-in `default_color_ramps/slope.txt` (which matches it). Pass it with
`--lyrx`.
