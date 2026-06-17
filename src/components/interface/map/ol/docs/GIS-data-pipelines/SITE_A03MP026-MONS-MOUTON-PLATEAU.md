# A03MP026 — Mons Mouton Plateau: Data Description & Processing Plan (v1)

**Status:** Planning
**Date:** 2026-06-15
**Site:** Mons Mouton Plateau (Mission A03, landing ellipse `A03MP026`)
**Body:** Moon — South Pole
**Target:** **AEGIS v1 production (Leaflet)** — explicit projection fields, `Data/` + `Layers/` folders, PNG/TMS **tile pyramids** for imagery, `demFilePath` elevation via the Python/GDAL container.
**Related:** `PROJECTION-SYSTEMS.md`, `V2_TILESET-MIGRATION-STRATEGY.md` (§1–3 describe the legacy tile grid this mission uses), `data_conversion_scripts/README.md`

> **Scope note — v1 / Leaflet production.** Production AEGIS runs the **Leaflet** map system, which renders raster imagery **only as PNG/TMS tile pyramids** (`L.TileLayer`). It has **no COG / GeoTIFF rendering** — that capability is OpenLayers-only and is not yet in production. Therefore **all displayed raster layers here are tile pyramids**; COG is noted only as a future option for when the OpenLayers map ships. The V2 / COG-era data-management model (`missionVersion`, `assets/` folder, shared-layer catalog, `dataSource`/`elevationMode`, client-side geotiff.js elevation) is likewise **planning-only**. This document targets the **current production reality**: tile-pyramid imagery, a single `mission.demFilePath` GeoTIFF for server-side GDAL elevation **and slope**, GeoJSON vectors, and explicit `proj*` mission fields.

---

## 1. Executive Summary

The GIS team delivered a raw data drop for a new south-pole landing site, **Mons Mouton Plateau**, keyed to landing ellipse **A03MP026**. The drop contains:

- A **1 m/pixel shape-from-shading (SfS) DEM** — this is **the** mission DEM (`demFilePath`); it covers the whole operational area on its own (§4.5).
- A **5 m/pixel site DEM** and a matching **5 m/pixel slope raster** — **not needed** (see below).
- **126 individual LROC NAC orthoimage frames** (single-band, float radiance) that must be **mosaicked** and **stretched to 8-bit grayscale** before they can be displayed.
- **Three regional LOLA-derived DEMs** (5/30/60 m/pixel) — **not needed** (AEGIS uses one DEM only).
- A **landing-ellipse shapefile** (one polygon) with rich attributes.

Everything is already in the same projection — **Lunar South Pole Stereographic** (`+proj=stere +lat_0=-90 +R=1737400`, equivalent to `IAU2000:30166`) — so **no reprojection is required**. The work is: mosaic + stretch the imagery into a **PNG tile pyramid** (the only imagery form Leaflet production can render), produce the **1 mpp DEM as a single GeoTIFF for `demFilePath`** (server-side GDAL handles both elevation and slope), convert the ellipse to GeoJSON, and populate the mission's explicit projection fields.

This document describes each input file precisely (dimensions, CRS, resolution, extent, dtype, nodata) and lays out a script-driven processing plan that produces upload-ready **v1** AEGIS layers.

> All raster metadata below was read directly from the files using `uv run python inspect_geotiff.py` (rasterio bundles its own GDAL, so no system GDAL install is required — see §8).

---

## 2. Site Geography (from the ellipse shapefile)

The single polygon in `A03MP026_Ellipse.shp` is the authoritative source for the mission's geographic anchor:

| Attribute    | Value                           |
| ------------ | ------------------------------- |
| `mission`    | `A03`                           |
| `region`     | `Mons Mouton Plateau`           |
| `ellipse_id` | `A03MP026`                      |
| `diam_m`     | `199` (≈ 199 m landing ellipse) |
| `lat_deg`    | **-84.223397**                  |
| `lon_deg`    | **33.5021945**                  |
| `x_m`        | `96771.33` (stereographic E)    |
| `y_m`        | `146191.14` (stereographic N)   |
| `ctrl`       | `mm-sfs-dem` (control surface)  |
| `GlobalID`   | `{3D6F4670-...-EF3E11BB7084}`   |

**Use these directly to populate the v1 AEGIS `Mission` record:**

- `landerLocation` → `{ lat: -84.223397, lng: 33.5021945 }`
- `planetRadius` → `1737400`
- `initialZoom` → tune so the ~200 m ellipse and the 1 mpp footprint fit the viewport.
- `demFilePath` → the DEM produced in §6 (e.g. `DEM/sfs_dem_1mpp.tif`), `demResolution` → `1.0`.
- Explicit projection fields (`projIsCustom`, `projEpsg`, `projProj4String`, `projResUnitsPerPixel`, `projResZoomLevel`, `projOriginX/Y`, `projBoundsMin/Max*`) — see §3.1. These are **required** in v1; `MapProvider.tsx` reads them to build the projection and `leafletShim.buildLegacyResolutions()` to build the tile grid.

> Note `ctrl = "mm-sfs-dem"` confirms the GIS team controlled this ellipse against the **1 mpp SfS DEM** — that is the elevation surface the science/ops coordinates are tied to, which is why it is the mission's DEM (`demFilePath`, §5).

---

## 3. Projection — One CRS, Two WKT Flavors

Every raster and the shapefile share the **same proj4 string**:

