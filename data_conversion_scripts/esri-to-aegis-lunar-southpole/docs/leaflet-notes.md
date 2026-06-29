# Leaflet-specific notes (for the OpenLayers migration)

This pipeline produces tile layers for AEGIS, which **currently renders with Leaflet**
(via [proj4leaflet](https://github.com/kartena/Proj4Leaflet)). A separate MR switches
AEGIS entirely to **OpenLayers** (with a Leaflet compat shim).

This doc isolates the parts of the pipeline — and the AEGIS rendering it feeds — that
exist **only because of Leaflet's assumptions**, so that when the OpenLayers cutover
lands these scripts can be simplified to target OpenLayers directly. Everything *not*
listed here (the GDAL/rasterio raster work, COG emit, colorize, reproject) is
renderer-agnostic and unaffected.

> TL;DR: the **tile bytes and the tight projected bounding box are renderer-agnostic and
> stay as-is**. What's Leaflet-specific is (1) how the *resolution pyramid / CRS* is
> declared, (2) the **TMS y-from-bottom** tiling convention, and (3) the **client-side
> projected-bounds clip shim** that Leaflet needs and OpenLayers does not.

---

## The cap grid (shared, but Leaflet-flavoured)

Every layer is tiled onto the lunar south-pole **cap grid** defined in
[`../config.py`](../config.py):

```
origin (bottom-left) = (-931100, -931100)   # projected metres, IAU2000:30166
extent               = -931100 .. 931100    (both axes)
z0 units-per-pixel   = 12800   →  z13 = 1.5625   # 14 levels
tile size            = 256
```

The grid math itself (a fixed origin + a `res = z0 / 2**z` pyramid) is **how both
Leaflet and OpenLayers model a custom tile grid** — it is not Leaflet-specific. What
*is* Leaflet-specific is how it's consumed (below).

---

## 1. CRS / resolution pyramid declaration

**Leaflet (today).** AEGIS builds an `L.Proj.CRS` per mission in
[`../../../src/components/dashboard/map.tsx`](../../../src/components/dashboard/map.tsx)
from the mission's `proj*` fields:

```ts
const baseRes = projResUnitsPerPixel * 2 ** projResZoomLevel;      // 12800 at z0
const resolutions = Array.from({ length: 32 }, (_, i) => baseRes / 2 ** i);
new L.Proj.CRS(projEpsg, projProj4String, {
  origin: [projOriginX, projOriginY],     // -931100, -931100
  resolutions,
  bounds: L.bounds([projBoundsMinX, projBoundsMinY], [projBoundsMaxX, projBoundsMaxY]),
});
```

`config.py` keeps `CAP_Z0_RES` (12800) equal to the mission's `projResUnitsPerPixel` and
`origin == CAP_MIN` so the tiles we cut land exactly on Leaflet's pyramid. The pipeline's
[`main.py --summary`](../main.py) prints these as the AEGIS admin input values.

**OpenLayers equivalent.** A `ol/tilegrid/TileGrid` with `origin: [-931100, -931100]`,
`resolutions: [12800/2**z ...]`, `tileSize: 256`, plus an `ol/proj/Projection` registered
from the same proj4 string and `extent`. Same numbers — different object. Nothing in the
**pipeline** changes for this; it's purely how AEGIS declares the grid.

---

## 2. TMS y-from-bottom tiling convention  ⚠️ Leaflet-specific

[`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) writes tiles in **TMS**
order: `y = 0` is the **bottom** row, indices count **up** from `-931100`, and the partial
top tile (the cap is not a whole number of tiles tall) falls off the **top** — "exactly
what Leaflet assumes". Layers are registered with `tileFormat: "tms"`, and
[`leaflet-helper.tsx`](../../../src/components/page/leaflet-helper.tsx) sets
`tms: sublayer.tileFormat === "tms"`, which makes Leaflet flip `y` when requesting
`{z}/{x}/{y}.png`.

**OpenLayers.** OL's default `ol/source/XYZ` / `TileImage` uses **XYZ** (y from the
**top**). OL *can* consume TMS by flipping the y in the tile URL function, but if the
pipeline is retargeted to pure OpenLayers you have two clean choices:

- keep emitting TMS and give the OL source a `tileUrlFunction` that flips y, **or**
- emit **XYZ** tiles instead (flip the y-index loop in `tile_to_cap_grid.py`) and drop
  the `tms` flag.

Either way this is the main **tiling-convention** decision to revisit. The cap anchor
(bottom-left) and the partial-tile-off-the-top behaviour are also TMS framing — re-derive
them for XYZ if you switch.

The `tilemapresource.xml` we emit (a gdal2tiles/TMS artifact) is the registration
source-of-truth today; OpenLayers has no native use for it, so a pure-OL pipeline would
likely emit a small JSON manifest (extent + resolutions + min/max zoom) instead.

---

## 3. The tight bounding box + the projected-bounds clip  ⚠️ Leaflet shim

This is the 404-prevention work. The pipeline emits a **tight** layer extent
(`<BoundingBox>` in `tilemapresource.xml`, projected metres) instead of the full cap, so
renderers only request tiles that exist. **The tight projected bbox is
renderer-agnostic** and is exactly what OpenLayers wants.

The Leaflet-specific part is *making Leaflet honour it*:

- Leaflet's built-in `bounds` tile option clips in **geographic lat/lng** (it derives tile
  bounds via `map.unproject`). For our projected CRS the stored bbox is in **projected
  metres**, so Leaflet's lat/lng clip is a silent no-op and the layer 404-storms.
- Fix: a client shim
  [`../../../src/utils/mapping/leaflet-projected-bounds.ts`](../../../src/utils/mapping/leaflet-projected-bounds.ts)
  adds a `projectedBounds` option and overrides `L.TileLayer.prototype._isValidTile` to
  reject tiles whose **projected** extent doesn't intersect the bbox (using
  `crs.transformation.untransform(point, crs.scale(z))` — Leaflet's own pixel→projected
  inverse). `leaflet-helper.tsx` passes `projectedBounds` only for custom-CRS missions.

**OpenLayers needs none of this.** OL clips tile requests natively to the source/layer
`extent` (in projected coordinates). So in pure OpenLayers:

- **keep** emitting the tight projected `<BoundingBox>` (or JSON `extent`),
- **set** it as the OL layer/source `extent`,
- **delete** the `leaflet-projected-bounds.ts` shim and the `projectedBounds`/`_isValidTile`
  plumbing — it's pure Leaflet-compat.

(Accepted residual today: the tiler skips fully-transparent tiles, so a rectangular
extent can leave interior "holes" that still 404. Rare for rectangular DEM/slope, minor
for irregular NAC mosaics. Same residual under OpenLayers; an exact fix would be a
per-tile manifest, not done in either renderer.)

---

## 4. Native zoom range

Layers register `minNativeZoom`/`maxNativeZoom` (parsed from the `<TileSets>` in
`tilemapresource.xml`, currently `0 .. max_zoom`). Leaflet uses these to overscale/cap
beyond the levels we actually cut so it doesn't request non-existent zooms.

**OpenLayers** expresses the same thing as the tile grid's `minZoom`/`maxZoom` (or the
length of the `resolutions` array) plus layer `minResolution`/`maxResolution`. Same intent,
different field names — carry the values across.

---

## Quick map: what changes for pure OpenLayers

| Concern | Leaflet (now) | Pure OpenLayers (later) | Pipeline change? |
| --- | --- | --- | --- |
| CRS + pyramid | `L.Proj.CRS` (origin, resolutions, bounds) | `ol/proj` + `ol/tilegrid/TileGrid` | none (just admin/registration) |
| Tile order | **TMS** (`tms` flag, y-from-bottom) | XYZ default; TMS via `tileUrlFunction` | **yes** — keep TMS+flip, or emit XYZ |
| Registration artifact | `tilemapresource.xml` | JSON manifest (extent/res/zoom) | optional — emit JSON |
| Tight extent → clip | projected bbox **+ `_isValidTile` shim** | projected bbox as native `extent` | none (bbox already tight); **delete shim** |
| Native zoom | `min/maxNativeZoom` | tilegrid `min/maxZoom` / resolutions | none |

**Files that are purely Leaflet-compat (remove after cutover):**
[`../../../src/utils/mapping/leaflet-projected-bounds.ts`](../../../src/utils/mapping/leaflet-projected-bounds.ts)
and the `projectedBounds` wiring in
[`../../../src/components/page/leaflet-helper.tsx`](../../../src/components/page/leaflet-helper.tsx)
/ [`../../../src/typings/leaflet/leaflet-module.d.ts`](../../../src/typings/leaflet/leaflet-module.d.ts).
