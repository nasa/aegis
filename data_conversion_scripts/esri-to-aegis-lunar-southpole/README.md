# ESRI → AEGIS (lunar south pole)

Turns an ArcGIS/ESRI GIS data drop into AEGIS-ready map products for a
**lunar south-pole** mission, served as Leaflet-compatible PNG/TMS tile layers on
the shared cap grid (origin `-931100`, `projResUnitsPerPixel = 12800`).

The pipeline is **mission-agnostic**: there are no mission numbers anywhere. You
point it at an input data drop (`--src`) and an output root (`--out`) and it writes
`Layers/` + `Data/` ready to register in AEGIS. The lunar south-pole cap grid is the
single projection profile (see [`config.py`](config.py)).

> First built for **A03MP026** (Mons Mouton Plateau) — see
> [`docs/SITE_A03MP026-MONS-MOUTON-PLATEAU.md`](docs/SITE_A03MP026-MONS-MOUTON-PLATEAU.md)
> for the worked site example.

---

## The four data types

| Type       | Input                                   | Output                         | Process                         |
| ---------- | --------------------------------------- | ------------------------------ | ------------------------------- |
| **dem**    | DEM GeoTIFF                             | `Data/dem.tif` (COG)           | re-emit as clean COG            |
| **nac**    | single NAC mosaic raster (from GIS team) | `Layers/nac/` tile pyramid     | stretch (if float) → tile       |
| **slope**  | slope float raster (°) + `.lyrx` ramp   | `Layers/slope/` tile pyramid   | colorize → tile                 |
| **vector** | landing-ellipse shapefile               | `Data/ellipse.geojson`         | reproject to EPSG:4326          |

---

## Folder layout

```text
esri-to-aegis-lunar-southpole/
├── main.py            # pipeline runner (--out / --src / --steps)
├── config.py          # cap-grid projection profile + path resolution (all the mission/site bits)
├── common/            # shared across data types + general raster tools
│   ├── tile_to_cap_grid.py   # tile any raster onto the south-pole cap grid (NAC + slope)
│   ├── geotiff_to_cog.py     # GeoTIFF → Cloud-Optimised GeoTIFF
│   ├── inspect_geotiff.py    # quick raster summary (use first to understand inputs)
│   └── raster_to_tiles.py    # gdal2tiles pyramid (general; alt to tile_to_cap_grid)
├── dem/               # see dem/README.md (DEM = clean COG re-emit)
├── nac/
│   ├── stretch_to_8bit.py    # float radiance → 8-bit grayscale
│   └── examples/per_frame_layers/   # PRESERVED EXAMPLE: one layer per NAC frame (not shipped)
├── slope/
│   └── colorize_slope.py     # .lyrx colour standard → 8-bit RGBA
├── vector/
│   └── shp_to_geojson.py     # shapefile → GeoJSON (EPSG:4326, attrs preserved)
└── docs/
    └── SITE_A03MP026-MONS-MOUTON-PLATEAU.md
```

`common/` = logic shared across types (+ general raster utilities); each type folder
holds only that type's special-case script; `config.py` holds everything
mission/site/environment-specific.

---

## Running it

Run from the parent `data_conversion_scripts/` directory via **pixi** so the GDAL /
rasterio / fiona stack is on PATH:

```bash
cd data_conversion_scripts

# Full pipeline (provide the GIS-delivered NAC mosaic)
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --out F:/_repos/aegis_static/<env> \
    --nac-mosaic F:/path/to/nac_mosaic.tif

# Selected steps (names or indices)
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps dem vector
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --from slope

# List steps / print the AEGIS admin input summary
pixi run python esri-to-aegis-lunar-southpole/main.py --list
pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --summary
```

Steps: `0 stage · 1 dem · 2 nac · 3 slope · 4 vector` (default = all). Inputs default
to the A03MP026 layout under `--src`; override any of them with `--dem`, `--slope`,
`--lyrx`, `--ellipse`, `--nac-mosaic`.

### Inputs (defaults, relative to `--src`)

```text
A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif   # dem
A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif      # slope (+ AMPES_Slope 1.lyrx)
A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp    # vector
<delivered separately>                             # nac mosaic → pass --nac-mosaic
```

### Outputs (under `--out`)

```text
<out>/
├── Data/
│   ├── dem.tif            # demFilePath
│   └── ellipse.geojson    # vector sublayer
└── Layers/
    ├── nac/               # tile sublayer  → Layers/nac/{z}/{x}/{y}.png
    └── slope/             # tile sublayer  → Layers/slope/{z}/{x}/{y}.png
```

---

## AEGIS import

`--summary` prints the exact admin values. Mission projection (fixed, lunar south pole):

- `projIsCustom = true`, `projEpsg = "IAU2000:30166"`
- `projOriginX = projOriginY = -931100`, `projResZoomLevel = 0`, `projResUnitsPerPixel = 12800`
- `projBounds = ±931100`, `planetRadius = 1737400`

Register each tile layer as a `tile` sublayer (`urlTemplate Layers/<name>/{z}/{x}/{y}.png`,
`tileFormat "tms"`); the ellipse as a `vector` sublayer (`dataProjection EPSG:4326`,
`featureProjection IAU2000:30166`); the DEM as `demFilePath`.

---

## Preserved example: per-frame NAC layers

`nac/examples/per_frame_layers/` is a kept **example** of an earlier test
configuration that tiled *each* NAC frame into its own AEGIS sublayer (100+
sublayers). It is **not** part of the shipping pipeline (which tiles a single mosaic
into one `nac` layer) but is retained as a worked reference. See that folder's README.