```
+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

This is the AEGIS lunar south-pole projection (`IAU2000:30166` in `PROJECTION-SYSTEMS.md`):

```typescript
const code = "IAU2000:30166";
const proj4Def =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";
```

### 3.1 v1 mission projection fields

In v1, the projection is **not** read from the data — it is configured explicitly on the `Mission` record and consumed by `MapProvider.tsx` + `leafletShim.buildLegacyResolutions()`. Set:

| Mission field           | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `projIsCustom`          | `true`                                                                                         |
| `projEpsg`              | `"IAU2000:30166"`                                                                              |
| `projProj4String`       | `"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs"` |
| `projBoundsMinX/MinY`   | `-931100 / -931100` (south-pole extent, matches `PROJECTION-SYSTEMS.md`)                       |
| `projBoundsMaxX/MaxY`   | `931100 / 931100`                                                                              |
| `projOriginX / OriginY` | `-931100 / -931100` (tile-grid origin = bottom-left of extent)                                 |
| `projResZoomLevel`      | `0`                                                                                            |
| `projResUnitsPerPixel`  | **must equal the z=0 resolution baked into the imagery tile pyramid** (see ⚠️ below)           |

> ⚠️ **`projResUnitsPerPixel` must match the tile pyramid you generate in §6.** In v1 this value — not `tilemapresource.xml` — is the authoritative tile-grid resolution (the XML is unreliable; see `V2_TILESET-MIGRATION-STRATEGY.md` §1 and the `tilemapResource.ts` comment). When you tile with `gdal2tiles -p raster`, the z=0 resolution is determined by the pyramid; read it back (e.g. with `inspect_geotiff.py` on a z0 tile, or compute from the raster extent ÷ 256) and set `projResUnitsPerPixel` to that exact number so OpenLayers and the tiles agree. Do **not** invent an arbitrary value like the legacy `12800`.

However, the WKT _labels_ differ between files (this is cosmetic — proj4 is identical):

| WKT identity in the file                             | Files using it                                      |
| ---------------------------------------------------- | --------------------------------------------------- |
| `ESRI:103878` — "Moon_2000_South_Pole_Stereographic" | 1 mpp SfS DEM, ellipse shapefile                    |
| `Moon2000_spole` (no authority code)                 | 5 mpp site DEM, 5 mpp slope, `ldem_87s_5mpp`        |
| `IAU:30135` — "Moon (2015) - Sphere ... South Polar" | All orthoimage frames, `LDEM_75S/60S` regional DEMs |

**Implication:** They are spatially co-registered and overlay correctly with **no reprojection**. The only caveat is that some tools key off the WKT authority code rather than proj4; if a downstream step refuses to treat them as the same CRS, force-assign the canonical CRS with `gdal_edit -a_srs` / `rasterio`'s `--crs` rather than warping (a warp would needlessly resample). The processing scripts below normalize the CRS label on output so all AEGIS-facing products are consistent.

---

## 4. Input Inventory (measured properties)

### 4.1 `A03MP026/` — DEMs, slope, ellipse

| File                                      | Role                            | Dimensions    | Res (m/px) | Dtype   | NoData    | Extent (stereo E / N)                      | Tiled / Overviews | Compress | On disk |
| ----------------------------------------- | ------------------------------- | ------------- | ---------- | ------- | --------- | ------------------------------------------ | ----------------- | -------- | ------- |
| `SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif` | ✅ **THE DEM** (`demFilePath`)  | 57840 × 41790 | 1.0        | float32 | `0.0`     | 71470‥129310 / 118030‥159820 (≈58 × 42 km) | ✅ 512 / 6 ovr    | LZW      | 9.40 GB |
| `DEM/SiteUD1_5mpp_scaled.tif`             | _not needed_ ⚠️ "scaled"        | 15400 × 11600 | 5.0        | float32 | `-3.4e38` | 49000‥126000 / 119000‥177000 (≈77 × 58 km) | ❌ / none         | NONE     | 0.67 GB |
| `Slope/SiteUD1_final_adj_5mpp_slp.tif`    | Slope display layer (degrees)   | 15400 × 11600 | 5.0        | float32 | `NaN`     | 49000‥126000 / 119000‥177000               | ❌ / none         | NONE     | 0.67 GB |
| `DEM/ldem_87s_5mpp.tif`                   | _not needed_ (regional ±100 km) | 40000 × 40000 | 5.0        | float32 | `NaN`     | -100000‥100000 / -100000‥100000            | ✅ 256 / 8 ovr    | Deflate  | 3.23 GB |
| `DEM/LDEM_75S_30MPP_ADJ.TIF`              | _not needed_ (regional ±457 km) | 30496 × 30496 | 30.0       | float32 | `NaN`     | ±457440 / ±457440                          | ✅ 512 / 6 ovr    | Deflate  | 2.61 GB |
| `DEM/LDEM_60S_60MPP_ADJ.TIF`              | _not needed_ (regional ±931 km) | 31040 × 31040 | 60.0       | float32 | `NaN`     | ±931200 / ±931200                          | ✅ 512 / 6 ovr    | Deflate  | 2.88 GB |
| `Ellipse_shapefile/A03MP026_Ellipse.shp`  | Landing ellipse (1 polygon)     | —             | —          | vector  | —         | ~96671‥96871 / 146091‥146291               | —                 | —        | tiny    |

> "_not needed_" = does not contribute to the v1 mission. AEGIS uses only one DEM (`demFilePath`), and the 1 mpp SfS DEM covers the whole operational area (§4.5). The 5 mpp site DEM and regional DEMs play **no role** in elevation or slope, and would only ever be optional visual-context display tile layers if the team specifically asked for one.

**Elevation value ranges** (from the embedded statistics):

- 1 mpp SfS DEM: ≈ **805 → 7027 m**, mean ≈ 5161 m. Values are absolute radii-minus-offset elevations in meters; `nodata = 0.0`.
- 5 mpp site DEM: stats min ≈ -1301, mean ≈ 4239 — see ⚠️ §4.4.
- 5 mpp slope: **0 → ~61°**, mean ≈ 8.5° (units = degrees, confirmed by the GMT `grdblend ... _slp` history tag).

### 4.2 `A03MP026_SFS_1mpp_orthoimages/` — LROC NAC frames (3.6 GB total)

| Item                             | Count / properties                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M<id>(LE\|RE)-tile.5.2-map.tif` | **126 frames** (64 `LE` + 62 `RE` CCD halves). Single-band **float32** radiance/reflectance, `nodata = -3.4e38`, Deflate, tiled 256, 1 m/px. Sizes vary (a few MB → ~20 MB). Some have overviews, some do not. |
| `mm2-tile.5.2-count.tif`         | **QA raster** — number of frames stacked per pixel (0–37). 5121 × 5121, 1 m/px. **Not for display.**                                                                                                           |
| `mm2-tile.5.2-resolution.tif`    | **QA raster** — effective ground resolution per pixel (~1.0–1.6 m). 5121 × 5121, 1 m/px. **Not for display.**                                                                                                  |

Embedded tags confirm provenance: _"Mons Mouton Plateau v2 LROC M… Orthorectified to SfS"_, authored by Oleg Alexandrov, Andrew Annex, Ross Beyer (SETI / NASA Ames), `DEM_FILE: tiles_mm/MM_1m_lola.tile.5.2.tif`.

#### 4.2.1 Tooling for this folder — GDAL via `pixi`, no system GDAL install

Processing this folder is the **GDAL-heavy** part of the mission: the 126 frames must be
**mosaicked**, **stretched**, and ultimately **tiled** with `gdal2tiles` (§6–§7). On this laptop
there is **no system GDAL** (§8), so the plan is to provide GDAL — including the
`gdal2tiles` / `gdalwarp` / `gdaldem` command-line utilities — through **`pixi`**, with **no**
separate `brew`/`apt` install and no Docker.

