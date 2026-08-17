# MS3 2026-08-12 Vector Delivery Audit and Import Plan

## Scope

This audit covers:

- Delivery: `F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260812`
- Source-data matrix: `F:\tempF\MS3_data_drop\AGDT_Mission_Source_Data.xlsx`
- Audit date: 2026-08-14

The delivery is vector-only. It contains ten logical datasets exported as shapefiles and GeoJSON, ten ArcGIS `.lyrx` style files, an export log, and an FGDC summary. The export log counts each shapefile and GeoJSON copy separately, which is why it reports 20 vector exports for ten datasets.

## Executive decision

1. Keep the shapefiles as the authoritative source and CRS reference. Normalize them into AEGIS GeoJSON after the lunar reprojection fix. Do not directly import the projected delivered GeoJSON files until the CRS-aware compatibility path is implemented and validated.
2. Keep the geomorphic map as one logical product with separate sublayers for units, contacts, linear features, and surface features. Their geometry and symbology are meaningfully different and should remain independently styleable.
3. Import craters only, with per-feature labels off. The workbook pairs craters with boulders, and they would have been two sublayers of one logical product rather than one mixed-geometry file, but the delivered boulder dataset is **omitted from MS3**: it carries no label and its only per-feature attributes (`SIZE`, `CONFIDENCE`) are undocumented, so it can only render as 48 identical anonymous dots. See feedback items 8 and 9. Craters are importable because their geometry and `TYPE` classes are usable, but they have the same label gap and four undocumented free-text attributes of their own (feedback item 10).
4. Present class-based sublayers by colour and legend, not by per-feature text. Register every sublayer whose only text is a class name with `showLabels: false`: AEGIS defaults vector labels on and falls back to `TYPE`, which would draw 290 `EHT_lineament_*` codes on linear features and 199 copies of two crater strings. Give each class its own colour and one legend entry. See feedback items 11, 12, and 13.
5. Import nomenclature as its own label-oriented sublayer. The 89 supplied points have unique stable IDs and unique labels. Promote the existing `testMapPerformant` draggable place-label proof of concept into the active OpenLayers map.
6. Use normalized GeoJSON for this delivery. Every dataset is small (0-290 features, with source GeoJSON files under 500 KB), so PMTiles would add complexity without a useful size or rendering benefit.
7. Fix lunar reprojection before producing any normalized geographic output. The current converter reports success but silently writes projected meter coordinates into files labeled `EPSG:4326`.

## Workbook comparison

| Workbook product                   | Include in AEGIS | Delivered source                                                                                                     | Audit result                                                                               | Proposed AEGIS product                 |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Craters                            | Y                | `MP026_craters_AM-072736`                                                                                            | 199 line features; geometry valid, but no label and four undocumented free-text attributes | Craters                                |
| Boulders                           | N for MS3        | `MS3_boulders_reviewed_bwd`                                                                                          | 48 point features; geometry valid, but no label and undocumented attributes                | Omitted; see feedback items 8 and 9    |
| Lunar Surface Feature Nomenclature | Y                | `MS3_A03MP026_Nomenclature_v2`                                                                                       | 89 point features; valid; unique `id` and `label` values                                   | Nomenclature                           |
| Geomorphic Map                     | Y                | `GeoContacts_BuildPolygons8`, `GeoContacts`, `LinearFeatures`, `LocationFeatures`, `SurfaceFeatures`, `map_boundary` | Complete style set, but `LocationFeatures` has zero features                               | Geomorphic Map with separate sublayers |
| PSR Locations                      | Y                | `RasterT_Int_psr2`, `RasterT_Int_psr2_1`, broken `PSR_overlays.geojson`                                              | Shapefile copies are byte-identical; one invalid polygon in each; GeoJSON is truncated     | Permanently Shadowed Regions           |

The workbook says craters and boulders "will be combined." That should mean one logical UI product, not one mixed-geometry file — but with boulders omitted for MS3 the product reduces to craters alone. The workbook also says the geomorphic map includes contacts, units, nomenclature, and related features. The delivered standalone nomenclature is a mission naming layer and should not be merged into the scientific geomorphic feature classes.

This delivery does not contain all workbook rows marked Y, such as the DEM, orthomosaic, derived slope/hillshade, contours, viewsheds, or time-aware products. Those are separate source deliveries or pipeline-derived products and are outside this vector-drop audit.

## Delivered dataset inventory

