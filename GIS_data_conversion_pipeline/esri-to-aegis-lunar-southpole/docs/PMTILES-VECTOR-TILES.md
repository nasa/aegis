# PMTiles vector tiles (reference for the OpenLayers migration)

Large / dense vector datasets — the aggregated **contours** are the driving example
(~286 k line features across z0–z14) — are far too heavy to ship as a single GeoJSON. Under
OpenLayers they are served as **vector tiles** in a single `.pmtiles` archive rendered by
`ol-pmtiles` + `ol/format/MVT`.

**The pipeline does not produce this today.** This doc is the technical reference for adding it;
[`OPENLAYERS-MIGRATION-TODO.md`](./OPENLAYERS-MIGRATION-TODO.md) §8 is the task-list entry. It is
a sibling to [`leaflet-notes.md`](./leaflet-notes.md): that doc is the reference for
Leaflet-specific *raster* output; this one is the reference for the new *vector-tile* output.

> **Timing.** Written on `MS3-import` before the OpenLayers app merged. The consumer code and the
> converter it must match currently live on the **`map-prototype`** branch. Reconcile against the
> merged app once this branch is rebased onto it.

> TL;DR: the GIS team delivers **ArcGIS vector tile caches** (Compact Cache V2). A converter
> (which existed on `map-prototype` and was dropped in the restructure) turns a cache into a
> single **clustered MVT `.pmtiles`** carrying an **`esri_tile_info`** metadata block. That block
> is the whole contract — OpenLayers builds the vector tile grid from it and consumes the tiles in
> the native lunar polar projection with **zero reprojection**. Register the result as a
> `"vector-tile"` sublayer (a type the app schema already has).

---

## 1. Source format — ArcGIS Vector Tile Package / Compact Cache V2

We do **not** re-tile from raw shapefiles. Standard vector-tile tooling (tippecanoe) is
Web-Mercator-only and cannot target the lunar south-polar grid; ArcGIS already tiles the data in
the correct projection and bakes the tile-grid metadata into the cache. So the pipeline's job is
**pack, not tile**: read the delivered cache, repackage it as PMTiles, carry the metadata across.

Example delivery — `aegis_static/test/AggregatedContour/`:

```
AggregatedContour/
  p12/                        # the raw ArcGIS Compact Cache V2 (the pipeline input)
    root.json                 # tile grid: tileInfo.lods, origin, rows/cols, spatialReference, fullExtent
    tile/L00 .. L14/*.bundle  # CompactV2 bundles (128×128 tiles each)
    tilemap/root.json
    resources/{styles,sprites,fonts,info}
  extracted/
    contours.pmtiles          # prototype converter output (the pipeline output)
    metadata.json             # vector_layers + tilestats sidecar
    root.json, tile/0..14, resources/   # (exploded form, not needed by the PMTiles path)
```

Because this cache covers the **whole south-pole cap**, contours is most likely a **single shared
cross-mission dataset**, not a per-mission delivery — see the shared-catalog note in
`OPENLAYERS-MIGRATION-TODO.md` §6/§8.

### CompactCache V2 bundle layout (what the converter parses)

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| Bundle header | 64 bytes | skipped |
| Tiles per bundle | 128 × 128 | one `.bundle` = a 128×128 block; filename `R{row:04x}C{col:04x}.bundle` encodes the base row/col in hex |
| Index entry | 8 bytes, little-endian | one per tile: **lower 40 bits = byte offset**, **upper 24 bits = size** (0 ⇒ empty) |
| Index size | 128·128·8 = 131 072 B | follows the header |

Tiles are typically **gzip-compressed** MVT (`\x1f\x8b` magic); the converter can gunzip them or
keep them compressed (record the choice in the PMTiles header).

---

## 2. The converter to port

Source: **`map-prototype:data_conversion_scripts/arcgis_compact_cache_v2_to_pmtiles.py`**
(retrieve with `git show map-prototype:data_conversion_scripts/arcgis_compact_cache_v2_to_pmtiles.py`).

What it does:

1. Walks `tile/L{zoom}/*.bundle`, decodes each bundle's index, extracts every non-empty tile,
   optionally gunzips it, and yields `(z, y, x, bytes)`.
2. Sorts all tiles by `zxy_to_tileid(z, x, y)` and writes a **clustered** PMTiles (best read
   performance) via the Python `pmtiles.writer.Writer`, with header
   `tile_type = TileType.MVT` and `tile_compression = GZIP|NONE` (sampled from the data).
