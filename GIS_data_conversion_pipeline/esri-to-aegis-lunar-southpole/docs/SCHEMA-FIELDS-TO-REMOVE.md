# Schema / config fields removable after the OpenLayers-first cutover

A **later cleanup** list, not part of the pipeline's OpenLayers-first change itself. Each item is
now dead or redundant under OpenLayers (Leaflet is gone), but removing it touches the app schema,
the DB, or generated files, so it's deferred to its own pass. Nothing here is required for the
pipeline to work today.

> Written after the pipeline went OpenLayers-first (per-layer native pyramids, projected-metre
> bounds, PMTiles vector tiles, first-class `isCog` COG sublayers). See
> [`OPENLAYERS-MIGRATION-TODO.md`](./OPENLAYERS-MIGRATION-TODO.md) and
> [`leaflet-notes.md`](./leaflet-notes.md).

## App (TypeScript)

- **`sublayer.boundingBox`** — the OpenLayers renderer never reads it. `layerFactory.buildTileGrid`
  (`src/components/interface/map/utils/layers/layerFactory.ts`) builds the grid extent from the
  mission's `projBounds*`, not the per-sublayer box; the box is only parsed from
  `tilemapresource.xml` into the DB/admin. Candidate to drop from `Sublayer` /
  `SublayerImportable` / the DB model + a migration, and stop emitting it from the tiler.
  - Corollary: **`tilemapResource.ts` `boundingBox` parsing** (`parseTilemapResourceXml`) becomes
    dead once nothing stores the box.
- **Admin `tileFormat` options `wtms` / `wms`** (`src/components/admin/layerSublayerEdit.tsx`) —
  the pipeline never emits them and the OL layer factory only branches on `tms` vs everything-else
  (XYZ). Only `tms` and `xyz` are meaningful; `wtms`/`wms` can be dropped from the dropdown.
- **`tileGridVersion`** (proposed in `OPENLAYERS-MIGRATION-TODO.md` §2) — **not needed and not
  added.** The merged app always derives tile resolutions from the mission pyramid
  (`projResUnitsPerPixel`) + per-layer `maxNativeZoom` via `buildLegacyResolutions`
  (`utils/parsers/leafletShim.ts`), so independent per-layer pyramids already work with no marker.
  The field is not in `Mission` / `UPDATABLE_MISSION_FIELDS` and nothing reads it — do not add it.

## Pipeline (Python)

- **`PROJ_GEOGRAPHIC_PROJ4`** and **`_proj_bbox_to_lonlat`** — removed in the OpenLayers-first pass
  (the tiler now writes `<BoundingBox>` in projected metres). Listed here only as a record; already
  gone from `config.py` / `common/tile_to_cap_grid.py`.

## Kept on purpose (NOT removable)

- **`buildLegacyResolutions` / the resolution shim** (`utils/parsers/leafletShim.ts`) — despite the
  name it is the **only** resolution path for custom-projection tile layers (legacy *and* new), so
  it stays. Legacy missions built in the Leaflet era keep rendering through it.
- **TMS tile order** (`tileFormat: "tms"` + the app's y-flip `tileUrlFunction`) — the pipeline
  keeps emitting TMS; OpenLayers consumes it natively. Not a Leaflet dependency.
- **All mission projection fields** POSTed by `register.py` (`projEpsg`, `projProj4String`,
  `projOrigin*`, `projBounds*`, `projResUnitsPerPixel`, `planetRadius`) — the app builds the CRS +
  tile grid from them for both eras.