> ⚠️ **Why not plain `uv`?** The official **`gdal` package on PyPI builds from source** and requires
> `libgdal` + headers (`gdal-config`) to already be on the system, so `uv pip install gdal` / `uv run
--with gdal` will **fail** on a clean laptop. The reliable no-system-install route is the
> **conda-forge** binary channel via `pixi` (below), which ships the full GDAL binary distribution —
> `libgdal` plus the `gdal2tiles`/`gdalwarp`/`gdaldem` CLIs.

**`pixi` setup (conda-forge binaries).** `pixi` is from the same authors as `uv` and uses the same
fast resolver. The `data_conversion_scripts/pyproject.toml` is **already configured** for pixi (the
geospatial stack is declared as conda-forge binaries), so the one-time setup is just:

```bash
cd data_conversion_scripts
pixi install                      # resolves the conda-forge env from pyproject.toml

# sanity check — GDAL CLIs on PATH, no system GDAL needed:
pixi run gdal2tiles --version
pixi run python -c "import rasterio, fiona, pyproj; print('bindings OK')"
```

> ⚠️ **Do NOT `pixi add --pypi gdal/rasterio/fiona/pyproj`.** That makes pixi build them from
> **PyPI source**, which needs a system `libgdal`/`gdal-config` and fails with
> `CRITICAL:root:A GDAL API version must be specified` (the `fiona` build error this project hit).
> The geospatial packages **must** come from the **conda channel**, declared in
> `[tool.pixi.dependencies]` (already done):
>
> ```toml
> [tool.pixi.dependencies]
> gdal = "*"
> rasterio = ">=1.4.4"
> fiona = ">=1.9.6"
> pyproj = ">=3.6.0"
> ```
>
> Only the **pure-Python** deps (`pmtiles`, `mapbox-vector-tile`) stay on PyPI (via the package's
> own `[project].dependencies` + the editable self-install). The `pyproject.toml` also sets
> `[tool.setuptools] py-modules = [...]` so the editable build doesn't fail with
> "Multiple top-level modules discovered in a flat-layout".

If you ever start a `pixi.toml` from scratch instead, the equivalent commands are
`pixi add gdal rasterio fiona pyproj` (conda — **no `--pypi`**) and
`pixi add --pypi pmtiles mapbox-vector-tile`.

Then run **every script that touches a GDAL CLI** through `pixi run` so the binaries are on PATH:

```bash
# GDAL-backed scripts (mosaic / tile — §6.2–§6.4, §7):
pixi run python mosaic_rasters.py   <in_dir>  <out.vrt>  --glob "M*-map.tif" --nodata -3.4e38
pixi run python raster_to_tiles.py  <in.tif>  <out_dir>  --profile raster
```

The other scripts use rasterio/fiona (Python bindings only, no GDAL CLI) and run under **either**
`pixi run` **or** `uv run` (under `uv`, pull the wheels with
`uv run --with rasterio --with fiona --with pyproj python <script>.py`). Running everything under
`pixi run` is simplest since the env is already resolved. Note `stretch_to_8bit.py` is pure rasterio
(no GDAL CLI), so it also works under `uv run` directly.

> **This supersedes the "run tiling in the `aegis/gdal` Docker image" guidance in §6.4/§7/§8.** With
> `pixi` providing GDAL locally, Docker becomes a **fallback**, not the primary path. Wherever those
> sections show `uv run python raster_to_tiles.py ...`, use `pixi run python raster_to_tiles.py ...`
> instead.

**Critical characteristics that drive the imagery pipeline:**

1. **They are not RGB.** Each frame is a single float32 band of orthorectified radiance with values in a _tiny_ range (~0.0–0.07 in samples). They must be **contrast-stretched to 8-bit grayscale** before AEGIS can display them as imagery.
2. **They overlap and tile the site.** The `LE`/`RE` frames are individual LROC NAC acquisitions covering overlapping strips. They must be **mosaicked** into one seamless raster.
3. **NoData must be honored** during mosaic (`-3.4e38`) or it will swamp the stretch.
4. The two `mm2-*` rasters are **byproducts** of the GIS team's mosaicking QA, not deliverable layers. Optionally expose `mm2-tile.5.2-resolution.tif` as a diagnostic COG, but it is not a mission base layer.

### 4.3 Shapefile sidecar hygiene

`Ellipse_shapefile/` contains several `*.shp.JSXIM-AGISI01.*.sr.lock` files — these are **ArcGIS "shared read" lock files** left over from an open ArcMap/Pro session on the GIS workstation. They are not part of the data and should be **ignored / deleted** before processing. Only `.shp/.shx/.dbf/.prj/.cpg` are needed (`.sbn/.sbx` spatial indexes are optional).

### 4.4 ⚠️ Open item: is the 5 mpp "scaled" DEM really in meters?

`SiteUD1_5mpp_scaled.tif` has `scaled` in its name. Its statistics (min ≈ -1301, mean ≈ 4239, max ≈ 7027) _look_ like plausible meters and roughly match the 1 mpp DEM's upper range — but the name implies a transform was applied. The regional GMT DEMs in this same drop were explicitly multiplied by 1000 (`grdmath ... 1000.0 MUL`), so a scale factor is plausible here too.

Since the 1 mpp SfS DEM fully covers the operational area (§4.5), the 5 mpp site DEM and the regional DEMs are **not needed for elevation or slope** and can be left out of the mission entirely. This open item therefore only matters if someone later wants the 5 mpp DEM as a _visual context layer_ — in which case `verify_dem_units.py` (§6.6) confirms whether the values need a `÷1000` correction before display. **For the baseline mission, skip it.**

### 4.5 DEM coverage — the 1 mpp SfS DEM alone is sufficient

AEGIS v1 supports **exactly one DEM** (`mission.demFilePath`), used only for **elevation profiles and slope calculations**. The question is whether the 1 mpp SfS DEM covers the operational area (~2 km around the lander) on its own, or whether DEMs must be merged into one file.

The lander/ellipse center is at stereographic **x = 96771.33, y = 146191.14**. Measured against the 1 mpp SfS DEM extent (E: 71470‥129310, N: 118030‥159820):

| Direction from lander | Distance to 1 mpp DEM edge |
| --------------------- | -------------------------- |
| West                  | 25.3 km                    |
| East                  | 32.5 km                    |
| South                 | 28.2 km                    |
| North                 | **13.6 km** (closest edge) |

The lander is deep inside the DEM — the **nearest edge is ~13.6 km away**, roughly **6.8× the 2 km operational radius**.