3. Copies the metadata block from the cache `root.json` into the PMTiles metadata (§3).

Invocation today (prototype):

```bash
cd data_conversion_scripts
uv run python arcgis_compact_cache_v2_to_pmtiles.py \
    ../../aegis_static/test/AggregatedContour/p12 \
    ../../aegis_static/test/AggregatedContour/extracted
# → extracted/contours.pmtiles
```

**How it should slot into the current pipeline** (per `data_conversion_scripts/CLAUDE.md`):

- Add it as a **run-by-path, self-contained geo sub-script** in a new concern folder (e.g.
  `vectortile/arcgis_cache_to_pmtiles.py`) with the UTF-8 stdout shim and an argparse CLI, like
  the other geo scripts. Its only non-stdlib dep is the pure-Python **`pmtiles`** writer (stays on
  PyPI; no GDAL — so it need not run under `pixi`).
- Add a **`vectortiles` step** to [`../pipeline/steps.py`](../pipeline/steps.py) that shells out to
  it via `subprocess` on any delivered cache and lands `Data/<name>.pmtiles`.
- Register the output as a `"vector-tile"` sublayer (§4).

---

## 3. The metadata contract — `esri_tile_info` (+ `vector_layers`)

This is the **entire producer→consumer coupling**. The converter copies these keys from the
cache `root.json` into the PMTiles metadata section; the OpenLayers parser reads them back to
build the tile grid. **If `esri_tile_info.lods` is missing, the OL source can't be built and the
layer renders blank** — always emit it.

`esri_tile_info` (from `root.json`): `rows`, `cols`, `origin{x,y}`, `spatialReference{wkid,
latestWkid}`, `lods[{level, resolution, scale}]`, `initialExtent`, `fullExtent`, `minScale`,
`maxScale`, `minLOD`, `maxLOD`, `name`. Plus top-level `vector_layers` (layer ids + fields) for
styling/introspection.

Real values from the example `p12/root.json`:

```jsonc
{
  "tileInfo": {
    "rows": 512, "cols": 512,               // 512-px vector tiles (raster cap grid uses 256)
    "origin": { "x": -8388908.78653284, "y": 8388908.78653284 },   // top-left
    "spatialReference": { "wkid": 103878, "latestWkid": 103878 },   // ESRI Moon South Pole Stereographic
    "lods": [
      { "level": 0,  "resolution": 32769.174947393905, "scale": 123851999.8 },
      // …20 LODs, each resolution halving…
      { "level": 19, "resolution": 0.06250224103430539, "scale": 236.23 }
    ]
  },
  "fullExtent": { "xmin": -8388908.79, "ymin": -8388908.79, "xmax": 8388908.79, "ymax": 8388908.79,
                  "spatialReference": { "wkid": 103878 } },
  "minLOD": 0, "maxLOD": 14,                 // tiles actually present: z0–z14
  "name": "Portal Map"
}
```

`extracted/metadata.json` also shows the vector schema: one layer `Aggregated_Contours_Clip`
with a single numeric field **`_symbol` (values 0–9)** — the attribute the OL styling keys off to
draw major vs minor contours (`contours.ts`).

---

## 4. Tile grid & projection

**The vector tile grid is independent of the raster cap grid** — and that's fine:

| | Raster cap grid | Vector (PMTiles) grid |
| --- | --- | --- |
| origin | `(-931100, -931100)` bottom-left | `(-8388908.79, 8388908.79)` top-left |
| tile size | 256 px | 512 px |
| resolutions | `12800 / 2^z`, z0–z13 | the cache's `lods[].resolution`, ~20 LODs (z0–z14 present) |
| source | `config.py` cap constants | `esri_tile_info` (per archive) |

OpenLayers renders both in the **same view** because they share the **same projection**. The
cache declares ESRI **`wkid 103878` (Moon_South_Pole_Stereographic)**, which is geometrically the
same lunar south-polar stereographic as AEGIS's **`IAU2000:30166`**
(`+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m`). The
prototype registers `IAU2000:30166`, passes it as the source projection, and consumes the tiles
with **zero reprojection** (the tile coordinates are already in that frame).

> ⚠️ **Verify before relying on this:** confirm ESRI `103878` uses sphere radius **1 737 400 m**
> (same as `IAU2000:30166`). The prototype rendered correctly, which is strong empirical evidence
> they coincide, but the wkid ≠ the AEGIS EPSG numerically, so treat the equivalence as
> "confirmed by rendering, pending a params check," not as a definition.

