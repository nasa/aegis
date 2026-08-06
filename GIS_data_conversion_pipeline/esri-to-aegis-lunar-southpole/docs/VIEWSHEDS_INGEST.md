# Viewsheds — ingest the delivered vectors

**Status:** Plan — not yet implemented. Counter-proposal to [`VIEWSHEDS.md`](VIEWSHEDS.md).
**Thesis:** the GIS team already ran the analysis and shipped the polygons. **Convert, don't
compute.** The provided GeoJSON and shapefile are equivalent representations of the same products;
use whichever is most convenient as the conversion input, not either raw file directly in AEGIS.
**Scope:** the two delivered viewshed products for A03MP026, and nothing else. Vector only — the
delivered rasters are ignored by design (§3.3). The landing ellipse, DEM, slope and contour products
in the same drop are out of scope; they have their own pipeline steps.
**Output format:** GeoJSON in `Data/`, `type: "vector"`. Same conclusion as `VIEWSHEDS.md` §3, same
reasons, unchanged by anything below.
**Site:** [`SITE_A03MP026-MONS-MOUTON-PLATEAU.md`](SITE_A03MP026-MONS-MOUTON-PLATEAU.md) — Mons
Mouton Plateau. **Drop:**
`F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260805\01_AEGIS\`.

Every number below was measured on that drop with the pixi GDAL (3.12.3), not estimated.

---

## 1. Position relative to `VIEWSHEDS.md`

`VIEWSHEDS.md` builds a line-of-sight engine: crop the DEM, run `gdal_viewshed`, polygonise,
generalise, reproject. It is a sound plan and most of its AEGIS-side analysis is correct and reused
verbatim here. But for A03MP026 it re-derives a product that is already on disk — and to do that it
has to guess the inputs the GIS team used, because the drop does not record them.

| | `VIEWSHEDS.md` (compute) | This plan (ingest) |
| --- | --- | --- |
| New Python package | `viewshed/` + `dem_to_viewshed.py` | none |
| New pipeline step | `viewsheds` | none — reuses `vectors` |
| GDAL surface | `gdalwarp` + `gdal_viewshed` + `gdal_polygonize` + `ogr2ogr` ×2 | `ogr2ogr` ×1 |
| Correctness risks owned by us | `-cc` (Earth refraction), `-ov`==`-iv`, 2.4 B-cell crop guard, DEM SRS spheroid | none — the analysis is the vendor's |
| Observer heights | **unknown**; §4.2 ships a guessed ladder `[2, 36, 41, 54]` with vendor-neutral slugs | not our problem; the delivered products are labelled `BlueOrigin` / `SpaceX` |
| Calibration | §8.1 IoU sweep against the delivered rasters to recover the heights | deleted |
| Fidelity to the certified product | approximate (ArcGIS vs GDAL sweep differences) | exact |
| Ad-hoc observers (a ridge, a station) | ✅ supported | ❌ not possible |

**What this plan deletes outright:** `VIEWSHEDS.md` §4 (which variations to generate), §5 (analysis
design, `-cc`/`-ov`/crop), §8.1 (calibration), and rows 1, 2 and 4 of its §9 risk register. Those
sections exist only to reproduce something we were handed.

**What it keeps:** §3 (GeoJSON is the right format), §3.1 (one class per sublayer, because
`buildVectorStyleFn` applies one `Style` to every feature), §5.4 (the label trap), §6 (registration
contract and the default-styling gap).

**What it costs:** §16. Read that before adopting this plan — the trade is real.

---

## 2. Mission context — A03MP026, Mons Mouton Plateau

The site doc is the authority for the mission's projection and anchor; this plan changes neither.
What matters for the viewsheds:

| From `SITE_A03MP026-MONS-MOUTON-PLATEAU.md` §3 | Value |
| --- | --- |
| `projEpsg` | `IAU2000:30166` |
| `projProj4String` | `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs` |
| `planetRadius` | `1737400` |
| Lander / mission anchor | `--lander-lat -84.223397 --lander-lng 33.5021945` |

**The delivered viewsheds sit on the same sphere and the same projection parameters as the mission**
(`lat_0=-90`, `lon_0=0`, `k=1`, sphere `1737400`), even though the CRS is *named* differently —
`Moon_2015_-_Sphere_Ocentric_South_Polar` (IAU_2015:30135) on the viewsheds versus the mission's
`IAU2000:30166`. Numerically the metres are interchangeable; GDAL will still warn about the name
mismatch, and that warning should be understood rather than suppressed. (`VIEWSHEDS.md` §8.1 makes
the same point about the mission DEM.)

Two things worth fixing in the site doc while we are here:

- **Its `x_m` / `y_m` row disagrees with its own `lat_deg` / `lon_deg` row.** Round-tripping
  `(-84.223397, 33.5021945)` through the mission proj4 gives `(96768.1479, 146188.5577)` — which is
  the delivered `A03MP026_Lander.shp` point to 0.2 mm. The table's `96771.33 / 146191.14` is a
  different point 4.1 m away (`-84.2232684, 33.5025958`). The lat/lon row is the correct one, and it
  is what the `--lander-*` flags use, so nothing downstream is wrong — but `VIEWSHEDS.md` §2
  inherited the bad `x_m`/`y_m` pair and built its "window centred on the lander" argument on it.
  That argument survives, and gets stronger with the right number: the viewshed window centre
  (`96768.0, 146188.5`) is **0.16 m** from the delivered lander point, not 4.3 m.
- The site doc still describes the app as **Leaflet-first** with a `CAP_MAX_ZOOM = 13` "Leaflet-era
  limitation" and a "when we switch to OpenLayers" note. The app is on OpenLayers. Out of scope
  here, but flag it — this plan adds a §12 entry to update the doc, and that section should be
  corrected in the same pass rather than left to accrete.

---

## 3. What the drop contains

### 3.1 The delivered viewshed vectors — the input to this plan

The GeoJSON and shapefile are alternate representations of the same viewshed polygons:

`00_GIS_Files/00_Vector/01_GeoJSON/A03MP026_SfS_1mpp_VIEWSHED_{BlueOrigin,SpaceX}_NONVISIBLE_POLY.geojson`

`00_GIS_Files/00_Vector/00_Shapefiles/A03MP026_SfS_1mpp_VIEWSHED_{BlueOrigin,SpaceX}_NONVISIBLE_POLY.shp`

Use either as the conversion input. The shapefile is the convenient default for this delivery
because its `.prj` carries the source CRS; the GeoJSON can be used when it is more convenient by
supplying the same source CRS explicitly. Keep the alternate representation available as an
independent geometry check:

| | Blue Origin | SpaceX |
| --- | --- | --- |
| Features (polygons) | 531 | 487 |
| Geometry | Polygon | Polygon |
| Extent (projected m) | `94044–99492 E`, `143464–148913 N` | identical |
| CRS (`.prj`) | `Moon_2015_-_Sphere_Ocentric_South_Polar` → `IAU_2015:30135` | identical |
| Attributes | `Id`, `gridcode` (=2), `Shape_Leng`, `Shape_Area` | identical |

Only the **non-visible** class is polygonised — exactly the inverted-mask convention every AEGIS
viewshed has ever used, so no class filtering is needed. The window is a 5.45 km square centred on
the lander (§2).

### 3.2 The delivered GeoJSON — convert it before ingestion

`00_Vector/01_GeoJSON/…_NONVISIBLE_POLY.geojson` is 1 374 KB (Blue Origin) / 1 208 KB (SpaceX) and
contains the same 531 / 487 polygon features and attributes as the shapefiles. It is not AEGIS-ready
as delivered: its coordinates are projected lunar metres and it has no `crs` member. AEGIS assumes
EPSG:4326 for a CRS-less GeoJSON, which produces a giant misplaced filled footprint when the raw
file is loaded directly.

The conversion must assign the known source CRS (`IAU_2015:30135`), reproject to EPSG:4326/CRS84,
round to the chosen precision, and write a new `Data/*.geojson` artifact. For the shapefile input,
read the CRS from its `.prj`; for the GeoJSON input, supply `IAU_2015:30135` explicitly.

### 3.3 The delivered rasters — out of scope, and safely so

`01_Raster/…_VIEWSHED_{BlueOrigin,SpaceX}.tif` (+ `_cog.tif`, `.ovr`, `.vat.dbf`) are the same
analysis at 1 mpp, `1 = Visible / 2 = Non-Visible`. Skipping them loses nothing:

- the polygons are the vectorisation of exactly those rasters (`gridcode = 2` ↔ raster value 2);
- the `.lyrx` symbology is **one fill colour at one opacity** — `#FFA77F` @ 50 % for value 2, alpha 0
  for value 1 — which a vector sublayer expresses natively and the user can then change, and which a
  COG or a pre-colorized pyramid cannot;
- a 1/2-valued Byte COG renders near-black under `WebGLTile`, and an RGBA COG bakes the colour in.

The `.tif.xml` files stay useful as **provenance** (§9.3): they record the ArcGIS lineage
(`Reclassify … Value "0 1 1;NODATA 2"`, run 2026-08-05) that `02_Tables/FGDC_Metadata_Summary.csv`
does not — that CSV documents a `A03MP026_SfS_5mpp_VIEWSHED` and never mentions the two vendor
products at all.

### 3.4 Horizons — adjacent, not in this scope

`MP026_Horizon_1mSfS_10mLOLA_alt_{0,1_5,2,36,41,54}_rng_9998_28.shp` are the skyline as seen from
each observer, and the only place in the drop where an observer height ladder is actually recorded.
They are **already delivered in the form AEGIS needs** (geographic degrees, `GCS_Moon_2000`) — 721
vertices, 21 KB converted against 66 KB as delivered — and once §5 and §9.1 land they need no
further work. Out of scope for this task; noted because §7.3's simplify trap was measured on them
and because §4 uses them as the proof that the GIS team can already export what we are asking for.

---

## 4. The viewsheds are delivered in the wrong form for AEGIS — and what to ask for

This is a call-out, not a blocker: §5–§8 convert around it. But it should go back to the GIS team,
because the fix is theirs, it is cheap, and they are already doing it correctly for other products
in the same drop.

### 4.1 What is wrong

**The delivered polygon coordinates are in projected metres.** AEGIS loads a vector sublayer as
`new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: projCode })`
([layerFactory.ts:186-192](../../../src/components/interface/map/utils/layers/layerFactory.ts#L186-L192)),
so the contract is **geographic degrees on the lunar body**. A projected-metre source has to be
reprojected before it can load. Note this is an *encoding* problem, not a datum problem — per §2 the
sphere and projection parameters match the mission exactly, so the conversion is unambiguous.

**The delivered GeoJSON is the real trap when copied verbatim.** It is the file that looks ready
and is not yet an AEGIS runtime artifact:

- coordinates in **projected metres**, not degrees;
- **no `crs` member**, so `GeoJSON.readProjectionFromObject` falls back to the format's
  `dataProjection: "EPSG:4326"` and OpenLayers transforms `96588` **degrees** into the map — the
  layer lands nowhere, with no error;
- full double precision, pretty-printed, which is where most of the 1.4 MB goes (§7.2 measures the
  same geometry at 471 KB).

Someone loading `01_GeoJSON/` because it is already GeoJSON gets a silently misplaced layer. The
`.shp` is convenient because it carries a `.prj`; either representation is correct once its source
CRS has been established.

**The drop uses three CRS conventions at once:**

| Product | CRS as delivered |
| --- | --- |
| Viewshed polygons | `Moon_2015_-_Sphere_Ocentric_South_Polar` — projected metres |
| Horizons | `GCS_Moon_2000` — **geographic degrees** ✅ |
| Lander point | `Moon_2000_South_Pole_Stereographic` — projected metres |

The horizons prove the export path for what we want already exists. This is an inconsistency inside
one delivery, not a new capability request.

### 4.2 The ask

> **For viewshed (and other polygon/line) products intended for AEGIS:**
>
> 1. **Export GeoJSON in lunar geographic degrees** (`GCS_Moon_2000` or `IAU_2015:30100` — same
>    1737400 m sphere, either is fine), not in projected metres. This is what you already do for the
>    `MP026_Horizon_*` products.
> 2. **The `crs` member must be `urn:ogc:def:crs:OGC:1.3:CRS84`, or absent.** An `IAU_2015::30100`
>    urn is worse than none: OpenLayers cannot resolve it, so it skips the transform silently and
>    the layer is misplaced with no error (§5.2). No `crs` member is acceptable *only* when the
>    coordinates are already degrees.
> 3. **~7 decimal places, minified** (≈1 cm at 84°S). Full double precision pretty-printed costs
>    ~3× the bytes for no added accuracy.
> 4. **Keep shipping the `.shp` as well** — it carries a `.prj`, which makes it the authoritative
>    source and lets us re-derive if the GeoJSON is ever wrong.
> 5. **One class per file.** Non-visible only is correct and is what you already deliver; AEGIS
>    applies one style per sublayer, so a file mixing `gridcode` 1 and 2 could not draw them
>    differently (`VIEWSHEDS.md` §3.1).
> 6. **Record the observer and target height** — in the filename or as an attribute. You already do
>    this for horizons (`alt_54`); the viewsheds carry only a vendor name, and the height appears
>    nowhere in the delivery (§9.3).
> 7. **Do not add a `name` / `label` / `elev` / `Contour` attribute** to a many-feature layer —
>    AEGIS renders those as a per-feature text label by default (§9.2). The current attribute set
>    (`Id`, `gridcode`, `Shape_Leng`, `Shape_Area`) is exactly right.

**Being honest about what the ask buys.** Items 1–3 remove the reprojection risk and the
looks-ready-but-broken trap; they do **not** remove the conversion step. We would still run the
input through the pipeline to name it, validate it, set precision and assert the invariants in §8 —
a delivery is not a build artifact. And §5 has to be fixed regardless, because the pipeline must not
silently mis-handle a projected lunar source whether or not this particular drop contains one.

---

## 5. Blocking defect: the pipeline does not safely convert lunar vectors

`vector/shp_to_geojson.py` — the converter behind the `vectors` (`--in-vector`) step — currently
handles the two source types inconsistently: shapefiles can silently emit unchanged lunar metres,
while `.geojson` inputs are copied verbatim. Measured on the delivered Blue Origin viewshed:

```
$ pixi run python .../vector/shp_to_geojson.py …_BlueOrigin_NONVISIBLE_POLY.shp out.geojson --to-epsg 4326
  Wrote 531 feature(s) → out.geojson (600.1 KB)          # exit 0, no error

$ head -c 200 out.geojson
{"type":"FeatureCollection", …,"crs":{…"urn:ogc:def:crs:EPSG::4326"},
 "features":[{…"coordinates":[[[96588.00000000186, 148910.0], …
                               ^^^^^^^^ projected metres, labelled EPSG:4326
```

The cause is a PROJ guard:

```
ERROR 1: PROJ: proj_create_operations: Source and target ellipsoid do not belong to the same
         celestial body (Moon vs Earth).
ERROR 6: Cannot find coordinate operations from `IAU_2015:30135' to `EPSG:4326'
```

`ogr2ogr` treats that as fatal and refuses to write. **`fiona.transform.transform_geom` does not** —
it returns the input geometry unchanged, raises nothing, and emits no Python warning (verified with
`warnings.catch_warnings(record=True)`: empty). The script then writes those metres out under an
`EPSG:4326` label and exits 0. So the output of the ingest path is, today, byte-for-byte as broken
as the delivered GeoJSON in §4.1 — just smaller. The direct GeoJSON path is broken in a different
way: `step_vectors` copies projected metres without assigning the lunar source CRS.

### 5.1 The fix

Target the lunar body rather than WGS84. Both routes were verified to produce identical coordinates
to 7 decimals:

| Route | Command | Output `crs` member | Verdict |
| --- | --- | --- | --- |
| **A** | `PROJ_IGNORE_CELESTIAL_BODY=YES ogr2ogr -t_srs EPSG:4326` | `urn:ogc:def:crs:OGC:1.3:CRS84` | **Chosen** — see §5.2 |
| B | `ogr2ogr -t_srs IAU_2015:30100` | `urn:ogc:def:crs:IAU_2015::30100` | Correct geometry, **unloadable** (§5.2) |

```
$ PROJ_IGNORE_CELESTIAL_BODY=YES pixi run ogr2ogr -f GeoJSON out.geojson in.geojson \
  -s_srs IAU_2015:30135 -t_srs EPSG:4326 \
  -lco COORDINATE_PRECISION=7 -lco RFC7946=NO
  … "coordinates": [ [ [ 32.9687891, -84.1517699 ], … ] ]      # route B: identical
```

The env var goes **inside the converter**, not in the operator's shell. Despite the name, PROJ
performs a null datum transformation here — which is why routes A and B agree, and which is correct
given §2 (same sphere, no datum to shift). The plan pins that with a verification step (§14.2)
rather than trusting it.

### 5.2 Why the `crs` member decides whether the layer loads

`createVectorLayer` sets `dataProjection` on the **format constructor**, and `VectorSource`'s XHR
loader calls `readFeatures(source, {featureProjection})` with no `dataProjection`. So
`Feature.getReadOptions` takes the `this.readProjection(source)` branch and **the file's `crs`
member wins**:

```js
// ol/format/Feature.js:158
let dataProjection = options.dataProjection ? getProjection(options.dataProjection)
                                            : this.readProjection(source);
```

If `getProjection()` returns `null` (unregistered code), `adaptOptions`' `Object.assign` keeps the
explicit `null` and **no transform runs at all** — a silently misplaced layer, not an error.
OpenLayers registers exactly these aliases for 4326
([ol/proj/epsg4326.js:60](../../../node_modules/ol/proj/epsg4326.js#L60)):

```
CRS:84 | EPSG:4326 | urn:ogc:def:crs:OGC:1.3:CRS84 | urn:ogc:def:crs:OGC:2:84
http://www.opengis.net/def/crs/OGC/1.3/CRS84 | …gml/srs/epsg.xml#4326 | …def/crs/EPSG/0/4326
```

`urn:ogc:def:crs:EPSG::4326` — what the current fiona writer emits — is *not* in that list but still
resolves, via a regex in `projections.get` that rewrites EPSG urns. **`IAU_2015::30100` has no such
escape hatch.** Hence route A in §5.1, and item 2 of the ask in §4.2.

**Rule for the converter, and a runtime assert:** the emitted `crs` member must be one of the
registered 4326 aliases, or absent. Never an IAU urn.

### 5.3 Replace the `.geojson` copy path

`step_vectors` copies `*.geojson` inputs verbatim ([steps.py:421](../pipeline/steps.py)). Pointing it
at `01_GeoJSON/` therefore ships the broken file from §4.1. Replace the copy path with the same
converter used for shapefiles. A CRS-less GeoJSON must receive an explicit source CRS, which is
`IAU_2015:30135` for this delivery. Before writing the output, coordinates must fall in a plausible
lon/lat envelope, feature counts must be preserved, and any emitted `crs` member must resolve to a
registered 4326 alias. If the source CRS cannot be established, error and name the `.shp` sibling.

---

## 6. Second defect: `weight: 0` cannot hide a vector outline

`VIEWSHEDS.md` §3.2/§6.2 states the `.lyrx` intent is reproduced by
`fillColor: #FFA77F, fillOpacity: 0.5, weight: 0`. The first two work. The third does not:

```ts
// layerFactory.ts, buildVectorStyleFn
stroke: new Stroke({ color: style.color || "#3399CC", width: style.weight || 1, … })
//                                                            ^^^^^^^^^^^^^^^^^ 0 → 1
```

`0` is falsy, so `weight: 0` yields a **1 px stroke in `style.color`** — with the default
`color: "#FFFFFF"` that is 531 white outlines drawn over the terrain. There is no stroke-opacity
control for vector sublayers (only the fill gets `withAlpha`), so the outline cannot be dialled out
from the layer panel either.

**Fix (app-side, one line):** `width: style.weight ?? 1`, so an explicit `0` means no stroke. It
matters for any polygon mask, and a fill-only mask is the entire visual product here.

---

## 7. Output: format, size, and the generalisation decision

### 7.1 Format

Unchanged from `VIEWSHEDS.md` §3: **GeoJSON under `Data/`**, registered as `type: "vector"`. It is
the only sublayer type besides `vector-tile` that `buildVectorStyleFn` can genuinely recolour, and
`register.classify` already routes `Data/*.geojson` → `build_vector_sublayer` with no pipeline
change. PMTiles is not needed at these sizes; §16.3 says when it would be.

### 7.2 Measured size ladder

`ogr2ogr … -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7`, all attributes retained:

| Source | `-simplify` | Features | Vertices | Size |
| --- | --- | --- | --- | --- |
| Blue Origin, **as delivered (`01_GeoJSON/`)** | — | 531 | 12 626 | **1 374 KB** |
| Blue Origin | off | 531 | 13 232 | **471 KB** |
| Blue Origin | 1 m | 531 | 8 820 | 347 KB |
| Blue Origin | 2 m | 531 | 6 721 | 288 KB |
| Blue Origin | 5 m | 531 | 4 267 | 219 KB |
| Blue Origin | 10 m | 531 | 3 298 | 192 KB |
| SpaceX | off | 487 | 11 622 | **417 KB** |
| SpaceX | 2 m | 487 | 6 091 | 262 KB |

Reprojection + 7 decimals + minified JSON alone is a **2.9× saving** over the delivered encoding,
with the geometry untouched. (7 decimals ≈ 1 cm at 84°S.) The full A03MP026 viewshed set is 888 KB.

### 7.3 Default: **no simplification**

`VIEWSHEDS.md` §3.3 defaults simplification on (`2 × analysis resolution`) because it is generating
the geometry and owns its vertex budget. This plan is not, and should not silently alter a product
the GIS team certified — the delivered polygons are *already* generalised (median segment ≈ 5 m on a
1 mpp raster; they also produced a 5 mpp variant, so coarsening is their call and they made it).
888 KB for the whole set is a non-problem for a `VectorImageLayer` fetch.

So: **`--vector-simplify` defaults to `0` (off)**, available per input when a far-field or
higher-resolution delivery needs it.

**Trap — the tolerance is in source-CRS units, and the drop mixes kinds.** Verified: on the Blue
Origin shapefile (projected metres) `-simplify 2` means 2 m and behaves as the table shows; on a
horizon shapefile (`GCS_Moon_2000`, **degrees**) `-simplify 2` means 2° and destroys the layer —
21 118 → 517 bytes, 721 → 9 vertices. The converter must **reject a metre-valued tolerance on a
geographic source** rather than pass it through to `ogr2ogr`. This becomes live the moment the GIS
team grants §4.2 item 1, since the viewsheds would then arrive in degrees too.

---

## 8. The conversion chain

One shell-out per input, matching the run-by-path convention:

```
ogr2ogr -f GeoJSON  <out>.geojson  <in>.shp-or-geojson
  [-s_srs IAU_2015:30135]                # required for this CRS-less GeoJSON
  -t_srs EPSG:4326                       # with PROJ_IGNORE_CELESTIAL_BODY=YES (§5.1)
        [-simplify <tol>]                      # source-CRS units; default off (§7.3)
        -lco COORDINATE_PRECISION=7
        -lco RFC7946=NO                        # RFC7946 forces a WGS84 transform → celestial-body error
```

Then, in the converter, before declaring success:

1. **assert the transform happened** — no output coordinate outside `[-180, 180] × [-90, 90]`;
2. **assert the `crs` member is a registered 4326 alias**, or strip it (§5.2);
3. **assert no property key is in the label-trigger set** (§9.2).

Two notes on GDAL 3.12's GeoJSON writer: it adds an `xy_coordinate_resolution` member (a
GeoJSON-2020 extension — OpenLayers ignores unknown members, harmless), and `RFC7946=YES` is not an
option here because it re-forces the WGS84 transform PROJ rejects.

### 8.1 Rewriting `shp_to_geojson.py` on `ogr2ogr` instead of fiona

Recommended, and it is what makes §7.2's knobs free:

- `-s_srs`, `-simplify`, `COORDINATE_PRECISION`, `-select` all come with the tool;
- it **fails loudly** on a transform it cannot perform, which is precisely the bug in §5;
- it matches every other geo script here (contours, tiling) in shelling out to a GDAL CLI, and drops
  a `fiona` import;
- streaming write instead of building the whole FeatureCollection in memory.

The script's CLI (`input`, `output`, `--to-epsg`, `--precision`) stays source-compatible, so other
callers are unaffected and inherit the reprojection fix. Add `--source-crs` for CRS-less GeoJSON;
shapefile inputs may continue to read the `.prj` automatically.

---

## 9. Naming, properties, provenance

### 9.1 Names

`build_vector_sublayer` sets `name` and `path` from the **file stem**
([register.py:183](../register.py)), so the filename is the layer name in the panel.
`A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY` is not that name.

Add `--vector-name`, mirroring the existing `--raster-name` contract (once per `--in-vector`, or
omitted to use the source stem) with the same validation (`steps.py:388`):

| Source | `--vector-name` |
| --- | --- |
| `…_VIEWSHED_BlueOrigin_NONVISIBLE_POLY.shp` or `.geojson` | `viewshed_blueorigin_nonvisible` |
| `…_VIEWSHED_SpaceX_NONVISIBLE_POLY.shp` or `.geojson` | `viewshed_spacex_nonvisible` |

A prettier display name (`Viewshed — Blue Origin (non-visible)`) needs the sidecar in §9.3, because
the filename is also the URL path.

### 9.2 Properties: carry them through, add nothing

Delivered attributes are `Id`, `gridcode`, `Shape_Leng`, `Shape_Area`. **None is in the label-trigger
set**, so the `VIEWSHEDS.md` §5.4 label trap does not fire on this data — verified against
[layerFactory.ts:352-360](../../../src/components/interface/map/utils/layers/layerFactory.ts#L352),
whose triggers are `label` → `elevation`/`ELEVATION`/`elev`/`Contour` → `name`/`NAME`, with
`defaultSublayerStyle.showLabels = true`.

The risk is therefore not the delivered data — it is us, or a future delivery, adding a friendly
`name` property. Keep the assert from `VIEWSHEDS.md` §5.4; it costs nothing and the failure mode
(531 labels on first switch-on) is loud and confusing. It is also item 7 of the §4.2 ask.

Dropping `Shape_Leng`/`Shape_Area` via `-select gridcode` saves 39 KB of 288 KB. Not worth losing
diffability against the delivered shapefile. Keep them.

### 9.3 Provenance sidecar

Since we did not compute this, the layer must say where it came from. `properties.json` is only read
for `Layers/<folder>` — a GeoJSON in `Data/` has no sidecar channel today. Adopt `VIEWSHEDS.md`'s
Phase-4 idea, which is cheaper here because it is also the only way to get a display name:
`build_vector_sublayer` reads an optional `Data/<stem>.properties.json` and merges `name` /
`description` / `legend`. `register.py` only; the app is untouched.

```json
{
  "name": "Viewshed — Blue Origin (non-visible)",
  "description": "Non-visible (occluded) surface from the Blue Origin lander observer. Delivered by the AMPES GIS team 2026-08-05 as A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY.shp (531 polygons, 1 mpp SfS DEM, 5.45 km window centred on the lander). Observer height not recorded in the delivery.",
  "legend": { "legend": [{ "color": "#FFA77F", "description": "Non-visible" }], "unitsAbbr": "", "version": "2026-08-05" }
}
```

Emit only schema-allowed keys — validated against `.local/schemas/sublayerImportable.json`
(`additionalProperties: false`; allowed: `type`, `name`, `description`, `legend`, `tilePattern`,
`tileFormat`, `boundingBox`, `minNativeZoom`, `maxNativeZoom`, `maxZoom`).

**Observer height is genuinely unrecorded** in the drop — absent from the `.lyrx`, the `.tif.xml`
lineage, the FGDC CSV and the export log. This plan does not need it (the products are labelled by
vendor), but the description should say so rather than imply it is known. §4.2 item 6 closes it
upstream; §16.2 covers what changes if the GIS team answers.

---

## 10. Styling: the one gap neither plan closes

Identical to `VIEWSHEDS.md` §6.2, and the single real regression against the pre-colorized raster
this replaces. `defaultSublayerStyle` is `fillColor: "none"`, `fillOpacity: 0`, `color: "#FFFFFF"`,
`weight: 1` — a freshly registered viewshed renders as **white outlines with no fill** and reads as
broken.

Three levers, in cost order:

1. **The §6 fix (`weight ?? 1`)** — a prerequisite for the recipe below to produce a clean mask
   rather than a hairline-outlined one.
2. **Document the recipe** (`fillColor #FFA77F`, `fillOpacity 0.5`, `weight 0`, `showLabels off`) in
   the site doc. Zero code, relies on the operator.
3. **Register a mission-default preset** — `mapSublayerControls[uuid].style` carries exactly those
   fields, `upsert_sublayers` returns created uuids, and `POST /api/v1/preset` exists. Needs an
   `ownerId`, adds a preset surface to `aegis_api.py`, and would overwrite an existing mission
   default. Decide separately; not a blocker.

The `legend` in §9.3 is not styling, but it puts `#FFA77F` / "Non-Visible" in the panel so the intent
is discoverable before anyone touches the sliders.

---

## 11. CLI

One new flag group, extending `--in-vector`:

```
Vectors (--in-vector)
  --in-vector PATH               (existing) Repeatable. .shp / .geojson. Both are converted.
  --vector-source-crs CRS        NEW. Source CRS for each CRS-less GeoJSON. Required for the
                                 delivered viewsheds: IAU_2015:30135. Shapefiles use their .prj.
  --vector-name NAME             NEW. Output stem → sublayer name. Once per --in-vector,
                                 or omitted to use the source filename. (Mirrors --raster-name.)
  --vector-simplify M            NEW. Simplify tolerance in SOURCE CRS units. Default 0 (off).
                                 Once per --in-vector, or once to apply to all.
                                 Errors on a metre-valued tolerance over a geographic source.
  --vector-precision N           NEW. Output coordinate decimals. Default 7.
```

The A03MP026 viewshed set, in full:

```bash
DROP="F:/tempF/MS3_data_drop/AEGIS_MS3_MP026_GIS_Data_20260805/01_AEGIS/00_GIS_Files/00_Vector/00_Shapefiles"

pixi run python esri-to-aegis-lunar-southpole/main.py \
  --mission-id <id> \
  --in-vector "$DROP/A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY.shp" \
  --vector-name viewshed_blueorigin_nonvisible \
  --in-vector "$DROP/A03MP026_SfS_1mpp_VIEWSHED_SpaceX_NONVISIBLE_POLY.shp" \
  --vector-name viewshed_spacex_nonvisible \
  --steps vectors
```

The GeoJSON files can replace the `.shp` paths in this command. Add
`--vector-source-crs IAU_2015:30135` for each GeoJSON input because the delivered GeoJSON has no
`crs` member. The output, not either raw delivery file, is what gets registered and loaded by AEGIS.

No `--viewshed*` group, no `viewsheds` step, no `Observer` dataclass, no `parse_observer_spec()`.
A viewshed is configuration, not code — which is the point.

---

## 12. Files

| File | Change |
| --- | --- |
| `vector/shp_to_geojson.py` | **Rewrite on `ogr2ogr`** (§8.1) as a `.shp` / `.geojson` converter: explicit source CRS, lunar-safe reprojection, `--simplify`, `--precision`, and the three asserts. The blocking fix. |
| `pipeline/steps.py` | `step_vectors`: thread `--vector-source-crs` / `--vector-name` / `--vector-simplify` / `--vector-precision`; validate names as `step_rasters` does; replace the `.geojson` copy path with conversion and validation. |
| `main.py` | The three new arguments. |
| `register.py` | Optional `Data/<stem>.properties.json` sidecar in `build_vector_sublayer` (§9.3). |
| `src/components/interface/map/utils/layers/layerFactory.ts` | `width: style.weight ?? 1` (§6). App-side, one line. |
| `pipeline/summary.py` | Echo vector names / simplify tolerances. |
| `README.md`, `CLAUDE.md` | The lunar-reprojection gotcha, the source-units simplify trap, the `crs`-member rule. |
| `docs/SITE_A03MP026-MONS-MOUTON-PLATEAU.md` | Add the viewsheds to §1/§2/§5/§6 with the command from §11 and the styling recipe from §10; fix the `x_m`/`y_m` row (§2); correct the stale Leaflet framing in §3/§6 in the same pass. |

`box_publish.py` needs no change — it already zips `Data/`.
No new constants block; there is no analysis to parametrise. `--vector-precision`'s default of 7 and
the `#FFA77F` / 50 % recipe are the only two values worth naming in `config.py`.

---

## 13. Phases

**Phase 0 — send the §4.2 ask.** Costs nothing, runs in parallel with everything else, and the
answer only ever simplifies the work. Do not block on it.

**Phase 1 — the conversion fix.** Rewrite `shp_to_geojson.py` on `ogr2ogr`, accept both source
formats, require `IAU_2015:30135` for the CRS-less delivery, add the three asserts, and replace the
`.geojson` copy path. Ship this on its own if nothing else lands.

**Phase 2 — ingest ergonomics.** `--vector-source-crs`, `--vector-name`, `--vector-simplify`,
`--vector-precision`, and `--summary` echo. After this, the two A03MP026 viewsheds are one command.

**Phase 3 — the app one-liner.** `width: style.weight ?? 1`, so a fill-only mask is achievable.

**Phase 4 — the `Data/` sidecar.** Display name, provenance description, legend swatch. Benefits
every GeoJSON sublayer.

**Phase 5 (optional, decide separately) — default preset.** As `VIEWSHEDS.md` §Phase 5.

Phases 1–2 are the plan. 3–5 are the difference between "loads correctly" and "looks right on first
open".

---

## 14. Verification

1. **Reprojection actually happened** — convert either delivered representation; when using the
  GeoJSON, supply source CRS `IAU_2015:30135`. The first ring must read
  `[32.9687891, -84.1517699]`, not `[96588.0, 148910.0]`. If both inputs are tested, compare the
  resulting geometries. This is the regression test for §5 and it fails today.
2. **Route A ≡ route B** — convert both ways (`PROJ_IGNORE_CELESTIAL_BODY=YES` + `EPSG:4326`, and
   `-t_srs IAU_2015:30100`) and diff the coordinates. They agreed to 7 decimals when measured; if
   that stops holding, PROJ has started applying a real datum shift and route A must be abandoned.
3. **`crs` member resolves** — must be one of the registered 4326 aliases (§5.2). Assert an IAU urn
   never reaches the file.
4. **Size and geometry** — `viewshed_blueorigin_nonvisible.geojson` ≈ 471 KB / 531 features /
   13 232 vertices; SpaceX ≈ 417 KB / 487 / 11 622.
5. **Simplify units guard** — a metre-valued `--vector-simplify` over a geographic source must
   **error**, not silently produce a 517-byte file.
6. **Label guard** — `jq` the output for `label`/`elev*`/`Contour`/`name`/`NAME`; must be empty.
7. **Conversion-input guard** — `--in-vector` pointed at `01_GeoJSON/…_NONVISIBLE_POLY.geojson` must
  convert it when `--vector-source-crs IAU_2015:30135` is supplied. The same input without a source
  CRS must error rather than copy projected metres, and should name the `.shp` fallback.
8. **Round trip** — `--steps register --dry-run` prints `type: "vector"`,
   `path: viewshed_blueorigin_nonvisible.geojson`, header bucket `Vector`. Then load in the app,
   apply `#FFA77F` @ 50 % / weight 0 / labels off, and confirm the mask aligns with the NAC basemap
   **and** with the delivered `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin.tif` — the raster we chose not
   to ship is still the best visual cross-check that the vector landed in the right place.
9. **Standard gates** — `python -m py_compile` the edited files; `main.py --list` and `--summary`;
   everything GDAL under `pixi run`. App-side, `npm run test:all` for the `layerFactory.ts` change.

---

## 15. Risk register

| Risk | Owner | Status |
| --- | --- | --- |
| **Delivered viewsheds are projected metres; the delivered GeoJSON has no `crs`** | GIS team (upstream) / us (workaround) | §4. Ask sent in Phase 0; explicit `IAU_2015:30135` source CRS makes the GeoJSON usable as a conversion input now. |
| **Lunar shapefiles are not reprojected; output is metres labelled `EPSG:4326`** | Us | **Live bug today.** §5. Phase 1 + verification 1. |
| **`crs` member OL can't resolve → silent no-transform** | Us + GIS team | §5.2 rule + assert; §4.2 item 2. Route B would trip it. |
| **`-simplify` is in source units; the drop mixes metres and degrees** | Us | §7.3. Default off + the guard in verification 5. |
| **`weight: 0` does not remove the outline** | App | §6, one line. |
| **Default style is `fillColor: "none"`** — layer looks empty on first load | Open | §10. Docs, or the optional preset. Same gap as `VIEWSHEDS.md`. |
| **Delivered GeoJSON copied verbatim** | Us | **Live bug today.** Replace the copy path with CRS-aware conversion (§5.3). |
| **Per-feature labels** | Us + GIS team | Not triggered by the delivered attributes; assert retained (§9.2), §4.2 item 7 keeps it that way. |
| **GeoJSON size / render cost** | Bounded | 471 KB worst case measured. §16.3 says when this stops being true. |
| **Observer heights unrecorded in the delivery** | GIS team | Does not block: products are vendor-labelled. Stated plainly in the description (§9.3); §4.2 item 6 fixes it upstream. |
| **Visible class is not delivered** | By design | Only the mask carries information; matches every prior AEGIS viewshed and the `.lyrx`. §16.1 if that changes. |
| **We cannot produce a viewshed for a new observer** | **Accepted** | §16. The real cost of this plan. |
| DEM crop, `-cc` refraction, `-ov`/`-iv` collision, height-ladder guessing, IoU calibration | — | **Do not exist under this plan.** |

---

## 16. What this plan gives up, and when to build the other one

Be clear-eyed: this is a data-conversion plan, not a capability.

**16.1 We can only ship viewsheds the GIS team ran.** No ad-hoc observer, no "what does the crew see
from Station 4", no re-run at a different height, no visible-class sublayer if someone wants one, no
viewshed at all for a site whose drop omits them. Each is a request to the GIS team with their
turnaround attached, not a pipeline flag.

**16.2 Knowing the heights does not change this plan.** If the GIS team answers "Blue Origin = 36 m,
SpaceX = 54 m", that lands in the `--vector-name` slugs and the sidecar description
(`viewshed_blueorigin_36m_nonvisible`) — no code moves.

**16.3 Escalate to `VIEWSHEDS.md` when any of these becomes true:**

- someone needs a viewshed for an observer the GIS team did not run — the compute plan's §5 and §7
  are then exactly the right design, and its §8.1 calibration becomes *cheaper*, because the two
  delivered rasters and their vector counterparts are ground truth already sitting on disk;
- a delivery arrives without the `_NONVISIBLE_POLY` vectors (raster only) — polygonising it is a
  three-line `gdal_polygonize` job that lands in the same `Data/*.geojson` slot as everything here;
- a far-field product (10 km-plus range) pushes a single file past a few MB — at which point the
  answer is not simplification but PMTiles, and `vectortile/dem_to_contours_pmtiles.py` already owns
  the machinery (GDAL MVT-directory driver + the cap-grid `TILING_SCHEME` + synthesized
  `esri_tile_info`). The same ceiling is already reachable elsewhere in this drop:
  `A03MP026_FarField_LOLA_10mpp_100m_CONTOUR.geojson` is **46 MB**.

The two plans are not mutually exclusive, and §5 is a prerequisite for both — `VIEWSHEDS.md`'s final
`ogr2ogr` reprojection pass hits the same celestial-body wall documented here. Do this one first
because it is smaller, it fixes a live bug, and it delivers the certified product; do the other one
when someone asks a question the delivery cannot answer.