**Conclusion: use the 1 mpp SfS DEM as the single `demFilePath` and ignore the others. No DEM merging is required.** The 5 mpp site DEM and the regional 87S/75S/60S DEMs contribute nothing to elevation/slope (AEGIS samples only `demFilePath`).

---

## 5. Target AEGIS v1 Layers

In v1 there are exactly three sublayer **types** — `"vector" | "tile" | "vector-tile"` — and the **DEM is not a sublayer at all**: it lives on the mission as `demFilePath` and is read only by the elevation route / GDAL container. **In Leaflet production, a `"tile"` sublayer is always a PNG/TMS tile pyramid** (`L.TileLayer`); Leaflet cannot render COG/GeoTIFF.

This mission produces just **three layers** plus the DEM:

| AEGIS artifact               | Source(s)                                 | v1 representation                          | On-disk location                  | Serving format                                       |
| ---------------------------- | ----------------------------------------- | ------------------------------------------ | --------------------------------- | ---------------------------------------------------- |
| **NAC SfS Ortho Mosaic**     | 126 ortho frames → mosaic → 8-bit stretch | `"tile"` sublayer                          | `Layers/nac_sfs_ortho/` (pyramid) | **PNG tile pyramid** (Leaflet) — see §7              |
| **SfS DEM (1 mpp)**          | `mp2-sfs-dem_MoonSP_COG.tif`              | **`mission.demFilePath`** (not a sublayer) | `Data/DEM/sfs_dem_1mpp.tif`       | single GeoTIFF for GDAL elevation/slope              |
| **Landing Ellipse A03MP026** | `A03MP026_Ellipse.shp`                    | `"vector"` sublayer                        | `Data/a03mp026_ellipse.geojson`   | GeoJSON (`EPSG:4326` dataProjection)                 |
| _(optional)_ Slope overlay   | `SiteUD1_final_adj_5mpp_slp.tif`          | `"tile"` sublayer                          | `Layers/slope_5mpp/` (pyramid)    | PNG tile pyramid — only if a slope overlay is wanted |

**Elevation & slope = 1 mpp SfS DEM (and nothing else).** Set `mission.demFilePath` to the GeoTIFF produced from `mp2-sfs-dem_MoonSP_COG.tif` (path is relative to `missionFiles/{missionId}/`, e.g. `Data/DEM/sfs_dem_1mpp.tif`), and `mission.demResolution = 1.0`. It covers the full operational area (§4.5), so no DEM merge is needed. The elevation route resolves `/static/missionFiles/{missionId}/{demFilePath}` and posts it to the Python/GDAL container (`elevationService.py`), which computes **both elevation profiles and slope** server-side. This matches the ellipse's `ctrl = mm-sfs-dem` control surface. The DEM file is **not** a rendered map layer — it is purely the elevation/slope source. (It may keep its COG internal structure since GDAL reads it natively; that's harmless, just don't expect Leaflet to draw it.)

> **The separate 5 mpp slope raster is optional and redundant for analysis.** AEGIS computes slope live from the DEM via GDAL, so `Slope/...slp.tif` is only a **pre-rendered slope _display_ overlay**. If the team wants it, tile it into a PNG pyramid like the imagery; otherwise skip it. It is **not** the source of AEGIS's slope numbers.

> **Path resolution recap (`buildFullUrl`):** `"tile"` sublayers resolve under `Layers/`, `"vector"`/data files under `Data/`. The DEM is referenced directly by `demFilePath` relative to the mission root, conventionally under `Data/`.

---

## 6. Processing Plan — Scripts

The existing `data_conversion_scripts/` already covers the single-raster cases (`inspect_geotiff.py`, `geotiff_to_cog.py`, `raster_to_tiles.py`). This drop needs **two new reusable scripts** (mosaic + stretch) plus a small verification helper. All new scripts should follow the existing conventions: `argparse` CLI, rasterio for I/O, generalized so future missions can reuse them. **Run convention:** pure-Python scripts use `uv run`; scripts that shell out to GDAL CLIs (`mosaic_rasters.py`, `stretch_to_8bit.py`, `raster_to_tiles.py`) use **`pixi run`** so `gdal2tiles`/`gdalwarp`/`gdaldem` are on PATH with no system GDAL (see §4.2.1).

### 6.1 Step 0 — Stage & clean

```bash
# Remove ArcGIS lock files from the shapefile folder (they are not data)
rm -f "A03MP026/Ellipse_shapefile/"*.sr.lock
```

Decide an output root, e.g. `aegis_static/processed/A03MP026/`.

### 6.2 Step 1 — Mosaic the 126 ortho frames _(new script: `mosaic_rasters.py`)_

Merge all `*-map.tif` frames (excluding the `mm2-*` QA rasters) into a single float32 mosaic, honoring nodata.

```bash
cd data_conversion_scripts
# pixi run → GDAL CLIs on PATH, no system GDAL (see §4.2.1)
pixi run python mosaic_rasters.py \
    "../../aegis_static/A03MP026_SFS_1mpp_orthoimages" \
    "../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic_f32.tif" \
    --glob "M*-map.tif" \
    --nodata -3.4e38 \
    --resampling average
```

Script responsibilities:

- Discover input frames by glob; **exclude** `mm2-*`.
- Use `rasterio.merge.merge` (or build a VRT then materialize) with the supplied nodata.
- Preserve float32 and the source CRS/transform.
- Write a tiled intermediate (or a `.vrt` for the next step to consume directly — a VRT avoids writing a giant intermediate and is the preferred default).

> **Performance note:** A VRT (`--output-vrt`) is strongly preferred over a materialized 1 mpp mosaic — the stretch step (§6.3) can read the VRT and produce the 8-bit output in one pass, avoiding a multi-GB intermediate.

### 6.3 Step 2 — Stretch radiance → 8-bit grayscale _(new script: `stretch_to_8bit.py`)_

Convert the float32 mosaic to a display-ready **single-band 8-bit grayscale** raster using a percentile stretch so the faint radiance values become visible.

```bash
# pixi run → GDAL CLIs on PATH, no system GDAL (see §4.2.1)
pixi run python stretch_to_8bit.py \
    "../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt" \
    "../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif" \
    --pct-low 2 --pct-high 98 \
    --nodata -3.4e38
```

Script responsibilities:

