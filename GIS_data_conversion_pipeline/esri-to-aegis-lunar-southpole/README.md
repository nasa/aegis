# ESRI → AEGIS (lunar south pole)

Turns a GIS data drop into AEGIS-ready map products for a **lunar south-pole** mission and
**registers them on a running AEGIS server** over HTTP. Output is **OpenLayers-first**:

- PNG/TMS raster tile layers on the shared cap grid (origin `-931100`,
  `projResUnitsPerPixel = 12800`), each cut to its **own native resolution** (independent
  per-layer pyramid — no shared z13 clamp), with a **projected-metre** `<BoundingBox>`.
- **COG** raster sublayers (`--cog`) — a self-describing Cloud-Optimised GeoTIFF OpenLayers
  renders directly, emitted as its own `Layers/<stem>/<stem>.tif` folder (type inferred from the
  `.tif`; no `isCog` flag).
- **PMTiles** vector-tile layers (`--vector-tile-cache`) — a delivered ArcGIS vector-tile cache
  packed into one `Layers/<name>/<name>.pmtiles` folder (registered as a `"vector-tile"` sublayer).

(OpenLayers consumes the TMS tiles natively via a y-flip; legacy Leaflet-era missions keep
rendering through the app's compatibility shim and are never regenerated.)

Given an existing mission id (created in the AEGIS admin), the pipeline writes products
into `<static>/missionFiles/<id>/` (resolved from `STATIC_DIR` in the repo `.env`), then —
opt-in — sets the mission's projection/DEM/lander fields, creates the `Common_LSP` /
`Raster` / `Vector` header layers, and registers every generated layer as a sublayer. No
admin "import from file" clicking required. It can also zip and upload the results to Box.

The lunar south-pole cap grid is the single projection profile (see [`config.py`](config.py)).

> First built for **A03MP026** (Mons Mouton Plateau) — see
> [`docs/SITE_A03MP026-MONS-MOUTON-PLATEAU.md`](docs/SITE_A03MP026-MONS-MOUTON-PLATEAU.md)
> for the worked site example.

---

## Pipeline data types (`main.py` steps)

| Type            | Input                                                        | Output                                   | Process                                                            |
| --------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| **dem**         | DEM GeoTIFF                                                  | `Data/<source>_zstd.tif` (COG)           | re-emit as clean COG (keeps source name)                           |
| **nac**         | single NAC mosaic raster (from GIS team)                     | `Layers/nac/` tile pyramid               | stretch (if float) → tile                                          |
| **slope**       | slope float raster (°) + `.lyrx` ramp                        | `Layers/slope/` tile pyramid             | colorize → tile                                                    |
| **products**    | the DEM (`--dem`)                                            | `Layers/{hillshade,aspect,tri[,slope]}/` | derive from DEM → colorize → tile (`--products`)                   |
| **vector**      | landing-ellipse shapefile                                    | `Data/ellipse.geojson`                   | reproject to EPSG:4326                                             |
| **rasters**     | custom rasters (`--raster`, repeatable)                      | `Layers/<stem>/` tile pyramid each       | stretch (if float) → tile                                          |
| **vectors**     | custom vectors (`--vector`, repeatable)                      | `Data/<stem>.geojson` each               | shp → reproject; geojson copied                                    |
| **vectortiles** | ArcGIS vector-tile cache (`--vector-tile-cache`, repeatable) | `Layers/<name>/<name>.pmtiles` each      | pack Compact Cache V2 bundles → PMTiles (carries `esri_tile_info`) |
| **cogs**        | custom rasters (`--cog`, repeatable)                         | `Layers/<stem>/<stem>.tif` each          | GeoTIFF → COG (type inferred from `.tif`)                          |
| **grid**        | lander `--lander-lat/--lander-lng`                           | `grid_source.geojson` (10 km dflt)       | LGRS grid → AEGIS mission-grid GeoJSON                             |
| **register**    | the built `<out>` + `--mission-id`                           | mission fields + sublayers + active grid | POST fields + layers/sublayers + grid                              |
| **box**         | the built `<out>` + `--mission-name`                         | zips uploaded to Box (parallel)          | zip `Data/` + each layer → upload                                  |

Every tile layer also gets a `properties.json` (name/description/legend) that the AEGIS
admin auto-imports — see [`properties/`](properties/). The **register** step reads those
sidecars (plus each `tilemapresource.xml`) to build sublayers directly via the REST API:
external NAC → `Common_LSP` header, tile layers → `Raster` header, GeoJSON → `Vector` header.
It also POSTs the **mission grid** (active) and sets the mission GIS fields, including
`actionSystemVersion = 2` and `usingLGRSCoordinates = true`. Steps run only when their inputs
are present (default), or pick explicitly with `--steps`. Each run writes a
`Data/conversion_report.md` capturing the full console log + per-step timings.

## Standalone converters (inputs not part of the ESRI drop)

| Tool                                              | Input                                | Output                                           |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| [`grid/generate_lgrs.py`](grid/)                  | lander `--lat/--lng` + `--extent`    | raw LGRS grid GeoJSON (feeds `convert_lgrs.py`)  |
| [`grid/convert_lgrs.py`](grid/)                   | raw LGRS GeoJSON (generated or ESRI) | AEGIS mission-grid GeoJSON (`Cleaned_*.geojson`) |
| [`timeaware/singleband_timeaware.py`](timeaware/) | dir of single-band time rasters      | tiled time layers + `manifest.json`              |
| [`../mercator/tile_mercator.py`](../mercator/)    | Earth/Moon non-polar raster          | Web-Mercator / geodetic tile pyramid             |

---

## Folder layout

```text
esri-to-aegis-lunar-southpole/
├── main.py            # thin CLI runner (--mission-id / --src / --steps / --register / --box)
├── pipeline/          # runner internals: reporting (output capture), steps, summary
├── config.py          # cap-grid profile + path resolution + header/external-NAC constants
├── aegis_api.py       # stdlib HTTP client for the AEGIS REST API (mission/layer/sublayer/grid)
├── register.py        # build + POST mission fields, header layers, sublayers, active grid
├── box_publish.py     # zip Data/ + each layer and upload to Box, in parallel (ported BoxClient)
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
├── products/          # DEM-derived products (slope/hillshade/aspect/tri)
│   ├── dem_products.py       # DEM → product rasters via gdal.DEMProcessing (+ --*-lyrx)
│   ├── lyrx_to_ramp.py       # ArcGIS .lyrx symbology → gdaldem color-relief ramp
│   └── default_color_ramps/  # built-in fallback ramps (used when no .lyrx is delivered)
├── properties/
│   └── write_properties.py   # GDAL colour ramp → AEGIS properties.json (name/description/legend)
├── grid/
│   ├── generate_lgrs.py      # lander lat/lng → raw LGRS grid GeoJSON (USGS lgrs package)
│   └── convert_lgrs.py       # raw LGRS GeoJSON → AEGIS mission-grid GeoJSON (stdlib only)
├── timeaware/
│   └── singleband_timeaware.py  # single-band time series → tiles + manifest.json
├── vector/
│   └── shp_to_geojson.py     # shapefile → GeoJSON (EPSG:4326, attrs preserved)
├── vectortile/
│   └── arcgis_cache_to_pmtiles.py  # ArcGIS Compact Cache V2 → single .pmtiles (carries esri_tile_info)
└── docs/
    ├── SITE_A03MP026-MONS-MOUTON-PLATEAU.md
    ├── LEGACY-COVERAGE.md       # what was ported from lunar_utils/aegis (and what wasn't)
    └── leaflet-notes.md          # Leaflet-specific bits + what changes for the OpenLayers cutover

# sibling subfolder (non-polar / Earth):
../mercator/tile_mercator.py   # Web-Mercator (Earth) / geodetic (Moon) tiling
```

`common/` = logic shared across types (+ general raster utilities); each type folder
holds only that type's special-case script; `config.py` holds everything
mission/site/environment-specific.

---

## Running it

Run from the parent `GIS_data_conversion_pipeline/` directory via **pixi** so the GDAL /
rasterio / fiona stack is on PATH:

```bash
cd GIS_data_conversion_pipeline

# Full pipeline for an existing mission: build products, register, and upload to Box.
# Output folder is <static>/missionFiles/<mission-id> (STATIC_DIR from the repo .env).
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url http://localhost:4000 \
    --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --dem F:/drop/dem.tif --products hillshade slope aspect tri \
    --nac-mosaic F:/drop/nac_mosaic.tif \
    --raster F:/drop/keepout.tif --vector F:/drop/stations.shp \
    --register --box

# DEM-only mission (A03MP026 MS3): derive all four products from the DEM + LGRS grid.
# The grid step runs automatically when a lander location is given (default 10 km square).
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --src F:/tempF/MS3_data_drop \
    --products hillshade slope aspect tri \
    --grid-extent 10km --grid-precision 100 \
    --register --box

# Selected steps (names or indices) — e.g. only (re)register without rebuilding tiles
pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id 123 --steps register
pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id 123 --from slope

# Preview the registration without calling the API
pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id 123 --steps register --dry-run

# List steps / print the AEGIS admin input summary
pixi run python esri-to-aegis-lunar-southpole/main.py --list
pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id 123 --summary
```

### Generate once, then run just `register` or just `box`

A common flow is to build all the tiles/products **locally once** (no publishing), inspect
them, and only afterwards register the mission and/or upload to Box — without re-tiling.

`--steps` selects exactly which steps run and **overrides** the `--register`/`--box` gating,
so a publish-only run is just `--steps register` or `--steps box` (don't also pass
`--register`/`--box`). Both reuse the already-built output folder — by default
`<static>/missionFiles/<mission-id>`; if your build lives elsewhere, point at it with `--out`.

```bash
cd GIS_data_conversion_pipeline

# 1. Build everything locally, no publishing. Omit --register/--box so only the data
#    steps run; the folder <static>/missionFiles/123 now holds Data/ + Layers/.
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --dem F:/drop/dem.tif --nac-mosaic F:/drop/nac_mosaic.tif \
    --products hillshade slope aspect tri

# 2a. Register ONLY (mission fields + header layers + sublayers + active grid).
#     Reads the built folder; needs --mission-id + an EMSS token (--token or .env).
#     --dry-run previews without calling the API.
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url http://localhost:4000 --mission-id 123 \
    --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --steps register            # add --dry-run to preview; --no-mission-fields to skip GIS fields

# 2b. Box upload ONLY (zip Data/ + each layer → Box). Needs --mission-name (the Box
#     folder); no AEGIS URL/token required. --dry-run lists the zips without uploading.
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --steps box                 # add --dry-run to preview; --box-workers N to parallelise

# If the local build is not at the default folder, point either at it with --out:
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --mission-id 123 --steps register --out F:/_repos/aegis_static/missionFiles/123
```

> Re-running `register` is safe — it skips `(header, path)` sublayer pairs that already
> exist. To change an already-registered sublayer's `boundingBox`/zoom (e.g. after re-tiling),
> delete that sublayer in the admin first, then re-run `register`.

Steps: `0 stage · 1 dem · 2 nac · 3 slope · 4 products · 5 vector · 6 rasters · 7 vectors ·
8 vectortiles · 9 cogs · 10 grid · 11 register · 12 box`. By default the pipeline runs only the
steps whose inputs are present — `vectortiles` runs when `--vector-tile-cache` is given, `cogs`
when `--cog` is given, `grid` when a lander location is given, and `register`/`box` when
`--register`/`--box` are passed; `--steps` overrides this.
Inputs default to the A03MP026 layout under `--src`; override any with `--dem`, `--slope`,
`--lyrx`, `--ellipse`, `--nac-mosaic`, `--raster`, `--vector`. Use `--out` to override the
default `<static>/missionFiles/<id>` output root. The EMSS token is read from the repo
`.env` (`EMSS_TOKEN`) unless `--token` is passed.

**DEM-derived products.** The `products` step defaults to **hillshade, aspect, tri**; the
dedicated `slope` step is preferred when a GIS-delivered slope raster + `.lyrx` exist. When
the **only** input is a DEM (e.g. the A03MP026 MS3 drop), derive all four straight from the
DEM with `--products hillshade slope aspect tri`. The **TRI** colour ramp is
resolution-dependent — the step auto-selects
`default_color_ramps/ARCHIVE/TRIColors_{1m,5m,10m}_DEM.txt` to match `--dem-resolution`
(falling back to the legacy `tri.txt`), so set `--dem-resolution` to your DEM's m/px.

**Provided symbology (`.lyrx`).** When the GIS team delivers product symbology as an ArcGIS
`.lyrx` (e.g. `AMPES_Slope 1.lyrx`), pass it with `--lyrx` and the `products`/`slope` steps
use it **instead of** the built-in `default_color_ramps/` ramp — for both the colorize and the
AEGIS legend. `products/lyrx_to_ramp.py` converts the `.lyrx` to a `gdaldem color-relief` ramp
(it can also be run standalone, or fed to `dem_products.py` via `--slope-lyrx`/`--aspect-lyrx`/
`--tri-lyrx`). The `default_color_ramps/` are only the fallback when no `.lyrx` is provided.

### Inputs (defaults, relative to `--src`)

```text
A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif   # dem
A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif      # slope (+ AMPES_Slope 1.lyrx)
A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp    # vector
<delivered separately>                             # nac mosaic → pass --nac-mosaic
```

### Outputs (under `<static>/missionFiles/<id>`)

```text
<out>/
├── grid_source.geojson           # AEGIS mission-grid GeoJSON (register POSTs it; not in Data/)
├── Data/
│   ├── <source>_zstd.tif         # demFilePath (keeps the source filename, e.g. mp2-sfs-dem_MoonSP_COG_zstd.tif)
│   ├── ellipse.geojson           # vector sublayer (if a vector step ran)
│   ├── LGRS.json                 # active grid coordinates (written by the grid API on register)
│   └── conversion_report.md      # captured run log + per-step timings
└── Layers/
    ├── nac/                      # tile sublayer  → Layers/nac/{z}/{x}/{y}.png  (+ properties.json)
    ├── slope/                    # tile sublayer  (+ properties.json with legend)
    ├── hillshade/                # tile sublayer  (no legend)
    ├── aspect/                   # tile sublayer  (+ properties.json with legend)
    ├── tri/                      # tile sublayer  (+ properties.json with legend)
    ├── <name>/<name>.pmtiles     # vector-tile sublayer (if a --vector-tile-cache step ran)
    └── <stem>/<stem>.tif         # COG raster sublayer (if a --cog step ran; type inferred from .tif)
```

Every produced sublayer is a **folder** under `Layers/`; AEGIS infers its type from the folder
contents (`{z}/{x}/{y}` tiles → raster tile, `.pmtiles` → vector-tile, `.tif` → COG). Raster tile
folders also contain a `tilemapresource.xml` (bbox + zoom) and a `properties.json`
(name/description/legend), both auto-imported by the admin. The mission DEM COG is the exception —
it stays in `Data/` (keeping its source filename with a `_zstd` suffix) as the self-describing
`demFilePath`, not a sublayer.

---

## AEGIS import

The **`register` step** does all of this over HTTP (idempotent — re-running skips
already-registered `(header, path)` pairs):

- **Mission fields** — `POST /api/v1/missionAutomerge/fields` sets the fixed lunar south-pole
  projection (`projIsCustom=true`, `projEpsg="IAU2000:30166"`, `projOrigin = -931100`,
  `projResZoomLevel=0`, `projResUnitsPerPixel=12800`, `projBounds = ±931100`,
  `planetRadius=1737400`), plus `name`, `landerLocation`, `demFilePath`, `demResolution`,
  `actionSystemVersion=2`, and `usingLGRSCoordinates=true`.
  (This endpoint exists specifically so external tooling can set mission GIS fields, which
  otherwise live only in the Automerge doc; see `src/server/express/routes/missionAutomerge.ts`.)
- **Header layers** — `POST /api/v1/layer` creates `Common_LSP` (external NAC only),
  `Raster` (all tile layers), and `Vector` (all GeoJSON), as needed.
- **Sublayers** — `POST /api/v1/sublayer`, one per `Layers/<dir>` classified by its contents:
  a raster `tile` (`path = <folder>`, `tilePattern "{z}/{x}/{y}.png"`, `tileFormat "tms"`), a COG
  `tile` (`path = <folder>/<file>.tif`), or a `vector-tile` (`path = <folder>/<file>.pmtiles`);
  plus the ellipse + custom GeoJSON as `vector` sublayers (`path = <file>.geojson`) and the shared
  external NAC (`path = <S3 base URL>`). bbox/zoom come from each `tilemapresource.xml`;
  name/description/legend from each `properties.json`.
- **Mission grid** — `POST /api/v1/grid` (with `upsertFullGrid`) uploads `grid_source.geojson`
  as the **active** grid: the server writes its coordinates to `Data/LGRS.json` and sets the
  mission's `activeGridUuid`. Replaces the manual upload at `/admin/mission_grid/<id>`.

`--summary` prints the exact field values without calling the API. `--dry-run` previews the
register/box actions. Run `register` alone with `--steps register` to (re)register an
already-built mission folder.

### Registering on another server (e.g. prod) after a local build + Box upload

Promote a locally-built mission to a different AEGIS server (e.g.
`https://aegis.fit.nasa.gov/`). The data files travel via Box; only the layer/mission
**metadata** is (re)registered against the target server with this script.

**Prerequisites for the prod step**

- The mission already **exists on prod** — an admin creates it in the prod admin first and
  notes its `<PROD_ID>` (it will differ from your `<LOCAL_ID>`).
- You have a **prod EMSS token** with edit permission. Pass it with `--token` (the repo
  `.env` `EMSS_TOKEN` is for local only — do not rely on it for prod).
- The data is on prod: the admin downloads the Box zips for the mission and unzips them into
  prod's `missionFiles/<PROD_ID>/` so it contains `Data/` and `Layers/`.
- You still have the **local build** on disk (`<static>/missionFiles/<LOCAL_ID>`) — the
  script reads it to discover which layers to register.

**Step 1 — local: build, register on localhost, upload to Box**

```bash
cd GIS_data_conversion_pipeline
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url http://localhost:4000 \
    --mission-id <LOCAL_ID> --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --dem F:/drop/dem.tif --nac-mosaic F:/drop/nac_mosaic.tif \
    --register --box
```

To include a **vector-tile layer built from source**, add `--vector-tile-cache` pointing at a
delivered ArcGIS Compact Cache V2 directory (the folder that contains `root.json` + `tile/`).
The `vectortiles` step packs its bundles into a single `.pmtiles`, carrying the cache's
`esri_tile_info` so OpenLayers renders it on the cap grid — no re-tiling. The layer folder name
comes from the cache dir, falling back to its parent when the leaf is a generic level dir like
`p12` (so `AggregatedContour/p12` → `Layers/AggregatedContour/AggregatedContour.pmtiles`).
`--vector-tile-cache` is repeatable:

```bash
cd GIS_data_conversion_pipeline
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url http://localhost:4000 \
    --mission-id <LOCAL_ID> --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --dem F:/drop/dem.tif --nac-mosaic F:/drop/nac_mosaic.tif \
    --vector-tile-cache F:/drop/AggregatedContour/p12 \
    --register --box
```

**Step 2 — admin (manual):** create the mission on prod (note `<PROD_ID>`), download the
Box zips for `"A03MP026 - ART3 Surface EVA MS 3"`, and unzip them into prod's
`missionFiles/<PROD_ID>/{Data,Layers}`.

**Step 3 — register on prod (no rebuild, no Box):** preview first with `--dry-run`, then run.

```bash
# preview
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url https://aegis.fit.nasa.gov \
    --mission-id <PROD_ID> --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --out F:/_repos/aegis_static/missionFiles/<LOCAL_ID> \
    --token <PROD_EMSS_TOKEN> --steps register --dry-run

# run for real (drop --dry-run)
pixi run python esri-to-aegis-lunar-southpole/main.py \
    --aegis-url https://aegis.fit.nasa.gov \
    --mission-id <PROD_ID> --mission-name "A03MP026 - ART3 Surface EVA MS 3" \
    --lander-lat -84.223397 --lander-lng 33.5021945 \
    --out F:/_repos/aegis_static/missionFiles/<LOCAL_ID> \
    --token <PROD_EMSS_TOKEN> --steps register
```

**Step 4 — verify:** open the mission on prod and confirm the `Common_LSP` / `Raster` /
`Vector` header layers and their sublayers appear and draw. Re-running `register` is safe —
it skips `(header, path)` pairs that already exist.

**Why it works across servers:** internal sublayer `path`s are folder-relative (e.g. `slope`, or
`contours/contours.pmtiles`), and bbox/zoom/legend come from the built sidecars — none depend on the mission id.
So the only prod-specific values are `--aegis-url`, `--token`, and `--mission-id`. `--out`
points at the **local** build (whose id differs from prod's) so the script knows which layers
to register; the `missionId` written into every payload is `<PROD_ID>`. (If you instead run
the script _on_ the prod host after unzipping, `missionFiles/<PROD_ID>` already exists, so
you can drop `--out`.)

Other AEGIS import targets produced by the standalone converters:

- **Mission grid** — upload `Cleaned_*.geojson` from `grid/convert_lgrs.py` at the mission
  grid admin (`/admin/mission_grid/<id>`).
- **Time-aware layer** — register the `*_singleband_time-aware_data/` folder (containing
  `manifest.json`) as a tile sublayer; AEGIS marks it `isTimeBased`. Only **one** time-based
  sublayer is allowed per mission.

---

## Preserved example: per-frame NAC layers

`nac/examples/per_frame_layers/` is a kept **example** of an earlier test
configuration that tiled _each_ NAC frame into its own AEGIS sublayer (100+
sublayers). It is **not** part of the shipping pipeline (which tiles a single mosaic
into one `nac` layer) but is retained as a worked reference. See that folder's README.