| Dataset                        |   Geometry | Count | Source CRS                                 | GeoJSON condition                                             | Interpretation                                                                                                        |
| ------------------------------ | ---------: | ----: | ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GeoContacts`                  | LineString |    43 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Geologic unit boundaries: 4 certain, 34 approximate, 5 inferred                                                       |
| `GeoContacts_BuildPolygons8`   |    Polygon |    36 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Eight geomorphic units keyed by `Unit`                                                                                |
| `LinearFeatures`               | LineString |   290 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | 215 type-1 lineaments, 70 type-2 lineaments, 5 scarp bases; `TYPE` values are internal codes                          |
| `LocationFeatures`             |      Point |     0 | Moon 2000 south-pole stereographic, meters | Empty FeatureCollection                                       | Empty template for pitted cones, small craters, and shield features                                                   |
| `SurfaceFeatures`              |    Polygon |     4 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Four crimped-terrain polygons                                                                                         |
| `map_boundary`                 |    Polygon |     1 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Source-map extent/helper, not a workbook product                                                                      |
| `MP026_craters_AM-072736`      | LineString |   199 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | 91 crater rims and 108 buried-crater crests; no label, undocumented `Degredatio`/`RimStage`/`EjectaStat`/`InteriorSt` |
| `MS3_boulders_reviewed_bwd`    |      Point |    48 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Boulder locations; no label, undocumented `SIZE`/`CONFIDENCE`                                                         |
| `MS3_A03MP026_Nomenclature_v2` |      Point |    89 | Moon 2000 geographic, degrees              | Valid JSON; `ESRI:104903` geographic degrees                  | Place names for craters, boulders, boulder fields, plains, and rises                                                  |
| `RasterT_Int_psr2`             |    Polygon |    98 | Lunar polar stereographic, meters          | No corresponding usable GeoJSON                               | PSR polygons; exact duplicate of `_1`; one invalid polygon                                                            |
| `RasterT_Int_psr2_1`           |    Polygon |    98 | Lunar polar stereographic, meters          | No corresponding usable GeoJSON                               | Byte-identical duplicate of `RasterT_Int_psr2`                                                                        |
| `PSR_overlays.geojson`         |        N/A |   N/A | N/A                                        | Truncated at 32 bytes after the FeatureCollection declaration | Unusable export                                                                                                       |

All non-PSR shapefile geometries are non-empty and valid. PSR feature `Id=100` has a ring self-intersection at approximately `(98099.5, 145810.5)` and must be repaired or redelivered.

## Delivery files not used as import inputs

The following delivered files are not needed to produce the current AEGIS vector products. Keep the complete delivery archive for provenance, but do not copy these files into the import workspace or register them as layers.

### GeoJSON export copies

The shapefiles are the authoritative import sources because they carry the source CRS in their `.prj` files. These GeoJSON files are export copies rather than import inputs:

- `GeoContacts.geojson`
- `GeoContacts_BuildPolygons8.geojson`
- `LinearFeatures.geojson`
- `LocationFeatures.geojson`
- `map_boundary.geojson`
- `MP026_craters_AM-072736.geojson`
- `MS3_A03MP026_Nomenclature_v2.geojson`
- `MS3_boulders_reviewed_bwd.geojson`
- `PSR_overlays.geojson` (truncated and unusable)
- `SurfaceFeatures.geojson`

The first, second, third, fifth, sixth, eighth, and tenth files contain projected `ESRI:103878` meter coordinates and are not direct inputs to AEGIS's historic GeoJSON loader. `MS3_A03MP026_Nomenclature_v2.geojson` is geographically encoded, but normalizing its paired shapefile keeps every imported layer on one CRS-audited path. `LocationFeatures.geojson` is empty, and `PSR_overlays.geojson` is truncated.

### Duplicate and redundant shapefile artifacts

- The complete `RasterT_Int_psr2_1` shapefile bundle is not needed: `RasterT_Int_psr2_1.cpg`, `.dbf`, `.prj`, `.sbn`, `.sbx`, `.shp`, `.shp.xml`, and `.shx`. It is byte-for-byte identical to `RasterT_Int_psr2`; import only the latter after repairing or redelivering feature `Id=100`.
- Every `.sbn` and `.sbx` file in `00_GIS_Files/00_Vector/00_Shapefiles/` is an optional ArcGIS spatial index. The normalizer does not use these files.
- Every `.shp.xml` file in that directory is ArcGIS metadata and is not read by the normalizer.

The corresponding `.shp`, `.dbf`, `.shx`, `.prj`, and `.cpg` files remain part of each authoritative source bundle: geometry, attributes, index, CRS, and text encoding respectively.

### Not currently importable products

- The `LocationFeatures` shapefile bundle and `.lyrx` are not current layer inputs because the dataset has zero features. Retain them until the GIS team confirms no populated replacement is expected.
- `map_boundary` is a one-feature authoring/reference extent, not a workbook product. Do not import it unless the GIS team confirms that it should be visible in AEGIS.
- The `MS3_boulders_reviewed_bwd` bundle is geometrically valid but is **not imported for MS3**. It has no label property, its `TYPE` is the constant string `boulder`, and its only per-feature attributes (`SIZE`, `CONFIDENCE`) are undocumented, so it can only render as 48 anonymous identical dots. See feedback items 8 and 9. Retain the bundle for the redelivery.

The ten `.lyrx` files are not vector data inputs, but retain them for the reviewed OpenLayers style mapping. Retain `export_log_20260812_132444.txt` and `fgdc_report_summary.pdf` as delivery provenance and audit evidence.

## What the ambiguous geomorphic names mean

- `GeoContacts_BuildPolygons8`: the areal geomorphic/geologic units. Its ArcGIS renderer is keyed by `Unit` and defines `c`, `ci`, `ce`, `cs`, `SMej`, `Dej`, `Hs`, and `Hh`. Those eight keys are not expanded anywhere in the delivery, but each does carry its own explicit fill colour — the only class-based dataset here that does (feedback item 13).
- `GeoContacts`: boundaries between those units. `TYPE` controls certain, approximate, and inferred line styles.
- `LinearFeatures`: mapped linear landforms independent of unit contacts. The delivered classes are two EHT lineament types and scarp bases. `EHT` is not expanded anywhere in the delivery, and nothing distinguishes type 1 from type 2 (feedback item 12).
- `SurfaceFeatures`: mapped areal surface textures. This delivery contains only crimped terrain.
- `LocationFeatures`: intended point landforms (pitted cone, small crater, certain shield, uncertain shield), but the delivered feature class is empty.
- `MS3_A03MP026_Nomenclature_v2`: cartographic place-name anchors. This is not a scientific geometry layer and should use label-specific rendering and interaction.

## Projection findings

### Delivered files

The projected shapefiles and their GeoJSON copies have identical meter-valued extents. For example, the first contact vertex is approximately `(96019.8934, 146938.3064)`. AEGIS currently loads every GeoJSON vector with:

```ts
new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: projCode });
```

Therefore, the projected GeoJSON copies are not valid inputs for the current AEGIS loader even though they include an `ESRI:103878` CRS member. OpenLayers is explicitly told to ignore that member. They are valid direct inputs for the planned CRS-aware rendering compatibility below.

The nomenclature GeoJSON is the only delivered vector already in geographic degrees. Its bounds are `(33.197230, -84.254700)` to `(34.794565, -84.175154)`.

### Legacy GeoJSON rendering compatibility

Legacy mission GeoJSON must remain usable without an import-time setting, a data migration, or per-layer metadata stored by AEGIS. The active-map renderer will determine a source coordinate space for each GeoJSON at load time:

1. Use a valid legacy GeoJSON `crs` member when it is present.
2. Otherwise, treat coordinates as geographic when every coordinate is within longitude/latitude bounds (`-180 <= x <= 180`, `-90 <= y <= 90`).
3. Treat all other coordinates as the established Moon 2000 south-pole stereographic meter space, then render them directly in the compatible mission projection.

Geographic source geometry is transformed into the active mission map projection. Projected meter geometry is not treated as `EPSG:4326` and must not be transformed as if it were longitude and latitude. This is intentionally a two-space compatibility rule, not an attempt to infer an arbitrary projected CRS.

An audit of all 81 legacy `.geojson` files in `F:\_repos\aegis_static\missionFiles` supports this rule: 79 files have degree-bounded coordinates and two have clearly projected meter extents. The two meter files are `AGDT_A03N1034_Boulders.geojson` and `Craters/AGDT_A03N1034_Craters_500m.geojson`, both under mission 16 and both tagged `ESRI:103878`. The audit also found 33 files tagged `ESRI:104903`, 28 tagged `OGC:CRS84`, and six tagged `EPSG:4326`; the remaining files rely on the bounds fallback. A very small projected feature at the stereographic origin remains theoretically ambiguous, but does not occur in the legacy corpus.

### Pipeline converter defect

`vector/shp_to_geojson.py` currently transforms lunar projected input to Earth `EPSG:4326`. PROJ correctly reports that the source and target ellipsoids belong to different celestial bodies. Fiona then returns the input geometry unchanged, while the converter labels the output as `EPSG:4326` and reports success.

Observed test result for a real contact vertex:

| Operation                                              | Coordinate                                  |
| ------------------------------------------------------ | ------------------------------------------- |
| Source                                                 | `(96019.8934000, 146938.3064000)` meters    |
| Current Fiona transform to `EPSG:4326`                 | `(96019.8934000, 146938.3064000)` unchanged |
| Fiona transform to the source CRS's lunar geodetic CRS | `(33.1634438, -84.2163168)` degrees         |
| PyProj transform to the same lunar geodetic CRS        | `(33.1634438, -84.2163168)` degrees         |

The importer must derive the geographic target from `CRS.from_wkt(src_crs).geodetic_crs` for body-specific projected inputs. AEGIS may continue to treat the resulting longitude/latitude degree coordinates as its `EPSG:4326` data projection at load time, but the conversion itself must stay Moon-to-Moon.

Expected geographic bounds after the correct transform include:

| Dataset                    | Longitude/latitude bounds                                  |
| -------------------------- | ---------------------------------------------------------- |
| Contacts and unit polygons | `(33.1634438, -84.2574698)` to `(33.8419943, -84.1891943)` |
| Linear features            | `(33.1704682, -84.2542702)` to `(33.7946775, -84.1968202)` |
| Craters                    | `(33.1912189, -84.2556240)` to `(33.8076090, -84.1902619)` |
| Boulders                   | `(33.1665585, -84.2476404)` to `(33.6714339, -84.1871501)` |
| PSRs                       | `(32.6499154, -84.3219114)` to `(34.3943934, -84.1291612)` |

## Vector import-format assessment

### Decision rule

The prior choice to use shapefiles directly was correct. The delivered shapefiles contain the source CRS in the `.prj` and are the safest input for a Moon-to-Moon normalization. AEGIS imports vector data as `Data/*.geojson`. Therefore the required path is:

```text
Shapefile -> CRS-aware lunar normalization -> AEGIS GeoJSON vector sublayer
```

The valid delivered GeoJSON copies are not automatically equivalent input files. The seven projected datasets use `ESRI:103878` meter coordinates, while the current normalizer copies GeoJSON unchanged and the existing loader historically forces `EPSG:4326`. Directly using those files would either require the Phase 3 source-projection resolver or risk interpreting meters as longitude/latitude. The nomenclature GeoJSON is geographic (`ESRI:104903`) and could render through that resolver, but normalizing it from the paired shapefile is still preferred for one audited, repeatable import path.

PMTiles are appropriate when a layer needs tiled, viewport-scoped decoding: for example, large feature counts or multi-megabyte payloads, frequent low-zoom display of dense geometry, or a delivered ArcGIS vector-tile cache that already defines a compatible cap-grid tile scheme. None of these conditions apply to the MS3 vectors. Creating PMTiles from these GeoJSON/shapefile inputs would also require a new cap-grid MVT tiler and style/attribute verification; the pipeline's current PMTiles path only repacks delivered ArcGIS vector-tile caches.

### Per-layer decision matrix

| AEGIS sublayer                     | Import source                      | Direct delivered GeoJSON?                                   | Imported format           | Decision basis                                                                                     |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Geomorphic Map - Units             | `GeoContacts_BuildPolygons8.shp`   | No: projected `ESRI:103878` meters                          | GeoJSON                   | 36 polygons; independent unit styling needs retained attributes, not tiling                        |
| Geomorphic Map - Surface Features  | `SurfaceFeatures.shp`              | No: projected `ESRI:103878` meters                          | GeoJSON                   | Four polygons; PMTiles has no performance benefit                                                  |
| Geomorphic Map - Contacts          | `GeoContacts.shp`                  | No: projected `ESRI:103878` meters                          | GeoJSON                   | 43 lines; `TYPE` drives feature-level dash styling                                                 |
| Geomorphic Map - Linear Features   | `LinearFeatures.shp`               | No: projected `ESRI:103878` meters                          | GeoJSON                   | 290 lines, the largest source but still under 500 KB and small for OL vectors; labels off          |
| Geomorphic Map - Location Features | `LocationFeatures.shp`             | No: empty source                                            | Omit                      | Zero features; do not register a blank GeoJSON or PMTiles layer                                    |
| Geomorphic Map - Boundary          | `map_boundary.shp`                 | No: projected `ESRI:103878` meters                          | GeoJSON only if confirmed | One reference polygon; no tiling justification                                                     |
| Craters                            | `MP026_craters_AM-072736.shp`      | No: projected `ESRI:103878` meters                          | GeoJSON                   | 199 lines; retain `TYPE` for line styling; labels off, undocumented attributes retained but unused |
| Boulders                           | `MS3_boulders_reviewed_bwd.shp`    | No: projected `ESRI:103878` meters                          | Omit for MS3              | 48 points, but no label and undocumented `SIZE`/`CONFIDENCE`; feedback items 8-9                   |
| Nomenclature                       | `MS3_A03MP026_Nomenclature_v2.shp` | Conditionally: geographic `ESRI:104903` after resolver test | GeoJSON                   | 89 label anchors with stable `id`/`label`; feature access and dragging favor GeoJSON               |
| Permanently Shadowed Regions       | `RasterT_Int_psr2.shp`             | No: supplied GeoJSON is truncated                           | GeoJSON after repair      | 98 polygons; repair/validate first, then small enough for a normal vector layer                    |

`RasterT_Int_psr2_1.shp` is an exact duplicate and must not be imported. For each accepted shapefile, retain the original source archive beside the conversion report and record its checksum, CRS, feature count, and output bounds.

### Reassessment trigger

Re-evaluate a single sublayer for PMTiles only after measurement shows that its normalized GeoJSON causes material initial-load, memory, interaction, or rendering degradation at the mission's expected zooms. Record the measured feature count, byte size, viewport render time, and target cap-grid metadata before converting. A format change must preserve the attributes needed for styling, labels, filtering, and feature inspection; PMTiles is not a substitute for fixing CRS handling.

## Recommended AEGIS layer layout

### Geomorphic Map

Use one logical layer/group with these independently toggleable sublayers, in draw order:

1. `Geomorphic Map - Units` from `GeoContacts_BuildPolygons8`
2. `Geomorphic Map - Surface Features` from `SurfaceFeatures`
3. `Geomorphic Map - Contacts` from `GeoContacts`
4. `Geomorphic Map - Linear Features` from `LinearFeatures`
5. `Geomorphic Map - Location Features` only after a non-empty source is delivered
6. `Geomorphic Map - Boundary` only if the GIS team confirms it is operationally useful

Do not flatten these into one GeoJSON. Separate files preserve geometry-specific styling, legends, ordering, and visibility. The importer should preserve source attributes and add normalized AEGIS style properties derived from the `.lyrx` unique-value renderer. The active map currently has only one preset style per sublayer, so reproducing category-specific fills, dashes, and point symbols requires either per-feature style properties or one output sublayer per renderer class. Per-feature style properties are preferred to avoid producing many tiny layers.

Register contacts, linear features, and surface features with `showLabels: false`. None of them carries a per-feature label — their only text is the `TYPE` class, which AEGIS's label fallback would stamp on every feature (290 lines and three distinct strings on linear features alone). Carry the class names in a legend instead, and give each class its own colour: the delivered `.lyrx` files distinguish contact and crater classes by dash alone and render the two lineament types identically, and AEGIS's sublayer legend is a colour-swatch list with no dash or hatch field. Units are the exception — their eight explicit fill colours transfer directly. See feedback items 12 and 13.

### Craters

One sublayer: `Craters`, linework styled by `TYPE` (`crest of crater rim` versus `crest of buried crater`), with `showLabels: false`.

Labels are off for the same reason as linear features: `TYPE` is a class name, not a label, so the fallback chain would draw 199 labels holding two distinct strings — and both are long enough ("crest of buried crater") to cover the linework they annotate. Colour the two classes distinctly rather than relying on the delivered dash-only distinction, and give each a legend entry. Turn labels on when the dataset carries the compounded per-feature label requested in feedback item 11.

`Degredatio` correlates strongly with `TYPE` and looks like an ordinal freshness stage (1 = rimless/buried, 4 = sharp), which would be the natural second styling dimension — graduated line weight or colour. Do not use it until the GIS team documents it (feedback item 10); retain it, `RimStage`, `EjectaStat`, `InteriorSt`, and `COMMENT` as feature properties for later tooltips and filtering.

The workbook pairs this with a boulder sublayer under a single "Crater and Boulder Features" product. **Boulders are omitted for MS3** (feedback items 8 and 9), so the product ships as craters alone. Restore the two-sublayer grouping when a usable boulder dataset is delivered: craters are lines and boulders are points, so they stay separate physical GeoJSONs even then.

The boulder source does not contain place names. Its 48 points are locations, not labels. Named boulders, boulder fields, and craters are supplied by the separate nomenclature dataset.

### Boulders

Omitted for MS3: not converted, not registered. The omission is a data decision (feedback items 8 and 9), not a rendering one — the generic vector path draws point symbols, so the layer imports as soon as the dataset carries the agreed `label` property (feedback items 8 and 11) and documented `SIZE`/`CONFIDENCE` semantics (item 9).

On redelivery:

- Register it with `showLabels: false` until it carries a real per-feature label. `TYPE` is the last entry in AEGIS's label chain and is the literal string `boulder` on all 48 features, so labels-on stamps the same word 48 times over a 1.2 km by 2.2 km patch.
- Use one flat sublayer-level symbol. `SIZE` (values 0, 1, 2, 3, 6) and `CONFIDENCE` (values 1, 2, 3) are undocumented, so do not graduate the symbol by either until the GIS team confirms their units and direction; retain both as feature properties for tooltips and filtering.
- A flat symbol matches the delivered symbology anyway. `MS3_boulders_reviewed_bwd.lyrx` is a `CIMSimpleRenderer` — a single 4 pt circle with a magenta `rgb(223, 115, 255)` stroke over a translucent violet fill, identical for every feature, not varied by `SIZE` or `CONFIDENCE`. Reproduce it with the sublayer's `color`, `fillColor`, and `fillOpacity`.

### Nomenclature

Use the 89 nomenclature points as a dedicated place-label layer:

- Label property: `label`
- Stable feature key: `id` (all 89 are present and unique)
- Default geometry: hidden point anchor
- Visual: boxed text label, decluttering, dashed tether and anchor when moved
- Interaction: draggable in editor mode; read-only in dashboard and minimap initially
- Persistence for the first implementation: per-client, in-memory placement, reset on reload

The existing `src/pages/testMapPerformant.tsx` and `src/components/interface/map/testMapPerformant/placeLabels.ts` are suitable proofs of concept, but they currently look for `Feat Name`/`name`, do not persist positions, and are not wired into the production map. Production code should accept `label`, preserve the original anchor, cache styles, and isolate `Translate` to nomenclature layers.

If moved-label persistence is required, store offsets by `(sublayerUuid, feature id)` in preset state rather than rewriting the shared source GeoJSON. Confirm that requirement before adding a database/API contract.

### Permanently Shadowed Regions

Use only `RasterT_Int_psr2.shp`; `_1` is byte-for-byte identical. Run `make_valid` during import and assert that the repaired output still contains 98 logical features. Do not use the truncated `PSR_overlays.geojson`.

## Implementation plan

### Implementation status (2026-08-17)

Executed in the current change set:

- Phase 1 is implemented as a generic, single-source vector normalization path. One `--in-vector` value is accepted per pipeline run; shapefile and GeoJSON inputs both pass through Fiona and the Moon-to-Moon CRS transform. Each run can set an independent output name, repair policy, expected feature count, and machine-readable audit output.
- Phase 3, item 7 is implemented. The active OpenLayers loader resolves recognized embedded CRS names, falls back to whole-document coordinate bounds when no CRS is present, and rejects malformed documents and unsupported embedded CRS names.
- Phase 3, items 2 and 3 are implemented. The place-label style moved out of the sandbox into `utils/styles/gazetteerLabels.ts`, reads the delivered `label` field, preserves each feature's original anchor, and draws the dashed tether and anchor dot when a label is moved. `TileLayers` owns the `Translate` interaction, scoped to layers flagged `movableLabels`.
- Phase 3, item 4 is **half** implemented: generic point symbols are done. `buildVectorStyleFn` sets `image` for `Point` and `MultiPoint` — a cached `ol/style/Circle` at a fixed `POINT_SYMBOL_RADIUS`, stroked with the sublayer's `color`/`weight` and filled from `fillColor`/`fillOpacity`. Since `fillOpacity` defaults to 0 the default symbol is an open ring; the circle's stroke ignores `isDashed` because a dash pattern on a symbol that small reads as noise; and a point label is pushed clear of its symbol with `offsetY`. `MapSublayerStyle` gains no point-radius field, so the importable sublayer schema is unchanged — add an explicit `pointRadius` only if per-sublayer sizing proves insufficient. Per-feature unique-value style overrides for the geomorphic classes are not implemented — the only hook is a fallback that reads a feature's own `fillColor`/`color` property, and no delivered dataset carries one except `GeoContacts`, whose colour is black on every feature.
- Focused verification converted the real `GeoContacts.shp` and projected `GeoContacts.geojson` independently. Both produced 43 features with bounds `(33.1634438, -84.2574698)` to `(33.8419943, -84.1891943)`. The projection resolver has focused unit coverage for recognized CRS forms, bounds fallback, malformed inputs, and non-finite coordinates. Point symbols have unit coverage for the unfilled default, the filled case, and the line/polygon negative case.

Revised or deferred:

- The proposed delivery-specific manifest/batch importer was removed. A single command must not select or import multiple files from a delivery. Import each accepted dataset by running the generic pipeline again with that source's parameters.
- Phase 2 product grouping, source selection, style review, and omission decisions remain this document's operator checklist; they are not hardcoded into the pipeline. Phase 2 item 6 (CIM unique-value parsing from each `.lyrx`) is unexecuted, which is what blocks the other half of Phase 3 item 4 and every class legend.
- The nomenclature discriminator (Phase 3, item 1) is **not** the explicit flag this document asked for. `isGazetteerSublayer` matches `gazetteer`/`nomenclature` in the sublayer name, with `isGazetteerFeatures` property-sniffing as a fallback — exactly the filename/property guessing item 1 was written to avoid. Item 6 (schema field, admin control, regenerated importable schema) is untouched, so there is currently no other way to mark a sublayer as a place-label layer.
- Phase 3 item 5 is unexecuted: gazetteer labels carry a within-layer `zIndex` of 100 but still sit on a data layer at a negative layer z-index, so they render below operational AEGIS features.
- The `Translate` interaction is registered in all three map modes. This document specifies editor-only dragging with dashboard and minimap read-only; that gate is not implemented.
- Vector sublayers cannot carry a legend at all today: `register.build_vector_sublayer` never reads a `properties.json`, and the vectors step never writes one. This blocks Phase 4 item 2 and feedback item 13 on the AEGIS side, independently of what the GIS team delivers.
- All remaining Phase 4 work — registration of the delivery, the reviewed preset (including the `showLabels: false` settings), and visual comparison against ArcGIS — is unexecuted. Until that preset exists, contacts, linear features, and craters would import with labels **on**, which is the clutter feedback items 12 and 13 exist to prevent.

Example independent runs:

```bash
# Contacts
pixi run python esri-to-aegis-lunar-southpole/main.py \
   --mission-id 50 \
   --in-vector F:/drop/00_GIS_Files/00_Vector/00_Shapefiles/GeoContacts.shp \
   --vector-name MS3_Geomorphic_Contacts \
   --expect-vector-features 43 \
   --steps vectors

# PSR, with source-specific repair and count validation
pixi run python esri-to-aegis-lunar-southpole/main.py \
   --mission-id 50 \
   --in-vector F:/drop/00_GIS_Files/00_Vector/00_Shapefiles/RasterT_Int_psr2.shp \
   --vector-name MS3_PSR \
   --repair-vector-invalid \
   --expect-vector-features 98 \
   --steps vectors
```

### Phase 1: Make vector normalization projection-safe

1. Replace the shapefile-only assumptions in `vector/shp_to_geojson.py` with a vector normalizer that accepts shapefile or GeoJSON and reads the source CRS through Fiona.
2. For projected lunar data, transform to the source CRS's geodetic CRS rather than Earth `EPSG:4326`.
3. For already-geographic lunar data, preserve longitude/latitude coordinates without a Moon-to-Earth operation.
4. Reject projected GeoJSON lacking a usable CRS instead of copying it into `Data/`.
5. Treat any PROJ/GDAL transform error or unchanged out-of-range coordinate as a hard failure.
6. Add optional geometry repair for known polygon inputs and report every repaired feature.
7. Emit a machine-readable audit summary with source CRS, output bounds, feature count, geometry types, invalid/repaired counts, and property names.

### Phase 2: Import delivery products through independent generic runs

1. Run the generic pipeline once for each accepted source, using `--vector-name` to assign its stable output name. Do not add a delivery manifest or multi-file command.
2. Run the four non-empty geomorphic feature classes separately; do not run the empty `LocationFeatures` source.
3. Run craters. Do not run `MS3_boulders_reviewed_bwd`: it is omitted for MS3 (feedback items 8 and 9). Register it as a sibling sublayer of craters only once a usable boulder dataset arrives.
4. Run only `RasterT_Int_psr2` with `--repair-vector-invalid` and `--expect-vector-features 98`; do not run the duplicate or truncated alternatives.
5. Run nomenclature separately and verify its stable `id` and `label` properties in the audit and output.
6. Parse the supported CIM unique-value renderer subset from each `.lyrx`, or use an explicit reviewed style mapping when a CIM symbol cannot be represented in OpenLayers. Several classes need one: the two lineament types carry identical symbology, contacts and craters are distinguished by dash alone, and surface features use an embedded BMP hatch. Assign each class a distinct colour in the reviewed mapping.
7. Emit a `properties.json` legend for each class-based sublayer in the existing AEGIS format — one `{ color, description }` row per class, `unitsAbbr` empty. `properties/write_properties.py` currently derives legends only from numeric GDAL ramps and hardcodes `type: "tile"`; it needs a categorical path for `type: "vector"` sublayers. The format is unchanged (feedback item 13).
8. Include source filename, source style filename, category counts, and conversion decisions in `Data/conversion_report.md`.

### Phase 3: Extend active-map rendering

1. Add an explicit nomenclature/place-label sublayer discriminator rather than guessing from a filename or property.
2. Extract the sandbox place-label style into production map styles and support the delivered `label` field.
3. Add a nomenclature behavior that owns the editor-only `Translate` interaction and preserves each feature's original anchor for tether rendering.
4. Add per-feature vector style overrides for the unique-value geomorphic classes. Point-symbol support in the generic vector style function is done — see the implementation status above.
5. Keep imported data layers below operational AEGIS features while rendering nomenclature at the existing place-label z-index.
6. Update registration/schema/admin controls for the new discriminator and regenerate the importable sublayer schema.
7. Extend `layerFactory` with a GeoJSON source-projection resolver that supports the broad legacy corpus without an import setting, data migration, or per-layer stored metadata:
   - Normalize embedded CRS names from `ESRI:*`, `EPSG:*`, `OGC:CRS84`, and their OGC URN forms.
   - Treat known geographic lunar and geographic CRS names (`ESRI:104903`, `EPSG:4326`, and `OGC:CRS84`) as longitude/latitude source data and transform them into the active mission projection.
   - Treat the known Moon 2000 south-pole stereographic CRS (`ESRI:103878`) as native projected meter coordinates when compatible with the active mission projection.
   - For GeoJSON without a usable CRS, recursively inspect every coordinate in every supported GeoJSON geometry type and classify only wholly degree-bounded data as geographic; classify other coordinates as the established Moon 2000 south-pole stereographic meter space.
   - Reject malformed GeoJSON and embedded projected CRS names outside the supported compatibility set rather than silently interpreting them as longitude/latitude.

### Phase 4: Register and verify the product

1. Register the generated GeoJSON files idempotently with human-readable names and descriptions.
2. Create a mission preset with reviewed default ordering, visibility, opacity, labels, and legends. Labels default on for vector sublayers (`showLabels ?? true`), so the preset must set `showLabels: false` explicitly on craters, contacts, linear features, and surface features; nomenclature is the only MS3 sublayer with a real per-feature label. Every class-based sublayer registers a `properties.json` legend with one `{ color, description }` entry per class — the same legend format the raster thematic layers already use — so the classes those labels would have carried are readable from the legend instead.
3. Compare AEGIS screenshots against the delivered ArcGIS styles at matching extents.
4. Obtain GIS-team confirmation for the omitted empty `LocationFeatures`, the omitted boulder layer, optional `map_boundary`, repaired PSR polygon, and any approximated CIM symbols.

## Required tests and acceptance criteria

### Conversion tests

- A lunar polar source coordinate transforms to the known longitude/latitude result above.
- Every output coordinate satisfies `-180 <= longitude <= 180` and `-90 <= latitude <= 90`.
- A projected GeoJSON passed through `--in-vector` is reprojected or rejected, never blindly copied.
- Output-to-source round trips remain within an agreed metric tolerance (target: 0.01 m).
- Feature counts and required attributes match the inventory table.
- Empty inputs are reported and omitted rather than registered as blank layers.
- Invalid PSR feature `Id=100` is repaired deterministically and the output has 98 features.
- Duplicate PSR inputs are detected by content, not imported twice.
- Truncated/invalid JSON fails before registration.

### App tests

- Nomenclature loads from geographic GeoJSON at the expected mission location.
- Legacy GeoJSON with `ESRI:103878` meter coordinates renders at the expected mission location without being interpreted as `EPSG:4326`.
- All seven non-empty, projected MS3 GeoJSON files render from their `ESRI:103878` CRS, and `MS3_A03MP026_Nomenclature_v2.geojson` renders from its `ESRI:104903` geographic CRS.
- Geographic GeoJSON tagged as `EPSG:4326`, `OGC:CRS84`, or an equivalent OGC CRS URN resolves as longitude/latitude source data.
- The empty `LocationFeatures.geojson` is omitted and the truncated `PSR_overlays.geojson` is rejected before a map layer is created.
- Untagged legacy GeoJSON with degree-bounded coordinates is rendered as geographic, while an untagged meter-valued fixture is rendered as south-pole stereographic.
- The bounds classifier handles Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, and GeometryCollection inputs, including empty geometries.
- A malformed GeoJSON document or an unsupported embedded projected CRS fails visibly instead of falling back to `EPSG:4326`.
- All 89 labels render from `label`; no point marker is visible beneath an unmoved label.
- Editor dragging moves only the selected label and draws a tether to the original anchor.
- Dashboard/minimap behavior matches the chosen read-only policy.
- Label decluttering does not suppress unrelated geomorphic or crater geometry.
- Crater, contact, linear-feature, and surface-feature sublayers draw no per-feature text with the reviewed preset applied, and a sublayer with `showLabels` unset still defaults to on for layers that do carry a real label.
- A non-gazetteer point GeoJSON sublayer with no label property draws its symbols and no text, and its symbol honours the sublayer `color`, `weight`, `fillColor`, and `fillOpacity` controls. No MS3 dataset exercises this, so it is covered by a fixture.
- Unique-value contact/unit/linear classes receive distinct reviewed styles, each class resolves to its own colour, and every class-based sublayer renders a legend entry per class.
- Existing generic vectors, contours, PMTiles, and operational marker labels do not regress.

### Manual visual checks

- Overlay the converted contact, crater, PSR, and nomenclature layers on the mission basemap and confirm alignment at several recognizable features.
- Capture desktop and mobile screenshots with default visibility and with each logical product isolated.
- Compare category colors, dashes, marker symbols, labels, draw order, and legend wording with the delivered `.lyrx` files in ArcGIS.

## Feedback for the GIS team

Tracked while importing this delivery and wiring these layers into the active AEGIS map. This section is the list to send back to the GIS team, including outstanding problems with the delivery and open questions for the GIS/product teams.

### Delivery contents as received

```text
AEGIS_MS3_MP026_GIS_Data_20260812
├── 00_GIS_Files
│   ├── 00_Vector
│   │   ├── 00_Shapefiles      (shapefile version of each dataset)
│   │   └── 01_GeoJSON
│   │        GeoContacts.geojson
│   │        GeoContacts_BuildPolygons8.geojson
│   │        LinearFeatures.geojson
│   │        LocationFeatures.geojson
│   │        map_boundary.geojson
│   │        MP026_craters_AM-072736.geojson
│   │        MS3_A03MP026_Nomenclature_v2.geojson
│   │        MS3_boulders_reviewed_bwd.geojson
│   │        PSR_overlays.geojson
│   │        SurfaceFeatures.geojson
│   └── 02_Tables
│        export_log_20260812_132444.txt
│        fgdc_report_summary.pdf
└── 01_Styles                  (one .lyrx per dataset, ten total)
```

### Problems with delivery

### 1. The GeoJSON copies are not needed

Deliver shapefiles only. The shapefile carries its source CRS in the `.prj`, which is what the AEGIS importer needs; the paired GeoJSON exports add no information and cost review time. Every projected GeoJSON in this delivery also carries meter coordinates that must not be read as longitude/latitude, and two of them are unusable outright (`LocationFeatures.geojson` is empty, `PSR_overlays.geojson` is truncated).

### 2. Label-property naming is inconsistent across datasets

Each dataset puts its human-readable label in a differently named property:

| Dataset (AEGIS product name)                    | Property holding the label |
| ----------------------------------------------- | -------------------------- |
| Nomenclature (`MS3_A03MP026_Nomenclature_v2`)   | `label`                    |
| Geomorphic Units (`GeoContacts_BuildPolygons8`) | `Unit`                     |
| Geomorphic Contacts (`GeoContacts`)             | `TYPE` (all caps)          |
| Geomorphic Linear Features (`LinearFeatures`)   | `TYPE` (all caps)          |
| Geomorphic Surface Features (`SurfaceFeatures`) | `TYPE` (all caps)          |
| Craters (`MP026_craters_AM-072736`)             | none; only `TYPE`          |
| Boulders (`MS3_boulders_reviewed_bwd`)          | none; only `TYPE`          |

Craters and boulders are the worst cases and are covered in detail in items 8 and 10: neither has a label property, and in both the only text-bearing field is a class name shared by every feature or nearly every feature. Item 11 is the concrete ask for those two datasets.

Because of this, AEGIS falls back through a fixed chain of property names to find a label, ending `… name → NAME → Unit → TYPE`. That chain has had to grow once per spelling this drop invented, it is hardcoded with no per-sublayer override (`MapSublayerStyle` has no label-property field), and it will break the moment a future delivery uses `Label`, `Name`, or `Class`, for example. It is also lossy: because the chain is ordered, a dataset carrying two of these properties silently labels from whichever appears first, not from whichever the GIS team meant. **Need: settle on one label property name, spelled identically in every dataset, for all future deliveries.** `label` (lowercase) is the preferred name because the nomenclature dataset already uses it. Keep the domain-specific attributes (`Unit`, `TYPE`, `SIZE`, `CONFIDENCE`) as well — they are useful for styling and filtering — but add the one agreed label property alongside them.

### 3. `Geomorphic_Units` has a dead `Type` property

`GeoContacts_BuildPolygons8` carries a valid `Unit` value per feature, but also a `Type` property whose values are all `null` or the literal string `"<null>"`. The literal `"<null>"` string is worse than an absent property, because consuming code has to special-case it. Either populate `Type` with meaningful values or drop the field from the export.

### 4. `MS3_Geomorphic_Contacts` is not usable as delivered

`GeoContacts` contains only a `TYPE` attribute with values such as `inferred` and `approximate`, and every feature carries `"color": "rgb(0, 0, 0)"`. AEGIS labels these lines from `TYPE`, but that only states the mapping confidence — there is still nothing to explain what boundary each line represents or which units it separates.

### 5. `Geomorphic_SurfaceFeatures` is likely out of scope

Beyond using `TYPE` for its label, this dataset sits well outside the EVA operating area and consists only of unlabeled areas. Unless there is a planning reason to carry it, it can be dropped from future data deliveries.

### 6. `map_boundary` is not needed

AEGIS does not use it. It is a single-polygon authoring/reference extent describing the source map's own footprint, not a mission product, and it carries no information a planner acts on. Drop it from future deliveries.

### 7. The PSR datasets are duplicated and partly invalid

- `RasterT_Int_psr2` and `RasterT_Int_psr2_1` are byte-for-byte duplicates.
- PSR feature `Id=100` has a self-intersecting ring.
- `PSR_overlays.geojson` is truncated.

### 8. `MS3_boulders_reviewed_bwd` has no label, and `TYPE` is not a type

This is the same problem as item 2, in its most extreme form. The dataset carries `FID`, `TYPE`, `COMMENT`, `SIZE`, and `CONFIDENCE` and nothing else, and the only text-bearing field is a class name:

- `TYPE` is the literal string `boulder` on all 48 features. The delivered `MS3_boulders_reviewed_bwd.lyrx` carries a label class bound to the Arcade expression `$feature.TYPE`; enabled, it would draw the word "boulder" 48 times across a 1.2 km by 2.2 km area. That is the layer name repeated once per feature, not a label. Layer labelling is in fact switched off in that `.lyrx` — as it is in every `.lyrx` in this delivery except nomenclature, the one dataset with a real label field. AEGIS defaults vector labels on and reads `TYPE` as a last-resort label, so on redelivery this layer must ship with labels disabled until it carries a real one.
- `COMMENT` holds the LROC image IDs each boulder was identified in, for example `M1157658572LR, M180857163RC, M178498275LC`. That is provenance suited to a tooltip, not a label.
- `FID` is the shapefile row index and is not stable across redeliveries.

We need the one agreed label property from item 2, populated with a real per-boulder name where one exists. Do not fill a label field with a class name. Also supply a stable per-feature `id` that survives redelivery, as the nomenclature dataset already does.

Combined with item 9, there is nothing in the dataset that distinguishes one boulder from another in a way AEGIS can present. The layer would be 48 identical unlabelled dots that a planner cannot identify, grade, or filter. It will be imported once a label property and documented `SIZE`/`CONFIDENCE` semantics are delivered.

### 9. The boulder `SIZE` and `CONFIDENCE` attributes are undocumented

`SIZE` and `CONFIDENCE` are the only per-feature discriminators in the boulder dataset and are the attributes a planner would actually act on, but neither is defined anywhere in the delivery. Every `attrdef` in `MS3_boulders_reviewed_bwd.shp.xml` is empty except the auto-generated `FID` and `Shape` entries, and the `.lyrx` renderer does not use either field.

- `SIZE` takes the values 0, 1, 2, 3, and 6. **Need:** the unit. Metres of diameter, or an ordinal class? Either reading leaves `SIZE = 0` (2 features) ambiguous.
- `CONFIDENCE` takes 1 (7 features), 2 (24 features), and 3 (17 features). **Need:** which end of the scale is most confident, and what each level means.

Until both are documented, AEGIS could only draw every boulder with the same symbol and could not grade or filter them, which removes the planning value of a boulder layer. This is the second half of the reason the layer is omitted for MS3 (see item 8).

Separately, **need:** an expansion of `bwd` in the dataset name, or a rename. The delivery gives no key for it.

### 10. `MP026_craters_AM-072736` has four undocumented attributes, and none of them is a label

Craters are imported for MS3 because the geometry and the two `TYPE` classes are usable, but the rest of the dataset has the same problems as boulders. It carries `FID`, `OBJECTID`, `TYPE`, `COMMENT`, `Degredatio`, `RimStage`, `EjectaStat`, `InteriorSt`, and `SHAPE_Leng`. The four middle fields are the geological content of the layer, and all four are undocumented in exactly the way item 9 describes: every `attrdef` in `MP026_craters_AM-072736.shp.xml` is empty except the auto-generated `FID` and `Shape` entries, and §5 of `fgdc_report_summary.pdf` lists attribute names and storage types with no definitions for any dataset in the delivery. `MP026_craters_AM-072736.lyrx` does not reference any of the four — it renders and labels from `TYPE` alone.

| Attribute    | Storage       | Distinct values (199 features) | Condition                                                              |
| ------------ | ------------- | -----------------------------: | ---------------------------------------------------------------------- |
| `Degredatio` | `float:19.15` |                              4 | Ordinal 1-4, undocumented, field name truncated and misspelled         |
| `RimStage`   | `str:254`     |                             32 | Free text; 21 values occur once; typos and case/wording variants       |
| `EjectaStat` | `str:254`     |                              8 | Free text; 192 of 199 are `none`; the other 7 are one-off notes        |
| `InteriorSt` | `str:254`     |                             35 | Free text; 20 values occur once; the most common value contains a typo |

- **`Degredatio`** takes 1 (115 features), 2 (61), 3 (22), and 4 (1). It is the one attribute here that a planner could act on, and it is the most damaged. The name is both truncated to the DBF 10-character limit and misspelled ("Degredation"), so the delivery contains no record of what the field is actually called. The scale's direction is undocumented; it can be inferred by correlating it against the free-text fields (113 of the 115 stage-1 features are `rimless`, and the single stage-4 feature is `sharp`, so 1 is most degraded and 4 is freshest), but inferring a stage scale from prose is not an acceptable basis for styling a mission layer. **Need:** the field's real name, its definition, and the meaning of each of the four stages. Deliver it as an integer with a published coded domain, not as a 15-decimal float.
- **`RimStage`**, **`EjectaStat`**, and **`InteriorSt`** are field notes, not attributes. Same observation, many spellings: `modified` and `Modified`; `slightly elevated`, `slightly elevated rim`, and `slightly raised rim`; `relatively unmodified`, `unmodified rim`, and `pristine, unmodified`. Order variants split the same pair of observations across `cratered, infilled`, `infilled, cratered`, and `cratered, infilling`. Typos are carried in the data, including the single most common `InteriorSt` value: `infilled anc cratered` on 48 features, which 9 further features spell correctly as `infilled and cratered`. Others are `slihgtly elevtated rim`, `realtively unmodified rim`, `hevaily weathered?`, and `minimal degredation`. Some values are sentences about one feature (`slightly elevated but inpacted by smaller crater`, `maybe some to the north?`). None of this can be styled, filtered, faceted, or legended, and AEGIS would show a value like `infilled anc cratered` to a planner verbatim. **Need:** each of the three as a coded value from a documented, closed vocabulary, with the per-feature prose moved to `COMMENT`.
- **`COMMENT`** is the single-space string `" "` on 169 of 199 features. That is the same problem as the literal `"<null>"` in item 3: neither empty nor meaningful, and every consumer has to trim before testing it. Leave it null when there is no comment. The 30 real comments are genuinely useful, but several read as open review actions rather than delivered results — `unsure if is crater, needs verification`, `could be stage 2, needs confirmation`, `tentative suggestion for 4` — which suggests this dataset was exported mid-review. **Need:** confirmation that it is final, or a redelivery once the flagged features are resolved.
- **`FID`**, **`OBJECTID`**, and **`SHAPE_Leng`** are export artifacts. As with boulders, there is no stable per-feature id that survives redelivery. **Need:** a stable `id`, as the nomenclature dataset already supplies.
- **Need:** an expansion of `AM-072736` in the dataset name, or a rename. Same ask as `bwd` in item 9.

### 11. Craters and boulders need one compounded, human-readable label defined by the GIS team

Items 8 and 10 are the same gap in two datasets: neither carries a label, and in both the only text-bearing field is a class name that is identical (boulders) or near-identical (craters, two values across 199 features) on every feature. The fix is not to pick a different existing field — none of them is a label, and the free-text fields in item 10 are too long, too inconsistent, and too often misspelled to put on a map.

**Need: the GIS team defines a standard label vocabulary and delivers a pre-composed label string per feature**, in the single agreed `label` property from item 2. Compose it from a fixed, documented set of terms, in a fixed order, spelled the same way every time:

```text
<feature class> <stable id> - <primary discriminator> (<qualifier>)
```

| Dataset  | Source values                                | Delivered `label`                         |
| -------- | -------------------------------------------- | ----------------------------------------- |
| Craters  | `TYPE=crest of crater rim`, degradation 4    | `Crater rim C-014 - fresh (stage 4)`      |
| Craters  | `TYPE=crest of buried crater`, degradation 1 | `Buried crater C-102 - rimless (stage 1)` |
| Boulders | `SIZE=3`, `CONFIDENCE=3`                     | `Boulder B-017 - 3 m (confirmed)`         |

The exact wording is the GIS team's to set; what matters is the discipline behind it:

1. **Closed vocabulary.** Every term comes from a list published with the delivery — one term per coded value, the same term every time, no free text. This is what makes labels comparable across features and across drops.
2. **Composed by the GIS team, delivered as data.** Do not ask AEGIS to build the string. Composing it in the app would put lunar-geology vocabulary and stage semantics into application code, where the GIS team cannot correct them and where every future delivery needs a code change.
3. **Unique and self-explanatory.** The label must identify one feature and be readable without the legend. A stable per-feature id inside it achieves both and gives planners something they can say out loud on a comm loop.
4. **Coded fields stay.** Keep `Degredatio`/`SIZE`/`CONFIDENCE`/`TYPE` alongside the label. AEGIS styles and filters from the codes and displays the label; the two are not substitutes.
5. **Keep it short.** Target roughly 40 characters. It is drawn at the feature on a map, over the linework it describes. `crest of buried crater` repeated 108 times is both too long and not a label.

Craters ship with labels off for MS3 and boulders are omitted entirely; both turn on once this arrives.

### 12. `LinearFeatures` labels the map with internal codes, and colour-codes nothing

`LinearFeatures` has 290 features and three attributes: `OBJECTID`, `TYPE`, and `COMMENT`, which is null on all 290 (drop it or populate it — same ask as item 3). `TYPE` is the only text in the dataset, and its values are `EHT_lineament_type1` (215 features), `EHT_lineament_type2` (70), and `scarp base` (5).

Three separate problems:

1. **The values are not human-readable.** `EHT` is not expanded anywhere in the delivery, and `type1` versus `type2` says nothing about what distinguishes them. A planner who reads `EHT_lineament_type2` on the map learns nothing from it, and neither does anyone outside the authoring team. **Need:** the expansion of `EHT`, a definition of each lineament type, and delivered values written as words — `Lineament, <what type 1 actually is>` — with the underscores and the internal type numbers dropped.
2. **These should not be per-feature map labels at all.** AEGIS defaults vector-sublayer labels on and falls back to `TYPE`, so this layer draws 290 labels holding three distinct strings, 285 of which are one of the two `EHT_...` codes, across a 1.4 km by 1.5 km area. That is unreadable, and it hides the linework it is supposed to describe. A class shared by 215 features belongs in a legend once, not next to each line.
3. **The delivered symbology cannot tell the two lineament types apart either.** In `LinearFeatures.lyrx`, `EHT_lineament_type1` and `EHT_lineament_type2` render identically: the same grey `rgb(78, 78, 78)`, the same 0.85 pt width, the same `[5, 2]` dash. 285 of the 290 features are therefore indistinguishable on the map by anything except the label text — and that text is the meaningless code. So the layer has a class split that costs 290 labels of clutter and delivers no visual information at all.

**Need: colour-code the classes instead of labelling the features.** Give each lineament type its own colour, keep the dash for line character if it is cartographically meaningful, and let the class read off a legend swatch. If the two types do not differ in a way worth colouring differently, merge them into one class and say so.

This is a general rule, not a linear-features exception: a class name is legend content and a label is per-feature content, and only nomenclature currently delivers the latter. It applies the same way to contacts (item 4), geomorphic units, surface features (item 5), and craters. AEGIS-side, `LinearFeatures`, `craters` (two strings over 199 lines), `contacts`, and `surface features` all register with `showLabels: false`, style their classes by colour, and name those classes in a legend. Per-feature labels turn on for a sublayer when the dataset carries a real per-feature label — `nomenclature` today, `craters` and `boulders` once item 11 is delivered. Item 13 is the general ask behind this one.

### 13. Class-based datasets need a standard class property, a documented vocabulary, and a delivered legend

Six of the ten delivered datasets are class-based: every feature belongs to one of a small set of categories, and the category — not any per-feature text — is what a planner reads off the map. Item 2 asks for one standard `label` property for datasets that identify individual features; **this is the same ask for the property that identifies a feature's class.** Three things are needed together, because any one of them alone still leaves the layer unreadable.

**1. One standard class property name, spelled identically in every dataset.** Today it is `Unit` on geomorphic units, `TYPE` on contacts, linear features, surface features, location features, craters, and boulders, and a dead `Type` also sits on the units dataset (item 3), which means one file carries two differently-cased spellings of the same idea and only one of them is populated. AEGIS resolves this with the same hardcoded fallback chain that item 2 describes, with the same fragility. Settle on one name — `TYPE` is the majority spelling and is fine if kept consistent — and use it everywhere, including on the units dataset in place of `Unit`.

**2. A closed, documented vocabulary of class values.** Values should be human-readable words, not internal codes: `EHT_lineament_type1` (item 12) and the unit keys `c`, `ci`, `ce`, `cs`, `SMej`, `Dej`, `Hs`, `Hh` are meaningless outside the authoring team, and nothing in the delivery expands them. Publish the value list per dataset with a one-line definition of each class, and keep the values stable across deliveries so a layer can be compared drop to drop. Keep short codes as a separate field if the geology workflow needs them.

**3. A legend, in the format AEGIS already uses.** This is not a new standard. Every AEGIS raster thematic layer ships one in its `properties.json`, and the GIS team already feeds it: they deliver symbology as a `.lyrx`, the pipeline converts it to a GDAL ramp (`products/lyrx_to_ramp.py`) and emits the legend from that ramp (`properties/write_properties.py`). The shape is a version, a units abbreviation, and an ordered list of `{ color, description }` rows — for example `missionFiles/50/Layers/slope/properties.json`:

```json
"legend": {
  "version": "2",
  "unitsAbbr": "deg",
  "legend": [
    { "color": "rgb(49, 54, 149)", "description": "[0.0, 1.99)" },
    { "color": "rgb(69, 117, 180)", "description": "[2.0, 3.99)" }
  ]
}
```

A class-based vector layer uses the identical structure, with `unitsAbbr` empty and `description` holding the class display name instead of a numeric range. Geomorphic units already supply the colours; the display names are what is missing:

```json
"legend": {
  "version": "2",
  "unitsAbbr": "",
  "legend": [
    { "color": "rgb(255, 255, 115)", "description": "<display name for unit c>" },
    { "color": "rgb(56, 168, 0)", "description": "<display name for unit ci>" }
  ]
}
```

So the ask is narrow: **deliver each class with an explicit colour in the `.lyrx`, plus its display name and a one-line definition.** That is everything needed to emit the legend the GIS team already knows from the raster layers. `GeoContacts_BuildPolygons8` is one `Unit` display-name column short of meeting it today. The rest are not, because class styling is left implicit in the CIM renderer for AEGIS to reverse-engineer, and the results are uneven:

| Dataset           | Class property | Classes | Delivered class styling                                                             |
| ----------------- | -------------- | ------: | ----------------------------------------------------------------------------------- |
| Geomorphic Units  | `Unit`         |       8 | Eight explicit, distinct fill colours — the one dataset that does this properly     |
| Contacts          | `TYPE`         |       3 | All black; distinguished only by dash pattern                                       |
| Linear Features   | `TYPE`         |       3 | Two of three classes are byte-identical in colour, width, and dash (item 12)        |
| Surface Features  | `TYPE`         |       1 | An embedded 1-bit BMP hatch (`CIMPictureFill`) with no colour                       |
| Craters           | `TYPE`         |       2 | Both black; distinguished by dash and an end marker                                 |
| Location Features | `TYPE`         |       4 | Four point markers, all black (dataset is empty — item on `LocationFeatures` above) |

Two consequences:

- **Colour must be the primary discriminator, not dash or fill pattern.** The legend row is a colour swatch and a description — there is no dash, hatch, or marker field, and adding one is not worth it for a handful of classes. A class distinguished only by a dash pattern therefore cannot be represented in the legend at all, and a `CIMPictureFill` hatch has no OpenLayers equivalent to reproduce. Dashes and markers are welcome as secondary cues — they are good geologic cartography — but each class needs its own colour so it can be legended and so it survives the CIM-to-OpenLayers translation.
- **Colours must be assigned explicitly and stay stable.** Every `.lyrx` in this delivery carries a `CIMRandomHSVColorRamp`, ArcGIS's auto-assign ramp. The units dataset overrides it with real per-class colours; the rest effectively do not. A random ramp means a class added or reordered in a future export gets an arbitrary colour that will not match the previous drop, so a planner who learned the map has to relearn it.

If a `.lyrx` cannot carry the display names and definitions, a plain table shipped alongside works equally well — one row per class with dataset, class value, display name, definition, and colour. Either way the point is that the class-to-colour-to-name mapping arrives as data rather than being inferred from CIM symbology. This also answers item 4 (contacts state only mapping confidence) and item 5 (surface features are unlabelled areas): with a legend, a class-only layer is legible without any per-feature text.

Pipeline side, `properties/write_properties.py` builds legends only from numeric GDAL ramps and hardcodes `type: "tile"` with a `tilePattern`. Emitting a class legend for a `type: "vector"` sublayer needs a categorical path through the same writer; the `properties.json` legend format itself does not change.