---

## 5. Registration — a `"vector-tile"` sublayer (self-identifying, no new flag)

- The `SublayerType` union in `src/typings/layer.d.ts` **already** includes `"vector-tile"`
  alongside `"tile"` and `"vector"`. Legacy pipeline output only ever used `"tile"`/`"vector"`, so
  a `"vector-tile"` sublayer is unambiguously new — no era flag needed.
- In [`../register.py`](../register.py), add a builder (mirroring `build_vector_sublayer`) that
  emits a `"vector-tile"` sublayer whose **`path` points at the `.pmtiles`**. Like the `"cog"`
  path (§3), it needs **no `tilePattern` / `tileFormat` / `boundingBox`** — the archive's
  `esri_tile_info` is self-describing.
- Header layer: it belongs under the existing **Vector** header layer (or a dedicated one), not
  the Raster header.

Contrast with the **legacy** Leaflet `"vector-tile"` consumption still in the app
(`src/components/page/leaflet-helper.tsx` → `leaflet-vector-tile-layer`, an XYZ `{z}/{x}/{y}.pbf`
URL template via `tilePattern`): that path was never produced by this pipeline. The OL path uses a
single `.pmtiles` file, not an XYZ template — so `path` semantics differ (a file, not a directory
+ pattern). Keep them distinct.

---

## 6. App-side consumption (reference — arrives with the OpenLayers merge)

Currently on `map-prototype`; recorded here so the pipeline output has a target to match:

- Packages: **`ol-pmtiles@2.0.2`** (`PMTilesVectorSource`), **`pmtiles@4.4.1`**
  (`PMTiles.getMetadata()`), `ol@10.7.0` (`ol/format/MVT`, `ol/layer/VectorTile`,
  `ol/tilegrid/TileGrid`, `ol/proj/proj4`), `proj4@2.19.10`.
- Flow: create a source-less `VectorTileLayer` up front → on show, `new PMTiles(url)` →
  `getMetadata()` → **`parseEsriPmtilesMetadata(metadata, maxLodOverride?)`** reads
  `esri_tile_info` into `{ resolutions, origin, extent, tileSize, minZoom, maxZoom, wkid }` →
  **`buildTileGrid(config)`** → `new PMTilesVectorSource({ url, projection: "IAU2000:30166",
  format: new MVT(), tileGrid })`.
- Styling: per-feature style function keyed on `feature.get("_symbol")` (even = major, odd =
  minor) in `src/components/interface/map/testMapPerformant/contours.ts`.
- Note from the prototype: a `maxLodOverride` (e.g. 13) may be applied to drop a top LOD with too
  few tiles — the archive can advertise a `maxLOD` the app chooses not to request.

---

## 7. Serving

The `.pmtiles` is a single file read with HTTP **Range** requests — same hosting contract as COGs
(`OPENLAYERS-MIGRATION-TODO.md` §3–§4): `Accept-Ranges: bytes`, CORS
(`Access-Control-Allow-Headers: Range`), and nginx byte-range **slice caching**. PMTiles issues
fewer, larger Range reads than a COG viewport, but the same infra covers both.

---

## 8. Open questions / decisions for implementation

- **Per-mission copy vs shared catalog.** Contours cover the whole cap → strong candidate to
  publish once to a stable Range-served URL and reference from many missions, rather than copying
  into every `missionFiles/<id>/` (§6). Decide hosting before wiring `register.py`.
- **Styling source.** Use the hardcoded `_symbol` major/minor rule (as the prototype does), or
  carry the ArcGIS `resources/styles/root.json` through so styling is data-driven? The latter is
  more faithful but adds a style-translation step.
- **`vector_layers` handling.** The converter copies it; confirm whether the app needs it (layer
  ids / field names for interaction) or whether `esri_tile_info` alone suffices.
- **Gzip in the archive.** Keep tiles gzipped (smaller archive, header advertises `GZIP`) vs
  decompress (simpler serving). The prototype defaults to decompress.
- **CRS equivalence check.** The `103878 ≡ IAU2000:30166` params check from §4.
- **Validation.** Extend the §7 `validate_tileset` idea to vector tiles: after conversion, assert
  the `.pmtiles` header is MVT, `esri_tile_info.lods` is present, and a known tile id resolves.
