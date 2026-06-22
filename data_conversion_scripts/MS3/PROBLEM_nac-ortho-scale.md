# RESOLVED — NAC Ortho on the cap grid (Mission 595 / A03MP026)

**Status: both problems resolved.**
- ✅ **Grid/scale (Problem 1):** Tiles are cut on the shared polar-cap grid (bottom-anchored,
  matching the basemap); the mission's existing projection fields are unchanged. See §1–§7.
- ✅ **Rendering (Problem 2):** The layer rendered **no tiles at all** because `tile_to_cap_grid.py`
  wrote the **data extent** (`94509.5 … 150604.5`) as the `BoundingBox` in `tilemapresource.xml`.
  AEGIS imports that value into `sublayer.boundingBox` and hands it straight to Leaflet's
  `L.tileLayer({ bounds })`, which Leaflet interprets as a **lat/lng** box. A tight projected-metre
  extent, read as lat/lng, never overlaps the real south-pole viewport (≈ −84° lat), so Leaflet's
  tile-validity check rejected every tile and issued **zero network requests**. **Fix:** emit the
  **full cap** (`-931100 … 931100`) as the BoundingBox — exactly what the production basemap and the
  existing **mission-16** layers use (`-931100,-931100,931100,931100`). The cap box, read as lat/lng,
  is enormous and always overlaps the viewport, so tiles load. One-line data fix in
  `tile_to_cap_grid.py`; **no frontend change.** See **§8**.
- ✅ **Scale/z0 (Problem 3, 2026-06-22):** The cap grid's z0 resolution was changed from **8192** to
  **12800** so the tiles match the mission's *existing* `projResUnitsPerPixel = 12800` (the value the
  working **external NAC basemap** already uses). Leaflet builds its resolution pyramid
  (`projResUnitsPerPixel / 2^z`) **per mission, not per layer**, so a layer cut on a different z0 makes
  Leaflet request tile indices that don't exist → 404s (we saw `…/12/1286/1345.png` 404 because the
  tiles were on the 8192 grid at `…/12/2007/…`). Fix: `tile_to_cap_grid.py` now uses `CAP_Z0_RES = 12800`
  (z13 = 1.5625 m/px). Re-tiled ortho + slope onto 12800; A/B test vs the external NAC confirms they
  align (1–2 px shift from the documented 0.5 px source-mosaic offset + resample rounding). See **§9**.

> **Caveat on the body of this doc.** The cap-grid *placement* work in §2–§7 (cutting tiles on
> origin −931100, the Y-anchor padding) is correct and still required — it controls *where* tiles land.
> **But every mention of `z0 = 8192` below is now historical:** the canonical cap z0 is **12800** (see
> the top bullet "Problem 3" and §9). The placement math is identical; only the z0 constant changed.
> Separately, the original §8 chased the wrong rendering cause (static-serving / path / tileFormat), and
> several places stated the `BoundingBox` / `sublayer.boundingBox` should be the **data extent** — that
> was the actual Problem-2 bug. Those spots are corrected inline below.

**Date:** 2026-06-17 · rendering root cause found & fixed 2026-06-22 · z0 8192→12800 fix 2026-06-22 (§9)
**Site:** Mons Mouton Plateau, landing ellipse `A03MP026` → AEGIS **mission 595**
**Layer:** NAC SfS ortho mosaic → `Layers/nac_sfs_ortho/` PNG/TMS tile pyramid

This is the investigation referenced from
[`README.md`](./README.md) and
[`SITE_A03MP026-MONS-MOUTON-PLATEAU.md`](../../src/components/interface/map/ol/docs/GIS-data-pipelines/SITE_A03MP026-MONS-MOUTON-PLATEAU.md).
Read those for the full data drop and pipeline; this doc is only about the **tile-grid / scale** and
**rendering** problems and how they were fixed.

---

## 1. Symptom

The NAC ortho mosaic, once tiled and loaded in the AEGIS Leaflet map, rendered **at the wrong
scale / wrong place** — it didn't line up with the landing ellipse or the existing basemap. The
mission-595 `Layers/` folder was empty (no tiles had ever been produced successfully).

Mess found on disk when picking this up:

- The root data-conversion scripts (`raster_to_tiles.py`, `inspect_geotiff.py`,
  `geotiff_to_cog.py`) were **missing** from `data_conversion_scripts/` — they live only on the
  `map-prototype` git branch — so `_main.py` step 3 could not run at all. *(Recovered.)*
