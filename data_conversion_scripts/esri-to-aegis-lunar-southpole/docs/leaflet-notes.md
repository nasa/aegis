# Leaflet-specific notes (for the OpenLayers migration)

This pipeline produces tile layers for AEGIS, which **currently renders with Leaflet**
(via [proj4leaflet](https://github.com/kartena/Proj4Leaflet)). A separate MR switches
AEGIS entirely to **OpenLayers** (with a Leaflet compat shim).

This doc isolates the parts of the pipeline — and the AEGIS rendering it feeds — that
exist **only because of Leaflet's assumptions**, so that when the OpenLayers cutover
lands these scripts can be simplified to target OpenLayers directly. Everything _not_
listed here (the GDAL/rasterio raster work, COG emit, colorize, reproject) is
renderer-agnostic and unaffected.

> TL;DR: the **tile bytes and the tight data extent are renderer-agnostic and stay as-is**.
> What's Leaflet-specific is (1) how the _resolution pyramid / CRS_ is declared, (2) the
> **TMS y-from-bottom** tiling convention, and (3) the fact that the extent is written to
> the tilemapresource `<BoundingBox>` in **geographic lon/lat degrees** (because Leaflet
> clips tile requests in lat/lng) rather than in the grid's projected metres.

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
_is_ Leaflet-specific is how it's consumed (below).

---

## 1. CRS / resolution pyramid declaration

**Leaflet (today).** AEGIS builds an `L.Proj.CRS` per mission in
[`../../../src/components/dashboard/map.tsx`](../../../src/components/dashboard/map.tsx)
from the mission's `proj*` fields:

```ts
const baseRes = projResUnitsPerPixel * 2 ** projResZoomLevel; // 12800 at z0
const resolutions = Array.from({ length: 32 }, (_, i) => baseRes / 2 ** i);
new L.Proj.CRS(projEpsg, projProj4String, {
  origin: [projOriginX, projOriginY], // -931100, -931100
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

## 2. TMS y-from-bottom tiling convention ⚠️ Leaflet-specific

[`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) writes tiles in **TMS**
order: `y = 0` is the **bottom** row, indices count **up** from `-931100`, and the partial
top tile (the cap is not a whole number of tiles tall) falls off the **top** — "exactly
what Leaflet assumes". Layers are registered with `tileFormat: "tms"`, and
[`leaflet-helper.tsx`](../../../src/components/page/leaflet-helper.tsx) sets
`tms: sublayer.tileFormat === "tms"`, which makes Leaflet flip `y` when requesting
`{z}/{x}/{y}.png`.

**OpenLayers.** OL's default `ol/source/XYZ` / `TileImage` uses **XYZ** (y from the
**top**). OL _can_ consume TMS by flipping the y in the tile URL function, but if the
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

## 3. The tight bounding box, written in geographic lon/lat ⚠️ Leaflet-flavoured

This is the 404-prevention work. The pipeline emits a **tight** layer extent instead of the
full cap, so renderers only request tiles that exist. The extent itself is renderer-agnostic;
what's Leaflet-specific is the **units it's written in**.

- Leaflet's built-in `bounds` tile option clips in **geographic lat/lng** (it derives each
  tile's bounds via `map.unproject`). AEGIS reads the tilemapresource `<BoundingBox>` straight
  into `sublayer.boundingBox` and `leaflet-helper.tsx` hands it to Leaflet as
  `[[minLat, minLng], [maxLat, maxLng]]`.
- So [`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) computes the tight extent
  in projected metres (for tiling math) and then **reprojects it to lon/lat degrees** before
  writing `<BoundingBox>` (`_proj_bbox_to_lonlat`, via `rasterio.warp.transform_bounds` with
  `densify_pts`). `<SRS>`/`<Origin>`/`<TileSet units-per-pixel>` stay in projected metres to
  document the grid — only `<BoundingBox>` is geographic. This is what makes the layers render
  under stock Leaflet on `int`/`prod` **with no client shim**.
  - Earlier drafts of this branch instead wrote the box in projected metres and added a client
    shim (`leaflet-projected-bounds.ts` + a `projectedBounds`/`_isValidTile` override) to clip
    in projected space. That shim has been **removed** — writing the box in lon/lat achieves the
    same clip using Leaflet's own `bounds` path.

**OpenLayers note.** OL clips tile requests natively to the source/layer `extent` **in the
layer's projected coordinates**. So a pure-OL cutover wants the extent back in **projected
metres** (or a JSON manifest carrying it) — the opposite of what Leaflet wants here. The
projected extent is already computed in `tile_to_cap_grid.py` (the `bbox` passed to
`write_tilemapresource`); emit it as projected for OL instead of reprojecting to lon/lat.

(Accepted residual: the tiler skips fully-transparent tiles, so a rectangular extent can leave
interior "holes" that still 404. Rare for rectangular DEM/slope, minor for irregular NAC
mosaics. Same residual under OpenLayers; an exact fix would be a per-tile manifest, not done in
either renderer. A second, smaller residual is specific to the lon/lat box: the reprojected
polar rectangle's lat/lng envelope slightly over-covers the true data patch, so a few
edge-adjacent empty tiles may be requested — harmless 404s, far short of the whole-cap storm.)

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

| Concern               | Leaflet (now)                                                  | Pure OpenLayers (later)                | Pipeline change?                                                   |
| --------------------- | -------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| CRS + pyramid         | `L.Proj.CRS` (origin, resolutions, bounds)                     | `ol/proj` + `ol/tilegrid/TileGrid`     | none (just admin/registration)                                     |
| Tile order            | **TMS** (`tms` flag, y-from-bottom)                            | XYZ default; TMS via `tileUrlFunction` | **yes** — keep TMS+flip, or emit XYZ                               |
| Registration artifact | `tilemapresource.xml`                                          | JSON manifest (extent/res/zoom)        | optional — emit JSON                                               |
| Tight extent → clip   | `<BoundingBox>` in **lon/lat°**, clipped by Leaflet's `bounds` | projected `extent` on the OL source    | **yes** — emit projected extent instead of reprojecting to lon/lat |
| Native zoom           | `min/maxNativeZoom`                                            | tilegrid `min/maxZoom` / resolutions   | none                                                               |