- Compute low/high cut values from a **sampled histogram** (don't read the whole mosaic) ignoring nodata.
- Linearly rescale `[low, high] → [1, 255]`, reserve `0` as the output nodata (transparent in AEGIS).
- Emit a **single grayscale band** — the NAC imagery is monochrome, and Leaflet/OpenLayers render single-band PNG tiles fine, so there is **no need for 3 RGB bands**. `gdal2tiles` produces grayscale PNG tiles directly from the single band.
- Preserve CRS/transform; write tiled GeoTIFF.

### 6.4 Step 3 — Produce serving products

**Imagery → PNG tile pyramid (required for Leaflet production — see §7):**

```bash
# PNG tile pyramid — the only imagery form Leaflet production can render.
# Needs GDAL on PATH (gdal2tiles) — provided by pixi, no system GDAL (see §4.2.1).
pixi run python raster_to_tiles.py \
    "../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif" \
    "../../aegis_static/processed/A03MP026/Layers/nac_sfs_ortho" \
    --profile raster
```

> After tiling, **read back the z=0 resolution** (compute `extent_width / (256 × 2^maxZoom_at_z0)` from the pyramid, or inspect the generated `tilemapresource.xml` zoom range against the raster extent) and set `mission.projResUnitsPerPixel` to it (§3.1). v1 trusts this value, not the XML.

**DEM (single GeoTIFF for `demFilePath` — the elevation/slope source, not a map layer):**

```bash
# 1 mpp SfS DEM → clean GeoTIFF for the GDAL elevation container.
# Re-emit through the COG driver just to guarantee clean tiling/overviews (source is LZW).
uv run python geotiff_to_cog.py \
    "../../aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif" \
    --compress zstd \
    -o "../../aegis_static/processed/A03MP026/Data/DEM/sfs_dem_1mpp.tif"
```

> The DEM is consumed only by the server-side GDAL container, which reads **any** GeoTIFF — its internal COG structure is irrelevant to Leaflet (the DEM is never drawn). Re-emitting just gives clean, fast-to-sample tiling. Confirm `nodata = 0.0` is intended — min observed elevation is 805 m, so 0 as nodata is safe. You could equally keep the original file as-is and point `demFilePath` at it; re-emitting is optional housekeeping.

**Optional slope overlay → PNG tile pyramid (only if a visual slope layer is wanted):**

```bash
# Optional: pre-rendered slope as a PNG tile pyramid (NOT the source of AEGIS slope numbers).
# gdal2tiles refuses float32 input — colorize_slope.py handles the conversion first.
# Colour ramp is parsed directly from AMPES_Slope 1.lyrx (GIS team, 2026-06-16) — no .txt file.
pixi run python MS3/colorize_slope.py \
    "../../aegis_static/A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif" \
    "../../aegis_static/processed/A03MP026/slope_5mpp_rgba.tif"
# (auto-detects AMPES_Slope 1.lyrx next to the slope raster; or pass --lyrx explicitly)

pixi run python raster_to_tiles.py \
    "../../aegis_static/processed/A03MP026/slope_5mpp_rgba.tif" \
    "../../aegis_static/processed/A03MP026/Layers/slope_5mpp" \
    --profile raster
```

### 6.5 Step 4 — Vector: ellipse → GeoJSON _(reuse pattern; small script `shp_to_geojson.py` if not present)_

```bash
uv run --with fiona python shp_to_geojson.py \
    "../../aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp" \
    "../../aegis_static/processed/A03MP026/Data/a03mp026_ellipse.geojson" \
    --to-epsg 4326
```

- Reproject geometry from stereographic to `EPSG:4326` so AEGIS can load it with `new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "IAU2000:30166" })` (see `PROJECTION-SYSTEMS.md`).
- Carry the attributes (`ellipse_id`, `diam_m`, `lat_deg`, `lon_deg`, etc.) into feature properties for popups/labels.

### 6.6 _(Optional)_ Verify the 5 mpp DEM units _(new helper: `verify_dem_units.py`)_

> **Not part of the baseline mission.** Only run this if the team specifically wants the 5 mpp site DEM as a _display_ overlay. The mission's elevation and slope come entirely from the 1 mpp DEM (§4.5).

```bash
uv run python verify_dem_units.py \
    --reference "../../aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif" \
    --candidate "../../aegis_static/A03MP026/DEM/SiteUD1_5mpp_scaled.tif" \
    --lat -84.223397 --lon 33.5021945
```

- Sample both DEMs at the ellipse center (and a small grid around it), report the ratio/offset.
- If the candidate is ~1000× the reference → it was scaled; emit a `--scale 0.001` corrected COG. If it matches → it's already meters.

---

## 7. Imagery: PNG Tile Pyramid (now) — COG is a future option

**Production runs Leaflet, which can only render PNG/TMS tile pyramids.** So the NAC ortho mosaic must be generated as a tile pyramid with `gdal2tiles` (via `raster_to_tiles.py --profile raster`). There is no COG option in production today.

Generate it and **set `mission.projResUnitsPerPixel` to the pyramid's z=0 resolution** (§3.1) so the Leaflet `L.Proj.CRS` tile grid and the tiles agree (the XML resolution is unreliable — use the computed value).

> **Tile-grid consistency.** Use `gdal2tiles -p raster` and do **not** post-process or reorganize the output directory — the tiles and `tilemapresource.xml` must stay self-consistent (see `V2_TILESET-MIGRATION-STRATEGY.md` §3). Upload the whole output folder (including the XML) to `Layers/nac_sfs_ortho/`.

### 7.1 Future: COG `.tif` when OpenLayers ships

When the OpenLayers map reaches production, the same 8-bit mosaic can **alternatively** be served as a single COG `.tif` — OpenLayers' layer factory renders a `"tile"` sublayer whose `path` ends in `.tif` via `createCogLayer` (`WebGLTileLayer + GeoTIFFSource`). At that point the trade-off is:

| Factor           | PNG tile pyramid (now, Leaflet + OL)            | COG `.tif` (OpenLayers only, future)        |
| ---------------- | ----------------------------------------------- | ------------------------------------------- |
| Storage          | Many small files                                | One file                                    |
| Pipeline         | `raster_to_tiles.py` (GDAL via `pixi` — §4.2.1) | `geotiff_to_cog.py` (rasterio, no GDAL CLI) |
| Decode on client | Native PNG decode (fast for monochrome pixels)  | TIFF/JPEG decode in geotiff.js              |
| Serving          | Any static mount, no cache tuning               | Best with nginx byte-range slice cache      |
| Works in prod?   | ✅ Leaflet **and** future OL                    | ❌ OpenLayers only — **not in prod now**    |

**Plan:** ship the **PNG tile pyramid now**. Keep the intermediate 8-bit mosaic (`nac_sfs_ortho_8bit.tif`) around so a COG can be produced in one command (`geotiff_to_cog.py --compress jpeg`) if/when OpenLayers is in production and you want to A/B it for performance. No reprocessing of the source frames is needed to switch later.

The **elevation DEM** (`demFilePath`) is unaffected by all of this — it is a single GeoTIFF read server-side by GDAL and is never a rendered layer in either map system.

---

## 8. Tooling Notes (this workstation)

- **No system GDAL** is installed on this laptop. **Primary plan (see §4.2.1): provide the whole geospatial stack through `pixi` (conda-forge binaries) and run scripts with `pixi run` — no system install, no Docker.** `pixi install` (the `pyproject.toml` is already configured) gives both the GDAL **CLIs** (`gdal2tiles`/`gdalbuildvrt`/`gdalwarp`/`gdaldem`) needed by `mosaic_rasters.py` + `raster_to_tiles.py`, and the **Python bindings** (`rasterio`/`fiona`/`pyproj`) needed by the others. Verified working: GDAL **3.12.3**, rasterio 1.5.0, fiona 1.10.1, pyproj 3.7.2.
  - ⚠️ **Do not `pixi add --pypi gdal/rasterio/fiona/pyproj`.** Those build from PyPI source and need a system `libgdal`/`gdal-config`, failing with `A GDAL API version must be specified` (the `fiona` build error this project hit). They are declared as **conda** deps in `[tool.pixi.dependencies]`; only `pmtiles`/`mapbox-vector-tile` stay on PyPI.
  - The `pyproject.toml` also declares `[tool.setuptools] py-modules = [...]` so the editable self-install doesn't fail with "Multiple top-level modules discovered in a flat-layout".
  - Under plain `uv`, the rasterio/fiona scripts still work via prebuilt wheels: `uv run --with rasterio --with fiona --with pyproj python <script>.py`. The `aegis/gdal` Docker image (`docker/gdal/Dockerfile`) remains a **fallback** for the CLI steps on machines without `pixi`.
- **Windows console encoding:** the default cp1252 console can't encode the `→` character used in script output (`UnicodeEncodeError: ... '\u2192'`). **The four new scripts (`mosaic_rasters.py`, `stretch_to_8bit.py`, `shp_to_geojson.py`, `verify_dem_units.py`) now force UTF-8 stdout/stderr internally**, so they need no extra setup. The older `inspect_geotiff.py` still does not — set UTF-8 first when running it on a fresh shell:

  ```bash
  export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
  ```

  (Or apply the same `sys.stdout.reconfigure(encoding="utf-8")` guard to `inspect_geotiff.py`.)

---

## 9. New Scripts to Add to `data_conversion_scripts/`

| Script                | Purpose                                                                                                                  | Status         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `mosaic_rasters.py`   | Merge many overlapping GeoTIFF frames into one mosaic/VRT, nodata-aware                                                  | ✅ **written** |
| `stretch_to_8bit.py`  | Percentile-stretch a float radiance raster to single-band 8-bit grayscale                                                | ✅ **written** |
| `shp_to_geojson.py`   | Reproject + convert a shapefile to GeoJSON (EPSG:4326) with attributes                                                   | ✅ **written** |
| `verify_dem_units.py` | Detect whether a candidate DEM is meters or scaled (×1000); optional helper                                              | ✅ **written** |
| `raster_to_tiles.py`  | (existing) imagery PNG tile pyramid — **required path** (needs GDAL CLI; run via `pixi run` per §4.2.1, Docker fallback) | reuse          |
| `geotiff_to_cog.py`   | (existing) clean the DEM GeoTIFF for `demFilePath`; future COG imagery                                                   | reuse          |
| `inspect_geotiff.py`  | (existing) sanity-check every output; read back pyramid z=0 resolution                                                   | reuse          |

All four new scripts are committed to `data_conversion_scripts/` with `argparse` CLIs, registered as `[project.scripts]` in `pyproject.toml`, and documented in `data_conversion_scripts/README.md`. `fiona` + `pyproj` were added as project dependencies (for `shp_to_geojson.py` / `verify_dem_units.py`).

> `verify_dem_units.py` is **only needed if** someone later wants the 5 mpp DEM as a display layer (§4.4). It is not part of the baseline mission.

---

## 9.5 Execution — Run Order & Commands (Mission 595)

This section is the **authoritative, copy-paste runbook** for the actual data on this workstation. Paths are real, not placeholders.

**Inputs (on disk):**

- `C:\Users\bfeist\code\aegis_static\A03MP026\` — DEMs, slope, ellipse shapefile.
- `C:\Users\bfeist\code\aegis_static\A03MP026_SFS_1mpp_orthoimages\` — 126 `M*-map.tif` NAC frames (+ `mm2-*` QA rasters, auto-excluded).

**Output (render straight into the live mission):**

- `C:\Users\bfeist\code\aegis_static\MissionFiles\595\` — the new AEGIS mission, with `Layers/` (tile pyramids) and `Data/` (DEM + GeoJSON), matching the existing mission-25 layout.
  - The 1 mpp DEM has **already been copied** to `MissionFiles\595\Data\mp2-sfs-dem_MoonSP_COG.tif` — Step 4 below re-emits a clean copy as `Data\DEM\sfs_dem_1mpp.tif`; skip it if you'd rather point `demFilePath` at the file already there.

All commands are run **from the `data_conversion_scripts/` directory** with **forward-slash relative paths** (works in the bash terminal on this machine):

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts
```

> **Run-tool rule (§4.2.1):** scripts that shell out to a GDAL CLI — `mosaic_rasters.py`, `raster_to_tiles.py` — must run under **`pixi run`** so `gdalbuildvrt`/`gdal2tiles` are on PATH. The rasterio/fiona scripts — `stretch_to_8bit.py`, `geotiff_to_cog.py`, `shp_to_geojson.py`, `verify_dem_units.py`, `inspect_geotiff.py` — run under **either** `pixi run` or `uv run`. Simplest is to run **everything** under `pixi run` since that env is already resolved. The new scripts force UTF-8 stdout internally, so no `PYTHONUTF8` export is needed for them; the older `inspect_geotiff.py` still benefits from the export below on a fresh shell.

### One-time setup

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts

# GDAL + bindings via pixi (conda-forge binaries). pyproject.toml is already
# configured — geospatial stack in [tool.pixi.dependencies], NOT --pypi (§4.2.1).
pixi install

# sanity checks: GDAL CLIs on PATH + Python bindings import
pixi run gdal2tiles --version
pixi run python -c "import rasterio, fiona, pyproj; print('bindings OK')"

# (optional) UTF-8 console for the older inspect_geotiff.py on a fresh shell:
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
```

> ⚠️ **Never** `pixi add --pypi gdal/rasterio/fiona/pyproj` — that builds from source and fails with
> `A GDAL API version must be specified`. They must come from the conda channel (already declared).

### Step 0 — Stage & clean

```bash
# Remove ArcGIS "shared read" lock files from the shapefile folder (not data)
rm -f /c/Users/bfeist/code/aegis_static/A03MP026/Ellipse_shapefile/*.sr.lock

# Create the mission output folders
mkdir -p /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers
mkdir -p /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data/DEM
```

### Step 1 — Mosaic the 126 NAC frames → VRT _(pixi run)_

```bash
pixi run python mosaic_rasters.py \
    /c/Users/bfeist/code/aegis_static/A03MP026_SFS_1mpp_orthoimages \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
    --glob "M*-map.tif" \
    --nodata -3.4e38
```

- Selects the **126** `M*-map.tif` frames; `mm2-*` QA rasters are excluded by default.
- Writes a tiny VRT (no multi-GB intermediate). The VRT + its `.inputs.txt` list live alongside the mission as scratch — delete after Step 3 if you want a clean folder.

### Step 2 — Stretch radiance → 8-bit grayscale _(uv run)_

```bash
uv run python stretch_to_8bit.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif \
    --pct-low 2 --pct-high 98 \
    --nodata -3.4e38
```

- Reads the VRT directly, samples a decimated histogram, maps the 2–98% range to `[1,255]`, and reserves `0` as transparent nodata.
- Keep `nac_sfs_ortho_8bit.tif` after tiling — it's the one-command source for a future COG if/when OpenLayers ships (§7.1).

### Step 3 — Tile the 8-bit mosaic → PNG pyramid _(pixi run)_

```bash
pixi run python raster_to_tiles.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/nac_sfs_ortho \
    --profile raster
```

- Produces the **PNG tile pyramid** Leaflet production renders, written into `Layers/nac_sfs_ortho/` with its `tilemapresource.xml`.
- **Do not** reorganise the output folder afterward (§7).
- ⚠️ **Then read back the z=0 resolution** and set it as `mission.projResUnitsPerPixel` (§3.1) — see Step 6.

### Step 4 — DEM for `demFilePath` _(uv run)_

```bash
uv run python geotiff_to_cog.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif \
    --compress zstd \
    -o /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data/DEM/sfs_dem_1mpp.tif
```

- The elevation/slope source (not a rendered layer). Set `mission.demFilePath = "Data/DEM/sfs_dem_1mpp.tif"`, `mission.demResolution = 1.0`.
- **Optional:** the DEM is already at `Data\mp2-sfs-dem_MoonSP_COG.tif`; if you keep that instead, set `demFilePath = "Data/mp2-sfs-dem_MoonSP_COG.tif"` and skip this step.

### Step 5 — Ellipse shapefile → GeoJSON _(uv run)_

```bash
uv run python shp_to_geojson.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Data/a03mp026_ellipse.geojson \
    --to-epsg 4326
```

- Reprojects to EPSG:4326 and carries all attributes. Load as a `"vector"` sublayer with `dataProjection: "EPSG:4326"`, `featureProjection: "IAU2000:30166"`.

### Step 6 — Verify outputs & capture the tile-grid resolution _(uv run)_

```bash
# Confirm the 8-bit mosaic's CRS / extent
uv run python inspect_geotiff.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_8bit.tif

# Read back the pyramid's z=0 resolution for projResUnitsPerPixel:
#   resolution_z0 = (raster_extent_width_in_meters) / (256 * 2^max_zoom)
# Cross-check against the <BoundingBox>/<TileSet> entries in:
cat /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/nac_sfs_ortho/tilemapresource.xml
```

Set `mission.projResUnitsPerPixel` to that **measured** z=0 value (v1 trusts this number, not the XML — §3.1).

### Step 7 _(optional)_ — Slope display overlay _(pixi run)_

> **Color ramp source.** The delivered data drop contained **no symbology** — no `.lyrx`/`.clr`/`.sld`, no embedded color table, and no classification in the `.aux.xml`. The color standard was obtained separately: the GIS team provided **`AMPES_Slope 1.lyrx`** on 2026-06-16 in response to a request. `colorize_slope.py` parses that file directly at runtime — no `.txt` ramp file is produced.
>
> **Ramp summary (from `AMPES_Slope 1.lyrx`):** ColorBrewer **RdYlBu 10-class reversed** (blue = low/safe → red = steep), **2° equal-interval bins**, manual classification:
>
> | Class (°)   | R   | G   | B   |
> | ----------- | --- | --- | --- | ------------------------------ |
> | 0 – 2       | 49  | 54  | 149 | dark blue                      |
> | 2.001 – 4   | 69  | 117 | 180 |
> | 4.001 – 6   | 116 | 173 | 209 |
> | 6.001 – 8   | 171 | 217 | 233 |
> | 8.001 – 10  | 224 | 243 | 248 |
> | 10.001 – 12 | 255 | 255 | 191 | pale yellow                    |
> | 12.001 – 14 | 254 | 224 | 144 |
> | 14.001 – 16 | 253 | 174 | 97  |
> | 16.001 – 18 | 244 | 109 | 67  |
> | 18.001 – 20 | 215 | 48  | 39  | red                            |
> | > 20        | 48  | 31  | 66  | dark purple — AMPES hazard cap |
>
> The `.lyrx` upper bound for the cap class is `76.183` (the data max of the Malapert Massif slope raster it was originally authored against, not this site's raster). The cap color is applied to all pixels above 20°, so this value is irrelevant — `colorize_slope.py` extends the terminal anchor to `90°`, covering any plausible lunar slope. See §11 open question #5.
>
> **Color ramp source note:** The delivered data drop contained **no symbology** sidecar (`slope_color_ramp.txt` was never part of the pipeline). `colorize_slope.py` parses `AMPES_Slope 1.lyrx` directly at runtime, writes a temp colour table to a `tempfile` (auto-cleaned), and calls `gdaldem color-relief` — no persistent `.txt` file is created or needed.
>
> **`-exact_color_entry` pitfall (recorded 2026-06-16):** Using `gdaldem color-relief -exact_color_entry` on a float32 slope raster produces an all-blank output (~77 coloured pixels out of 178 M). The flag requires pixel values to match table entries exactly; float32 values like `8.472°` never match. The fix is to omit `-exact_color_entry` and use **duplicate boundary values** in the colour table (e.g. `2.000` and `2.001` both set to the same colour), so gdaldem’s linear interpolation snaps flat across each 2° bin — visually identical to ArcGIS’s classified rendering. `colorize_slope.py` implements this correctly.

```bash
# Only if a visual slope layer is wanted (NOT the source of AEGIS slope numbers).
# Two steps: colorize the float32 slope → 8-bit RGBA, then tile.

# Step 7a — colorize: parse .lyrx, colorize float32 → 8-bit RGBA (pixi run for gdaldem on PATH)
pixi run python MS3/colorize_slope.py \
    /c/Users/bfeist/code/aegis_static/A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif
# auto-detects AMPES_Slope 1.lyrx from the same directory as the slope raster;
# use --lyrx /explicit/path.lyrx if the file is elsewhere.

# Step 7b — tile the 8-bit RGBA result
pixi run python raster_to_tiles.py \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif \
    /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/slope_5mpp \
    --profile raster

# Step 7c — remove the intermediate (optional)
rm -f /c/Users/bfeist/code/aegis_static/MissionFiles/595/slope_5mpp_rgba.tif
```

> **gdal2tiles and float32:** `gdal2tiles` refuses to tile float32 rasters directly (`Please convert this file to 8-bit`). `colorize_slope.py` in 7a converts the float degree values to an 8-bit RGBA GeoTIFF first; `raster_to_tiles.py` in 7b then tiles that without error. No intermediate `.txt` colour-table file is created — `colorize_slope.py` parses the `.lyrx` directly and passes the ramp to `gdaldem` via a temp file that is cleaned up automatically.

### Step 8 — Clean up scratch (optional)

```bash
# Remove the mosaic VRT + input list once tiling is done (keep the 8-bit tif for a future COG)
rm -f /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.vrt \
      /c/Users/bfeist/code/aegis_static/MissionFiles/595/nac_sfs_ortho_mosaic.inputs.txt
```

**Resulting `MissionFiles/595/` layout:**

```
MissionFiles/595/
├── Data/
│   ├── DEM/sfs_dem_1mpp.tif          # demFilePath (elevation/slope source)
│   ├── mp2-sfs-dem_MoonSP_COG.tif    # (pre-existing copy; use either DEM)
│   └── a03mp026_ellipse.geojson      # "vector" sublayer
├── Layers/
│   ├── nac_sfs_ortho/                # "tile" sublayer (PNG pyramid + tilemapresource.xml)
│   └── slope_5mpp/                   # optional "tile" sublayer
└── nac_sfs_ortho_8bit.tif           # keep for a future COG (or delete)
```

---

## 10. End-to-End Checklist

> Commands for every step are in **§9.5** (the runnable mission-595 runbook). This is the tick-box summary; the rendering target is `MissionFiles\595\`.

- [ ] **Setup** — `pixi install`; sanity-check `pixi run gdal2tiles --version` (§9.5 one-time setup). **Do not** `pixi add --pypi` the geospatial stack.
- [ ] **Step 0** — delete `*.sr.lock` files; `mkdir -p MissionFiles/595/{Layers,Data/DEM}`.
- [ ] **Step 1** — `pixi run mosaic_rasters.py` → `MissionFiles/595/nac_sfs_ortho_mosaic.vrt` (126 `M*-map.tif`, `mm2-*` excluded).
- [ ] **Step 2** — `uv run stretch_to_8bit.py` → `MissionFiles/595/nac_sfs_ortho_8bit.tif` (single-band 8-bit, 2–98%).
- [ ] **Step 3** — `pixi run raster_to_tiles.py --profile raster` → `MissionFiles/595/Layers/nac_sfs_ortho/` **PNG pyramid**. Keep the 8-bit tif for a future COG.
- [ ] **Step 4** — `uv run geotiff_to_cog.py` → `MissionFiles/595/Data/DEM/sfs_dem_1mpp.tif` (`demFilePath`; or reuse the pre-existing `Data/mp2-sfs-dem_MoonSP_COG.tif`).
- [ ] **Step 5** — `uv run shp_to_geojson.py` → `MissionFiles/595/Data/a03mp026_ellipse.geojson` (EPSG:4326).
- [ ] **Step 6** — `uv run inspect_geotiff.py` outputs to confirm CRS/extent; read back the pyramid z=0 resolution.
- [x] **Step 7** _(optional)_ — slope overlay → `Layers/slope_5mpp/` (3,776 tiles). 7a `colorize_slope.py` (parses `.lyrx` directly, no temp `.txt`) → 7b `raster_to_tiles.py` → 7c deleted `slope_5mpp_rgba.tif`. See §9.5 Step 7 for commands and the `-exact_color_entry` pitfall note.
- [ ] **Step 8** _(optional)_ — delete scratch `nac_sfs_ortho_mosaic.vrt` + `.inputs.txt`.
- [ ] Create the AEGIS **v1** mission **595**: `landerLocation {-84.223397, 33.5021945}`, `planetRadius 1737400`, `demFilePath → Data/DEM/sfs_dem_1mpp.tif`, `demResolution 1.0`, and **all `proj*` fields per §3.1** (set `projResUnitsPerPixel` to the measured pyramid z=0 resolution).
- [ ] Create the `"tile"` (ortho) and `"vector"` (ellipse) sublayers per §5 — files are already rendered in place under `MissionFiles/595/`.
- [ ] Validate in the Leaflet production map; spot-check an elevation profile and slope at the ellipse center.

---

## 11. Open Questions for the GIS Team

1. **1 mpp DEM nodata** — `nodata = 0.0`. Confirm 0 m never occurs as a valid in-scene elevation (min observed = 805, so this is almost certainly fine).
2. **Ortho stretch preference** — Is a 2–98% percentile linear grayscale stretch acceptable for the NAC mosaic, or does the team have a preferred radiometric scaling / specific min-max?
3. **Vertical datum** — Are the 1 mpp DEM elevations referenced to the 1737400 m sphere (radius − R), as expected by AEGIS elevation/slope?
4. _(only if a 5 mpp slope/DEM display overlay is desired)_ — Is `SiteUD1_5mpp_scaled.tif` in true meters or scaled (e.g. ×1000)? Not needed for the baseline mission since the 1 mpp DEM drives all elevation/slope.
5. **Slope color ramp top-cap bound** — `AMPES_Slope 1.lyrx` lists the cap class upper bound as `76.183`, which is the data-max of the Malapert Massif slope raster the style was originally authored against (not this site). The cap color (dark purple, > 20°) is correct, but confirm whether the intent is `> 20°` as written, or a different hazard threshold for this site.