- A leftover **`nac_sfs_ortho_8bit_fullcap.tif` of exactly 4,294,967,242 bytes** (≈ 4 GiB) — a
  truncated/corrupt file from an abandoned "pad the image out to the full polar cap" attempt
  (§4). Deleted.

---

## 2. The hard constraint — the tile grid is fixed by the existing basemap

Production AEGIS already serves a south-pole NAC basemap:

```
https://ares-aegis.s3.us-gov-west-1.amazonaws.com/NAC_POLE_SOUTH_CM_AVG_MERGE/{z}/{x}/{y}.png
```

Its `tilemapresource.xml` defines the grid that **mission 595's projection fields are already set
to**, and those fields **cannot be changed** (every layer in the mission shares them):

```
Origin              = (-931100, -931100)        # cap bottom-left
BoundingBox         = -931100 … 931100  (both axes)
z0 units-per-pixel  = 8192   →   z13 = 1.0       # 14 levels, TMS (y from bottom)
SRS                 = Polar Stereographic, Moon, R = 1737400  (≡ IAU2000:30166)
```

→ **Every new tileset MUST be cut on this exact grid.** This is the same grid the existing
**mission 25** layers use, so they all overlay.

### How AEGIS Leaflet uses it

For a custom-projection mission, `src/components/interface/map/map-body-leaflet.tsx` builds:

```ts
const baseRes = projResUnitsPerPixel * Math.pow(2, projResZoomLevel);   // 8192 * 2^0
const resolutions = [];
for (let i = 0; i < 32; i++) resolutions.push(baseRes / Math.pow(2, i)); // 8192, 4096, … 1, …

crs = new L.Proj.CRS(projEpsg, projProj4String, {
  origin: [projOriginX, projOriginY],   // (-931100, -931100)
  resolutions,
  bounds: L.bounds([projBoundsMinX, projBoundsMinY], [projBoundsMaxX, projBoundsMaxY]),
});
```

Leaflet requests tile `x = floor((projX − originX) / (res_z · 256))`. So a tile on disk must have
been generated with **origin −931100 and the 8192→1 resolution pyramid**, or the imagery lands at
the wrong index → wrong scale/place. The previously-attempted tiling used a grid anchored to the
*image's own corner* (origin ≈ 94509, z0 = 32) — that was the "wrong scale".

> In v1, `projResUnitsPerPixel` — not `tilemapresource.xml` — is the resolution Leaflet trusts.
> The XML is only read by the admin import UI to auto-fill the sublayer's
> `minNativeZoom` / `maxNativeZoom` / `boundingBox`.
>
> **The `boundingBox` is a visibility gate, and Leaflet reads it as lat/lng.** AEGIS passes
> `sublayer.boundingBox` into `L.tileLayer({ bounds })`. Leaflet's `_isValidTile` only requests a
> tile if `latLngBounds(bounds).overlaps(tileBounds)` — and it treats `bounds` as **geographic
> degrees**, not projected metres. So the box stored here must be the **full cap**
> (`-931100,-931100,931100,931100`), like the basemap and mission-16 layers. As lat/lng that box is
> huge and overlaps everything, so tiles load. A tight projected-metre box (the data extent) read as
> lat/lng lands far off the south-pole viewport and gates out **every** tile → blank layer, no
> network traffic. This is the Problem-2 root cause (§8).

---

## 3. Why this is awkward to produce — and the key realization

`gdal2tiles -p raster` anchors the tile grid to the **input raster's own corner**. To make it emit
the cap grid (origin −931100, z0 = 8192) you must feed it a raster whose extent **is** the full
cap. The cap at 1 m/px is `1,862,200 × 1,862,200` px:

- Don't **materialise** it — the writer truncates a GeoTIFF at 4 GiB (that's the corrupt
  `*_fullcap.tif` we found). Use a **virtual** full-cap VRT instead
  (`gdalbuildvrt -te -931100 -931100 931100 931100 -tr 1 1` → < 1 s, tiny XML, references the
  small real mosaic, nodata everywhere else).
- But our data sits ~4,000 tiles from the cap origin, so the base zoom is a
  ~4000 × 4200 ≈ **17 M-tile grid** (52.9 M untrimmed), almost all empty. The stock tilers walk
  the whole thing:

  | Attempt | Result |
  | ------- | ------ |
  | `gdal2tiles -p raster` (Python, GDAL 3.12) on the full-cap VRT | No progress after 90 s; stuck building the job list. ✗ |
  | `gdal2tiles` on an NE-trimmed 17 M-tile VRT | Same after 165 s. ✗ |
  | `gdal raster tile` (new C++ tiler), full cap, **unconstrained** | Still grinding the empty cap. ✗ |

**The key realization:** the new C++ **`gdal raster tile`** accepts an explicit tile window
(`--min-x/--max-x/--min-y/--max-y` + `--min-zoom/--max-zoom`). Constrain it to *only the tiles the
data covers*, on the full-cap VRT, and it finishes in **~6 s** while still numbering tiles on the
cap grid. Two gotchas that cost a few iterations:

1. The window args are in **XYZ (top-down)** convention, even though `--convention tms` correctly
   sets the **output filenames** to TMS (y from bottom).
2. It does **not** emit a `tilemapresource.xml` — we generate one ourselves.
3. **The fractional-tile / Y-anchor trap (this is what bit us).** The cap is **not** a whole number
   of tiles tall: `1,862,200 m ÷ 256 m = 7274.21875` tiles at z13. The production basemap
   (`gdal2tiles -p raster`) anchors that grid at the **bottom-left** (origin −931100) and lets the
   partial tile fall off the **top** — which is exactly what Leaflet assumes
   (`tile_y = floor((projY − originY) / (res·256))`). But `gdal raster tile` anchors at the
   **top-left**, drops the partial tile off the **bottom**, then flips Y→TMS by tile *count*. Fed
   the *exact* cap extent, the two grids disagree by the empty part of that partial tile
   (`ceil(N)·256 − cap_height = 200 m` at z13) and the ortho lands **~200 m too far south**
   (y indices `4206..4226` instead of the basemap's `4205..4225`). **Fix:** pad the VRT's top/right
   out to a whole number of tiles so the bottom-left stays exactly on −931100; gdal's top-anchored
   Y-flip then resolves to the same bottom-anchored grid the basemap and Leaflet use.

---

## 4. The fix — `MS3/tile_to_cap_grid.py`

A new reusable script ([`tile_to_cap_grid.py`](./tile_to_cap_grid.py)) tiles any raster onto the
cap grid:

1. builds the virtual full-cap VRT at the layer's cap resolution, **padded up to a whole number of
   tiles** (top/right) so the bottom-left corner stays tile-aligned on −931100 (see §3.3),
2. computes the data's tile window at max zoom (Y anchored at the padded top),
3. runs `gdal raster tile … --tiling-scheme raster --convention tms --skip-blank` restricted to
   that window,
4. writes a cap-grid `tilemapresource.xml` (Origin −931100, **BoundingBox = the full cap
   −931100…931100** — see §8; this is what the admin imports into `sublayer.boundingBox`,
   TileSets 8192→1).

It also **snaps coarse layers to a cap level**: a 1 m raster tiles to z13, a ~5 m raster (the
optional slope overlay) to z11 (4 m/px) — so a coarse layer is never blown up to a giant 1 m
canvas. `_main.py` step 3 (ortho) and step 7b (slope) both call it.

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts
pixi run python MS3/_main.py --steps 3      # tile the ortho onto the cap grid
pixi run python MS3/_main.py --summary      # prints the (unchanged) mission fields
```

### Result for the NAC ortho (mission 595)

Input `nac_sfs_ortho_8bit.tif`: 5121 × 5121 px, 1 m/px, uint8, nodata = 0, extent
E 94509.5…99630.5 / N 145483.5…150604.5 (a ~5.1 × 5.1 km patch around the landing site; the lander
at 96771.33, 146191.14 is well inside it).

Output `Layers/nac_sfs_ortho/`:

```
Origin      = (-931100, -931100)          # == basemap ✓
BoundingBox = -931100 … 931100 (both axes)  # == basemap / mission-16 ✓ (see §8)
TileSets    = z0:8192 … z13:1.0           # == basemap ✓
z13 indices = x 4006..4026,  y(TMS) 4205..4225   # bottom-anchored == basemap ✓
623 tiles total, ~6 s. Interior tiles are 1-band opaque; the footprint-edge
tiles carry an alpha channel (transparent nodata).
```

(The actual *data* footprint is E 94509.5…99630.5 / N 145483.5…150604.5 — but that is **not** what
goes in the BoundingBox; the BoundingBox is the full cap so Leaflet's lat/lng-bounds gate passes.)

The lander at `(96771.33, 146191.14)` falls in z13 tile `4015 / 4208` — a fully-opaque interior
tile — which is the same `x/y` index the production basemap uses for that location. ✓

> **The low-zoom tiles look blank — that's expected, not corruption.** A ~5 km footprint is
> sub-pixel on the cap at coarse zooms: at z1 (4096 m/px) the whole ortho is **4 px** in a 256×256
> tile; at z0 it's a **single pixel**. Those tiles carry valid alpha + luminance, they're just too
> tiny to see. The ortho only becomes visible around z9+. Set the sublayer's `minNativeZoom` so
> AEGIS doesn't bother requesting the invisible coarse levels (the tiles themselves are fine).

### Mission-595 record — NO CHANGES NEEDED

The whole point: these tiles match the grid the mission already declares.

| Field | Value (already set) |
| ----- | ------------------- |
| `projOriginX` / `projOriginY` | `-931100` / `-931100` |
| `projResZoomLevel` | `0` |
| `projResUnitsPerPixel` | `8192` |
| `projBoundsMin/Max X/Y` | `-931100` / `931100` |
| `projEpsg` | `IAU2000:30166` |

NAC ortho `"tile"` sublayer:

| Field | Value |
| ----- | ----- |
| `path` | `nac_sfs_ortho` |
| `tilePattern` | `{z}/{x}/{y}.png` |
| `tileFormat` | `"tms"` |
| `boundingBox` | `[-931100, -931100, 931100, 931100]` (full cap — admin reads from `tilemapresource.xml`; **must be the cap, not the data extent** — see §8) |
| `minNativeZoom` / `maxNativeZoom` | `0` / `13` |
| `maxZoom` | `15`–`17` (overzoom past native is fine) |

---

## 5. Notes / caveats

- **All layers share one grid.** The ortho (z13) and the optional slope overlay (z11) both land
  on the cap grid, so they register with each other **and** with the production basemap. Any
  future raster layer must go through `tile_to_cap_grid.py` (or otherwise be cut on origin −931100,
  z0 = 8192) for the same reason.
- **Half-pixel offset.** The mosaic's corner is at `…509.5 / …483.5`, i.e. 0.5 px (0.5 m) off the
  integer/`-931100` grid. The VRT is grid-aligned to −931100, so the data is effectively snapped by
  0.5 m — imperceptible. (The tile `BoundingBox` itself is the round-number full cap; the `.5` only
  shows up in the data footprint.) Comes from the mosaic step, not the tiling.
- **BoundingBox = full cap, not the footprint.** `tilemapresource.xml` declares the whole cap
  (`-931100…931100`) as its BoundingBox, matching the basemap and mission-16. This is required, not
  cosmetic: AEGIS feeds it to Leaflet's `L.tileLayer({ bounds })` as a lat/lng gate (§2, §8). The
  data footprint is recorded in the console output and §4, but never in the BoundingBox.
- **Footprint vs DEM.** The NAC ortho covers only ~5 × 5 km around the landing site; the SfS DEM
  (`demFilePath`) covers ~58 × 42 km. Expected — the high-res ortho is just the landing zone.
  Elevation/slope come from the DEM, not the ortho.
- **The new C++ `gdal raster tile` doesn't write `tilemapresource.xml`** — the script generates it.
  If GDAL's tiler changes its window-arg convention (XYZ vs TMS) in a future version, the y-window
  math in `tile_to_cap_grid.py` is the thing to re-check.

---

## 6. Questions / notes for the GIS team

1. **Half-pixel offset.** The 1 mpp NAC mosaic lands on a `.5` pixel boundary relative to the
   `-931100` stereographic grid the basemap/mission-25 layers use. Is the mosaic intentionally on a
   half-pixel grid, or should it be snapped to integer metres so all products are bit-aligned?
   (Cosmetic for display; asking for consistency.)
2. **Ortho stretch.** The display product is a 2–98 % percentile linear stretch of the float
   radiance to 8-bit grayscale (`0` = transparent nodata). Acceptable, or is there a preferred
   radiometric scaling / fixed min–max?
3. **Slope overlay resolution.** If the 5 mpp slope overlay is wanted, it snaps to cap level z11
   (4 m/px). Confirm that's acceptable (the alternative, z10 = 8 m/px, is coarser; z13 = 1 m/px
   would massively upsample a 5 m product).

---

## 7. Reproduce

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts
# steps 1–2 already produced nac_sfs_ortho_mosaic.vrt and nac_sfs_ortho_8bit.tif
pixi run python MS3/_main.py --steps 3      # cap-grid tiles → Layers/nac_sfs_ortho/
pixi run python MS3/_main.py --summary
```

---

## 8. RESOLVED — `nac_sfs_ortho` rendered no tiles because the BoundingBox was the data extent

**Date:** 2026-06-17 (found) → 2026-06-22 (resolved) · **Status:** fixed.

### 8.1 Symptom
- Mission 595 defaults to showing only the `nac_sfs_ortho` layer, and **nothing rendered** — the map
  was blank. Crucially, the browser made **no network requests for the tiles at all** (not 404s —
  *zero* requests). The production basemap (`NAC_POLE_SOUTH_CM_AVG_MERGE`) rendered fine when toggled
  on, which proved the CRS / `L.Proj.CRS` setup was good.

### 8.2 Root cause — projected metres handed to Leaflet as lat/lng
The "zero requests" detail is the whole answer. Leaflet never asks for a tile it believes is outside
the layer's `bounds`:

```js
// Leaflet GridLayer._isValidTile
_isValidTile(coords) {
  ...
  const tileBounds = this._tileCoordsToBounds(coords);          // tile extent in LAT/LNG
  return latLngBounds(this.options.bounds).overlaps(tileBounds); // options.bounds read as LAT/LNG
}
```

AEGIS builds the layer in [`leaflet-helper.tsx`](../../src/components/page/leaflet-helper.tsx) with
`bounds: [[boundingBox[1], boundingBox[0]], [boundingBox[3], boundingBox[2]]]` taken straight from
`sublayer.boundingBox`. That value came (via the admin import) from the `BoundingBox` this script
wrote into `tilemapresource.xml` — which was the **data extent in projected metres**,
`[94509.5, 145483.5, 99630.5, 150604.5]`.

Leaflet treats those numbers as **degrees**. The map viewport sits near the south pole (lander
≈ −84.22° lat, 33.50° lng), so the "bounds" box at lat ≈ 145 000 never overlaps it → every tile is
rejected before any HTTP request → blank layer, no traffic.

**Why the basemap worked and the ortho didn't:** identical CRS, origin, and pyramid — the *only*
difference was the size of the BoundingBox. The basemap (and the mission-16 layers) declare the
**full cap** `-931100…931100`. Read as lat/lng that box is gigantic and contains the viewport, so its
overlap test always passes. A small footprint box does not. The bug is invisible for full-cap layers
and only bites a small-footprint layer like this ortho.

### 8.3 The fix (data-side, one line)
`tile_to_cap_grid.py` now writes the **full cap** as the BoundingBox instead of the data extent:

```python
# write_tilemapresource(): BoundingBox is the whole cap, like the basemap / mission-16 layers
<BoundingBox minx="-931100…" miny="-931100…" maxx="931100…" maxy="931100…"/>
```

Re-run the tiling so the regenerated `tilemapresource.xml` carries the cap box, then re-import the
sublayer in the admin UI (or set `boundingBox = [-931100, -931100, 931100, 931100]` by hand):

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts
pixi run python MS3/_main.py --steps 3 7   # re-tile ortho + slope; rewrites tilemapresource.xml
```

Verified after the fix: both `nac_sfs_ortho` and `slope_5mpp` `tilemapresource.xml` declare
`BoundingBox = -931100…931100` and `Origin = -931100`, matching the basemap and mission 16.

### 8.4 Why this was *not* a frontend fix
The render path in `leaflet-helper.tsx` is correct *for the AEGIS convention*: every working
cap-grid layer stores a full-cap `boundingBox`, so passing it to Leaflet as lat/lng-bounds is fine.
Changing the frontend to reproject the box would have been the wrong layer to fix and would have
diverged mission 595 from how mission 16 (and every other polar layer) already works. The data was
wrong, not the code.

### 8.5 The §8.3 candidates that were *ruled out* (left for the record)
The original triage list guessed static-serving / `path` / `tilePattern` / `tileFormat` mismatches.
None applied: the tiles were served correctly, `tileFormat` was `tms` and matched the on-disk TMS
layout, and `path`/`tilePattern` were right. The single cause was the BoundingBox value. The "no
requests at all" observation (vs. 404s) is what pointed straight at the `bounds` gate.

---

## 9. RESOLVED — z0 changed from 8192 → 12800 so tiles match the mission's existing resolution

**Date:** 2026-06-22 · **Status:** fixed (data-side, in `tile_to_cap_grid.py`).

### 9.1 Symptom
After §8, the layer's bounds gate passed, so Leaflet finally *requested* tiles — but they **404'd**,
e.g. `…/Layers/nac_sfs_ortho/12/1286/1345.png` (Not Found). The tiles on disk were fine; they were
just at **different indices** than Leaflet asked for.

### 9.2 Root cause — tiles were cut on z0 = 8192 but the mission runs z0 = 12800
Leaflet (in `dashboard/map.tsx` / `map-body-leaflet.tsx`) builds the resolution pyramid from the
**mission** fields, once, for the whole map:

```ts
const baseRes = projResUnitsPerPixel * Math.pow(2, projResZoomLevel); // 12800 * 2^0 = 12800
const resolutions = [];
for (let i = 0; i < 32; i++) resolutions.push(baseRes / Math.pow(2, i)); // 12800, 6400, … 1.5625, …
// tileX = floor((projX − originX) / (res_z · 256))
```

Mission 595 already had `projResUnitsPerPixel = 12800` (the value the **working external NAC
basemap** uses). But `tile_to_cap_grid.py` cut tiles on a **z0 = 8192** pyramid. So:

| z12 resolution | tileX for lander (projX 96771, origin −931100) |
| -------------- | ---------------------------------------------- |
| 8192 grid → 8192/2¹² = 2.0 m/px | floor((96771+931100)/(2.0·256)) = **2007** (on disk) |
| 12800 grid → 12800/2¹² = 3.125 m/px | floor((96771+931100)/(3.125·256)) = **1284–1286** (what Leaflet asked for) |

Leaflet asked for `x≈1286` (12800 grid); the disk had `x≈2007` (8192 grid) → 404. **Leaflet's
pyramid is per-mission, not per-layer** — you cannot set resolution per layer — so the *tiles* must
be cut on the mission's z0, not the other way round.

### 9.3 The fix (data-side)
`tile_to_cap_grid.py` now hard-codes the cap z0 to **12800** (matching the basemap / mission record):

```python
CAP_Z0_RES  = 12800.0   # == mission projResUnitsPerPixel; Leaflet pyramid = 12800 / 2**z
CAP_MAX_ZOOM = 13        # z13 = 1.5625 m/px (12800 is not a 2^n multiple of 1 m — that's fine)
```

(Previously z0 was derived as `NATIVE_RES(1.0) * 2**ceil(log2(cap_px/256)) = 8192`.) The source is
resampled to the nearest cap level: the 1 m ortho → z13 (1.5625 m/px), the 5 m slope → z11
(6.25 m/px). Origin, full-cap BoundingBox, and the Y-anchor padding (§3.3) are unchanged.

Re-tile both layers:

```bash
cd /c/Users/bfeist/code/aegis/data_conversion_scripts
rm -rf /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/nac_sfs_ortho \
       /c/Users/bfeist/code/aegis_static/MissionFiles/595/Layers/slope_5mpp
pixi run python MS3/_main.py --steps 3 7   # ortho + slope on the 12800 grid
```

### 9.4 Verification
- `tilemapresource.xml` for both layers now declares `units-per-pixel="12800…"` at order 0.
- The previously-404ing `…/12/1286/1345.png` now **exists on disk** (z12 x range 1282–1288).
- A/B test against the **external NAC basemap**: the layers **align**, with only a 1–2 px shift —
  the documented half-pixel source-mosaic offset (corner at `…509.5 / …483.5`, §5) plus rounding
  from resampling 1 m → 1.5625 m. No frontend change.

### 9.5 Note on the mission record
No change to `projOriginX/Y` (−931100), `projBoundsMin/Max` (±931100), or `projResUnitsPerPixel`
(12800) — those were already correct for the external basemap. The whole point of Problem 3 was to
make the **generated tiles** match those already-set fields. (Aside: the admin projection UI coerces
`projResZoomLevel = 0` to `null` via `parseInt(value) || null`; `null` is harmless here because
`Math.pow(2, null) === 1`, so `baseRes` is still `12800`.)
