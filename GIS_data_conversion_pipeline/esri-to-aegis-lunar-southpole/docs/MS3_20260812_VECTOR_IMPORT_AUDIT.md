# MS3 2026-08-12 Vector Delivery Audit and Import Plan

## Scope

This audit covers:

- Delivery: `F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260812`
- Source-data matrix: `F:\tempF\MS3_data_drop\AGDT_Mission_Source_Data.xlsx`
- Audit date: 2026-08-14

The delivery is vector-only. It contains ten logical datasets exported as shapefiles and
GeoJSON, ten ArcGIS `.lyrx` style files, an export log, and an FGDC summary. The export log
counts each shapefile and GeoJSON copy separately, which is why it reports 20 vector exports
for ten datasets.

## Executive decision

1. Keep the shapefiles as the authoritative source and CRS reference. Normalize them into AEGIS
   GeoJSON after the lunar reprojection fix. Do not directly import the projected delivered GeoJSON
   files until the CRS-aware compatibility path is implemented and validated.
2. Keep the geomorphic map as one logical product with separate sublayers for units, contacts,
   linear features, and surface features. Their geometry and symbology are meaningfully
   different and should remain independently styleable.
3. Treat craters and boulders as one logical product, matching the workbook, but retain two
   sublayers. Craters are lines and boulders are points, so combining them into one physical
   GeoJSON would make styling and visibility controls worse.
4. Import nomenclature as its own label-oriented sublayer. The 89 supplied points have unique
   stable IDs and unique labels. Promote the existing `testMapPerformant` draggable place-label
   proof of concept into the active OpenLayers map.
5. Use normalized GeoJSON for this delivery. Every dataset is small (0-290 features, with source
   GeoJSON files under 500 KB), so PMTiles would add complexity without a useful size or rendering
   benefit.
6. Fix lunar reprojection before producing any normalized geographic output. The current converter
   reports success but silently writes projected meter coordinates into files labeled `EPSG:4326`.

## Workbook comparison

| Workbook product                   | Include in AEGIS | Delivered source                                                                                                     | Audit result                                                                           | Proposed AEGIS product                 |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| Craters                            | Y                | `MP026_craters_AM-072736`                                                                                            | 199 line features; valid                                                               | Crater and Boulder Features / Craters  |
| Boulders                           | Y                | `MS3_boulders_reviewed_bwd`                                                                                          | 48 point features; valid                                                               | Crater and Boulder Features / Boulders |
| Lunar Surface Feature Nomenclature | Y                | `MS3_A03MP026_Nomenclature_v2`                                                                                       | 89 point features; valid; unique `id` and `label` values                               | Nomenclature                           |
| Geomorphic Map                     | Y                | `GeoContacts_BuildPolygons8`, `GeoContacts`, `LinearFeatures`, `LocationFeatures`, `SurfaceFeatures`, `map_boundary` | Complete style set, but `LocationFeatures` has zero features                           | Geomorphic Map with separate sublayers |
| PSR Locations                      | Y                | `RasterT_Int_psr2`, `RasterT_Int_psr2_1`, broken `PSR_overlays.geojson`                                              | Shapefile copies are byte-identical; one invalid polygon in each; GeoJSON is truncated | Permanently Shadowed Regions           |

The workbook says craters and boulders "will be combined." This should mean one logical UI
product, not one mixed-geometry file. The workbook also says the geomorphic map includes
contacts, units, nomenclature, and related features. The delivered standalone nomenclature is a
mission naming layer and should not be merged into the scientific geomorphic feature classes.

This delivery does not contain all workbook rows marked Y, such as the DEM, orthomosaic,
derived slope/hillshade, contours, viewsheds, or time-aware products. Those are separate source
deliveries or pipeline-derived products and are outside this vector-drop audit.

## Delivered dataset inventory

| Dataset                        |   Geometry | Count | Source CRS                                 | GeoJSON condition                                             | Interpretation                                                       |
| ------------------------------ | ---------: | ----: | ------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GeoContacts`                  | LineString |    43 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Geologic unit boundaries: 4 certain, 34 approximate, 5 inferred      |
| `GeoContacts_BuildPolygons8`   |    Polygon |    36 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Eight geomorphic units keyed by `Unit`                               |
| `LinearFeatures`               | LineString |   290 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | 215 type-1 lineaments, 70 type-2 lineaments, 5 scarp bases           |
| `LocationFeatures`             |      Point |     0 | Moon 2000 south-pole stereographic, meters | Empty FeatureCollection                                       | Empty template for pitted cones, small craters, and shield features  |
| `SurfaceFeatures`              |    Polygon |     4 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Four crimped-terrain polygons                                        |
| `map_boundary`                 |    Polygon |     1 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Source-map extent/helper, not a workbook product                     |
| `MP026_craters_AM-072736`      | LineString |   199 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | 91 crater rims and 108 buried-crater crests                          |
| `MS3_boulders_reviewed_bwd`    |      Point |    48 | Moon 2000 south-pole stereographic, meters | Valid JSON; `ESRI:103878` projected meters                    | Boulder locations with size and confidence attributes                |
| `MS3_A03MP026_Nomenclature_v2` |      Point |    89 | Moon 2000 geographic, degrees              | Valid JSON; `ESRI:104903` geographic degrees                  | Place names for craters, boulders, boulder fields, plains, and rises |
| `RasterT_Int_psr2`             |    Polygon |    98 | Lunar polar stereographic, meters          | No corresponding usable GeoJSON                               | PSR polygons; exact duplicate of `_1`; one invalid polygon           |
| `RasterT_Int_psr2_1`           |    Polygon |    98 | Lunar polar stereographic, meters          | No corresponding usable GeoJSON                               | Byte-identical duplicate of `RasterT_Int_psr2`                       |
| `PSR_overlays.geojson`         |        N/A |   N/A | N/A                                        | Truncated at 32 bytes after the FeatureCollection declaration | Unusable export                                                      |

All non-PSR shapefile geometries are non-empty and valid. PSR feature `Id=100` has a ring
self-intersection at approximately `(98099.5, 145810.5)` and must be repaired or redelivered.

## Delivery files not used as import inputs

The following delivered files are not needed to produce the current AEGIS vector products.
Keep the complete delivery archive for provenance, but do not copy these files into the import
workspace or register them as layers.

### GeoJSON export copies

The shapefiles are the authoritative import sources because they carry the source CRS in their
`.prj` files. These GeoJSON files are export copies rather than import inputs:

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

The first, second, third, fifth, sixth, eighth, and tenth files contain projected
`ESRI:103878` meter coordinates and are not direct inputs to AEGIS's historic GeoJSON loader.
`MS3_A03MP026_Nomenclature_v2.geojson` is geographically encoded, but normalizing its paired
shapefile keeps every imported layer on one CRS-audited path. `LocationFeatures.geojson` is empty,
and `PSR_overlays.geojson` is truncated.

### Duplicate and redundant shapefile artifacts

- The complete `RasterT_Int_psr2_1` shapefile bundle is not needed: `RasterT_Int_psr2_1.cpg`,
  `.dbf`, `.prj`, `.sbn`, `.sbx`, `.shp`, `.shp.xml`, and `.shx`. It is byte-for-byte identical
  to `RasterT_Int_psr2`; import only the latter after repairing or redelivering feature `Id=100`.
- Every `.sbn` and `.sbx` file in `00_GIS_Files/00_Vector/00_Shapefiles/` is an optional ArcGIS
  spatial index. The normalizer does not use these files.
- Every `.shp.xml` file in that directory is ArcGIS metadata and is not read by the normalizer.

The corresponding `.shp`, `.dbf`, `.shx`, `.prj`, and `.cpg` files remain part of each
authoritative source bundle: geometry, attributes, index, CRS, and text encoding respectively.

### Not currently importable products

- The `LocationFeatures` shapefile bundle and `.lyrx` are not current layer inputs because the
  dataset has zero features. Retain them until the GIS team confirms no populated replacement is
  expected.
- `map_boundary` is a one-feature authoring/reference extent, not a workbook product. Do not
  import it unless the GIS team confirms that it should be visible in AEGIS.

The ten `.lyrx` files are not vector data inputs, but retain them for the reviewed OpenLayers style
mapping. Retain `export_log_20260812_132444.txt` and `fgdc_report_summary.pdf` as delivery
provenance and audit evidence.

## What the ambiguous geomorphic names mean

- `GeoContacts_BuildPolygons8`: the areal geomorphic/geologic units. Its ArcGIS renderer is
  keyed by `Unit` and defines `c`, `ci`, `ce`, `cs`, `SMej`, `Dej`, `Hs`, and `Hh`.
- `GeoContacts`: boundaries between those units. `TYPE` controls certain, approximate, and
  inferred line styles.
- `LinearFeatures`: mapped linear landforms independent of unit contacts. The delivered classes
  are two EHT lineament types and scarp bases.
- `SurfaceFeatures`: mapped areal surface textures. This delivery contains only crimped terrain.
- `LocationFeatures`: intended point landforms (pitted cone, small crater, certain shield,
  uncertain shield), but the delivered feature class is empty.
- `MS3_A03MP026_Nomenclature_v2`: cartographic place-name anchors. This is not a scientific
  geometry layer and should use label-specific rendering and interaction.

## Projection findings

### Delivered files

The projected shapefiles and their GeoJSON copies have identical meter-valued extents. For
example, the first contact vertex is approximately `(96019.8934, 146938.3064)`. AEGIS currently
loads every GeoJSON vector with:

```ts
new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: projCode });
```

Therefore, the projected GeoJSON copies are not valid inputs for the current AEGIS loader even
though they include an `ESRI:103878` CRS member. OpenLayers is explicitly told to ignore that
member. They are valid direct inputs for the planned CRS-aware rendering compatibility below.

The nomenclature GeoJSON is the only delivered vector already in geographic degrees. Its bounds
are `(33.197230, -84.254700)` to `(34.794565, -84.175154)`.

### Legacy GeoJSON rendering compatibility

Legacy mission GeoJSON must remain usable without an import-time setting, a data migration, or
per-layer metadata stored by AEGIS. The active-map renderer will determine a source coordinate
space for each GeoJSON at load time:

1. Use a valid legacy GeoJSON `crs` member when it is present.
2. Otherwise, treat coordinates as geographic when every coordinate is within longitude/latitude
   bounds (`-180 <= x <= 180`, `-90 <= y <= 90`).
3. Treat all other coordinates as the established Moon 2000 south-pole stereographic meter
   space, then render them directly in the compatible mission projection.

Geographic source geometry is transformed into the active mission map projection. Projected meter
geometry is not treated as `EPSG:4326` and must not be transformed as if it were longitude and
latitude. This is intentionally a two-space compatibility rule, not an attempt to infer an
arbitrary projected CRS.

An audit of all 81 legacy `.geojson` files in `F:\_repos\aegis_static\missionFiles` supports this
rule: 79 files have degree-bounded coordinates and two have clearly projected meter extents. The
two meter files are `AGDT_A03N1034_Boulders.geojson` and
`Craters/AGDT_A03N1034_Craters_500m.geojson`, both under mission 16 and both tagged
`ESRI:103878`. The audit also found 33 files tagged `ESRI:104903`, 28 tagged `OGC:CRS84`, and six
tagged `EPSG:4326`; the remaining files rely on the bounds fallback. A very small projected
feature at the stereographic origin remains theoretically ambiguous, but does not occur in the
legacy corpus.

### Pipeline converter defect

`vector/shp_to_geojson.py` currently transforms lunar projected input to Earth `EPSG:4326`.
PROJ correctly reports that the source and target ellipsoids belong to different celestial
bodies. Fiona then returns the input geometry unchanged, while the converter labels the output
as `EPSG:4326` and reports success.

Observed test result for a real contact vertex:

| Operation                                              | Coordinate                                  |
| ------------------------------------------------------ | ------------------------------------------- |
| Source                                                 | `(96019.8934000, 146938.3064000)` meters    |
| Current Fiona transform to `EPSG:4326`                 | `(96019.8934000, 146938.3064000)` unchanged |
| Fiona transform to the source CRS's lunar geodetic CRS | `(33.1634438, -84.2163168)` degrees         |
| PyProj transform to the same lunar geodetic CRS        | `(33.1634438, -84.2163168)` degrees         |

The importer must derive the geographic target from `CRS.from_wkt(src_crs).geodetic_crs` for
body-specific projected inputs. AEGIS may continue to treat the resulting longitude/latitude
degree coordinates as its `EPSG:4326` data projection at load time, but the conversion itself
must stay Moon-to-Moon.

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

The prior choice to use shapefiles directly was correct. The delivered shapefiles contain the
source CRS in the `.prj` and are the safest input for a Moon-to-Moon normalization. AEGIS imports
vector data as `Data/*.geojson`. Therefore the required path is:

```text
Shapefile -> CRS-aware lunar normalization -> AEGIS GeoJSON vector sublayer
```

The valid delivered GeoJSON copies are not automatically equivalent input files. The seven
projected datasets use `ESRI:103878` meter coordinates, while the current normalizer copies
GeoJSON unchanged and the existing loader historically forces `EPSG:4326`. Directly using those
files would either require the Phase 3 source-projection resolver or risk interpreting meters as
longitude/latitude. The nomenclature GeoJSON is geographic (`ESRI:104903`) and could render through
that resolver, but normalizing it from the paired shapefile is still preferred for one audited,
repeatable import path.

PMTiles are appropriate when a layer needs tiled, viewport-scoped decoding: for example, large
feature counts or multi-megabyte payloads, frequent low-zoom display of dense geometry, or a
delivered ArcGIS vector-tile cache that already defines a compatible cap-grid tile scheme. None of
these conditions apply to the MS3 vectors. Creating PMTiles from these GeoJSON/shapefile inputs
would also require a new cap-grid MVT tiler and style/attribute verification; the pipeline's
current PMTiles path only repacks delivered ArcGIS vector-tile caches.

### Per-layer decision matrix

| AEGIS sublayer                         | Import source                      | Direct delivered GeoJSON?                                   | Imported format           | Decision basis                                                                       |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Geomorphic Map - Units                 | `GeoContacts_BuildPolygons8.shp`   | No: projected `ESRI:103878` meters                          | GeoJSON                   | 36 polygons; independent unit styling needs retained attributes, not tiling          |
| Geomorphic Map - Surface Features      | `SurfaceFeatures.shp`              | No: projected `ESRI:103878` meters                          | GeoJSON                   | Four polygons; PMTiles has no performance benefit                                    |
| Geomorphic Map - Contacts              | `GeoContacts.shp`                  | No: projected `ESRI:103878` meters                          | GeoJSON                   | 43 lines; `TYPE` drives feature-level dash styling                                   |
| Geomorphic Map - Linear Features       | `LinearFeatures.shp`               | No: projected `ESRI:103878` meters                          | GeoJSON                   | 290 lines, the largest source but still under 500 KB and small for OL vectors        |
| Geomorphic Map - Location Features     | `LocationFeatures.shp`             | No: empty source                                            | Omit                      | Zero features; do not register a blank GeoJSON or PMTiles layer                      |
| Geomorphic Map - Boundary              | `map_boundary.shp`                 | No: projected `ESRI:103878` meters                          | GeoJSON only if confirmed | One reference polygon; no tiling justification                                       |
| Crater and Boulder Features - Craters  | `MP026_craters_AM-072736.shp`      | No: projected `ESRI:103878` meters                          | GeoJSON                   | 199 lines; retain `TYPE` for line styling                                            |
| Crater and Boulder Features - Boulders | `MS3_boulders_reviewed_bwd.shp`    | No: projected `ESRI:103878` meters                          | GeoJSON                   | 48 points; retain `SIZE` and `CONFIDENCE` for symbols/filtering                      |
| Nomenclature                           | `MS3_A03MP026_Nomenclature_v2.shp` | Conditionally: geographic `ESRI:104903` after resolver test | GeoJSON                   | 89 label anchors with stable `id`/`label`; feature access and dragging favor GeoJSON |
| Permanently Shadowed Regions           | `RasterT_Int_psr2.shp`             | No: supplied GeoJSON is truncated                           | GeoJSON after repair      | 98 polygons; repair/validate first, then small enough for a normal vector layer      |

`RasterT_Int_psr2_1.shp` is an exact duplicate and must not be imported. For each accepted
shapefile, retain the original source archive beside the conversion report and record its checksum,
CRS, feature count, and output bounds.

### Reassessment trigger

Re-evaluate a single sublayer for PMTiles only after measurement shows that its normalized GeoJSON
causes material initial-load, memory, interaction, or rendering degradation at the mission's
expected zooms. Record the measured feature count, byte size, viewport render time, and target
cap-grid metadata before converting. A format change must preserve the attributes needed for
styling, labels, filtering, and feature inspection; PMTiles is not a substitute for fixing CRS
handling.

## Recommended AEGIS layer layout

### Geomorphic Map

Use one logical layer/group with these independently toggleable sublayers, in draw order:

1. `Geomorphic Map - Units` from `GeoContacts_BuildPolygons8`
2. `Geomorphic Map - Surface Features` from `SurfaceFeatures`
3. `Geomorphic Map - Contacts` from `GeoContacts`
4. `Geomorphic Map - Linear Features` from `LinearFeatures`
5. `Geomorphic Map - Location Features` only after a non-empty source is delivered
6. `Geomorphic Map - Boundary` only if the GIS team confirms it is operationally useful

Do not flatten these into one GeoJSON. Separate files preserve geometry-specific styling,
legends, ordering, and visibility. The importer should preserve source attributes and add
normalized AEGIS style properties derived from the `.lyrx` unique-value renderer. The active
map currently has only one preset style per sublayer, so reproducing category-specific fills,
dashes, and point symbols requires either per-feature style properties or one output sublayer per
renderer class. Per-feature style properties are preferred to avoid producing many tiny layers.

### Crater and Boulder Features

Use one logical product with two sublayers:

- `Craters`: linework, styled by `TYPE` (`crest of crater rim` versus `crest of buried crater`).
- `Boulders`: point symbols, with `SIZE` and `CONFIDENCE` retained for future filtering/tooltips.

The boulder source does not contain place names. Its 48 points are locations, not labels. Named
boulders, boulder fields, and craters are supplied by the separate nomenclature dataset.

### Nomenclature

Use the 89 nomenclature points as a dedicated place-label layer:

- Label property: `label`
- Stable feature key: `id` (all 89 are present and unique)
- Default geometry: hidden point anchor
- Visual: boxed text label, decluttering, dashed tether and anchor when moved
- Interaction: draggable in editor mode; read-only in dashboard and minimap initially
- Persistence for the first implementation: per-client, in-memory placement, reset on reload

The existing `src/pages/testMapPerformant.tsx` and
`src/components/interface/map/testMapPerformant/placeLabels.ts` are suitable proofs of concept,
but they currently look for `Feat Name`/`name`, do not persist positions, and are not wired into
the production map. Production code should accept `label`, preserve the original anchor, cache
styles, and isolate `Translate` to nomenclature layers.

If moved-label persistence is required, store offsets by `(sublayerUuid, feature id)` in preset
state rather than rewriting the shared source GeoJSON. Confirm that requirement before adding a
database/API contract.

### Permanently Shadowed Regions

Use only `RasterT_Int_psr2.shp`; `_1` is byte-for-byte identical. Run `make_valid` during import
and assert that the repaired output still contains 98 logical features. Do not use the truncated
`PSR_overlays.geojson`.

## Implementation plan

### Implementation status (2026-08-14)

Executed in the current change set:

- Phase 1 is implemented as a generic, single-source vector normalization path. One
  `--in-vector` value is accepted per pipeline run; shapefile and GeoJSON inputs both pass through
  Fiona and the Moon-to-Moon CRS transform. Each run can set an independent output name, repair
  policy, expected feature count, and machine-readable audit output.
- Phase 3, item 7 is implemented. The active OpenLayers loader resolves recognized embedded CRS
  names, falls back to whole-document coordinate bounds when no CRS is present, and rejects
  malformed documents and unsupported embedded CRS names.
- Focused verification converted the real `GeoContacts.shp` and projected
  `GeoContacts.geojson` independently. Both produced 43 features with bounds
  `(33.1634438, -84.2574698)` to `(33.8419943, -84.1891943)`. The projection resolver has focused
  unit coverage for recognized CRS forms, bounds fallback, malformed inputs, and non-finite
  coordinates.

Revised or deferred:

- The proposed delivery-specific manifest/batch importer was removed. A single command must not
  select or import multiple files from a delivery. Import each accepted dataset by running the
  generic pipeline again with that source's parameters.
- Phase 2 product grouping, source selection, style review, and omission decisions remain this
  document's operator checklist; they are not hardcoded into the pipeline.
- Phase 3 items 1-6 and all Phase 4 work remain unexecuted. In particular, nomenclature behavior,
  boulder symbols, unique-value style overrides, schema changes, registration, presets, and visual
  comparison are not part of the current implementation.

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

1. Replace the shapefile-only assumptions in `vector/shp_to_geojson.py` with a vector normalizer
   that accepts shapefile or GeoJSON and reads the source CRS through Fiona.
2. For projected lunar data, transform to the source CRS's geodetic CRS rather than Earth
   `EPSG:4326`.
3. For already-geographic lunar data, preserve longitude/latitude coordinates without a
   Moon-to-Earth operation.
4. Reject projected GeoJSON lacking a usable CRS instead of copying it into `Data/`.
5. Treat any PROJ/GDAL transform error or unchanged out-of-range coordinate as a hard failure.
6. Add optional geometry repair for known polygon inputs and report every repaired feature.
7. Emit a machine-readable audit summary with source CRS, output bounds, feature count, geometry
   types, invalid/repaired counts, and property names.

### Phase 2: Import delivery products through independent generic runs

1. Run the generic pipeline once for each accepted source, using `--vector-name` to assign its
   stable output name. Do not add a delivery manifest or multi-file command.
2. Run the four non-empty geomorphic feature classes separately; do not run the empty
   `LocationFeatures` source.
3. Run craters and boulders separately, then register them as sibling sublayers in one logical
   product.
4. Run only `RasterT_Int_psr2` with `--repair-vector-invalid` and
   `--expect-vector-features 98`; do not run the duplicate or truncated alternatives.
5. Run nomenclature separately and verify its stable `id` and `label` properties in the audit and
   output.
6. Parse the supported CIM unique-value renderer subset from each `.lyrx`, or use an explicit
   reviewed style mapping when a CIM symbol cannot be represented in OpenLayers.
7. Include source filename, source style filename, category counts, and conversion decisions in
   `Data/conversion_report.md`.

### Phase 3: Extend active-map rendering

1. Add an explicit nomenclature/place-label sublayer discriminator rather than guessing from a
   filename or property.
2. Extract the sandbox place-label style into production map styles and support the delivered
   `label` field.
3. Add a nomenclature behavior that owns the editor-only `Translate` interaction and preserves
   each feature's original anchor for tether rendering.
4. Add point-symbol support and per-feature vector style overrides for boulders and unique-value
   geomorphic classes.
5. Keep imported data layers below operational AEGIS features while rendering nomenclature at
   the existing place-label z-index.
6. Update registration/schema/admin controls for the new discriminator and regenerate the
   importable sublayer schema.
7. Extend `layerFactory` with a GeoJSON source-projection resolver that supports the broad legacy
   corpus without an import setting, data migration, or per-layer stored metadata:
   - Normalize embedded CRS names from `ESRI:*`, `EPSG:*`, `OGC:CRS84`, and their OGC URN forms.
   - Treat known geographic lunar and geographic CRS names (`ESRI:104903`, `EPSG:4326`, and
     `OGC:CRS84`) as longitude/latitude source data and transform them into the active mission
     projection.
   - Treat the known Moon 2000 south-pole stereographic CRS (`ESRI:103878`) as native projected
     meter coordinates when compatible with the active mission projection.
   - For GeoJSON without a usable CRS, recursively inspect every coordinate in every supported
     GeoJSON geometry type and classify only wholly degree-bounded data as geographic; classify
     other coordinates as the established Moon 2000 south-pole stereographic meter space.
   - Reject malformed GeoJSON and embedded projected CRS names outside the supported compatibility
     set rather than silently interpreting them as longitude/latitude.

### Phase 4: Register and verify the product

1. Register the generated GeoJSON files idempotently with human-readable names and descriptions.
2. Create a mission preset with reviewed default ordering, visibility, opacity, labels, and
   legends.
3. Compare AEGIS screenshots against the delivered ArcGIS styles at matching extents.
4. Obtain GIS-team confirmation for the omitted empty `LocationFeatures`, optional
   `map_boundary`, repaired PSR polygon, and any approximated CIM symbols.

## Required tests and acceptance criteria

### Conversion tests

- A lunar polar source coordinate transforms to the known longitude/latitude result above.
- Every output coordinate satisfies `-180 <= longitude <= 180` and
  `-90 <= latitude <= 90`.
- A projected GeoJSON passed through `--in-vector` is reprojected or rejected, never blindly
  copied.
- Output-to-source round trips remain within an agreed metric tolerance (target: 0.01 m).
- Feature counts and required attributes match the inventory table.
- Empty inputs are reported and omitted rather than registered as blank layers.
- Invalid PSR feature `Id=100` is repaired deterministically and the output has 98 features.
- Duplicate PSR inputs are detected by content, not imported twice.
- Truncated/invalid JSON fails before registration.

### App tests

- Nomenclature loads from geographic GeoJSON at the expected mission location.
- Legacy GeoJSON with `ESRI:103878` meter coordinates renders at the expected mission location
  without being interpreted as `EPSG:4326`.
- All seven non-empty, projected MS3 GeoJSON files render from their `ESRI:103878` CRS, and
  `MS3_A03MP026_Nomenclature_v2.geojson` renders from its `ESRI:104903` geographic CRS.
- Geographic GeoJSON tagged as `EPSG:4326`, `OGC:CRS84`, or an equivalent OGC CRS URN resolves
  as longitude/latitude source data.
- The empty `LocationFeatures.geojson` is omitted and the truncated `PSR_overlays.geojson` is
  rejected before a map layer is created.
- Untagged legacy GeoJSON with degree-bounded coordinates is rendered as geographic, while an
  untagged meter-valued fixture is rendered as south-pole stereographic.
- The bounds classifier handles Point, MultiPoint, LineString, MultiLineString, Polygon,
  MultiPolygon, and GeometryCollection inputs, including empty geometries.
- A malformed GeoJSON document or an unsupported embedded projected CRS fails visibly instead of
  falling back to `EPSG:4326`.
- All 89 labels render from `label`; no point marker is visible beneath an unmoved label.
- Editor dragging moves only the selected label and draws a tether to the original anchor.
- Dashboard/minimap behavior matches the chosen read-only policy.
- Label decluttering does not suppress unrelated geomorphic or crater geometry.
- Boulder points render with a visible symbol.
- Unique-value contact/unit/linear classes receive distinct reviewed styles.
- Existing generic vectors, contours, PMTiles, and operational marker labels do not regress.

### Manual visual checks

- Overlay the converted contact, crater, boulder, PSR, and nomenclature layers on the mission
  basemap and confirm alignment at several recognizable features.
- Capture desktop and mobile screenshots with default visibility and with each logical product
  isolated.
- Compare category colors, dashes, marker symbols, labels, draw order, and legend wording with
  the delivered `.lyrx` files in ArcGIS.

## Feedback for the GIS team

Tracked while importing delivery 2 and wiring these layers into the active AEGIS map. This
section is the list to send back to the GIS team, including outstanding problems from delivery 1
and open questions for the GIS/product teams.

### Delivery 2 contents as received

```text
ALSST GIS team delivery 2
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

### Problems with delivery 1

1. `LocationFeatures` is empty despite the workbook including the geomorphic map product. It
   cannot provide the intended pitted-cone, small-crater, or shield-feature point layer.
2. `RasterT_Int_psr2.shp` and `RasterT_Int_psr2_1.shp` are byte-for-byte duplicates, creating
   ambiguity about which PSR source is authoritative.
3. PSR feature `Id=100` has a self-intersecting ring and requires repair or a corrected
   redelivery before it can be treated as authoritative geometry.
4. `PSR_overlays.geojson` is truncated after 32 bytes and cannot be parsed or imported.
5. The projected GeoJSON exports carry meter-valued coordinates. They are not directly compatible
   with AEGIS's existing GeoJSON loader, which assumes geographic coordinates.
6. Several workbook rows marked for inclusion are absent from this vector delivery: the DEM,
   orthomosaic, derived slope and hillshade, contours, viewsheds, and time-aware products.

### 1. The GeoJSON copies are not needed

Deliver shapefiles only. The shapefile carries its source CRS in the `.prj`, which is what the
AEGIS importer needs; the paired GeoJSON exports add no information and cost review time. Every
projected GeoJSON in this delivery also carries meter coordinates that must not be read as
longitude/latitude, and two of them are unusable outright (`LocationFeatures.geojson` is empty,
`PSR_overlays.geojson` is truncated).

### 2. Label-property naming is inconsistent across datasets

Each dataset puts its human-readable label in a differently named property:

| Dataset (AEGIS product name)                    | Property holding the label |
| ----------------------------------------------- | -------------------------- |
| Nomenclature (`MS3_A03MP026_Nomenclature_v2`)   | `label`                    |
| Geomorphic Units (`GeoContacts_BuildPolygons8`) | `Unit`                     |
| Geomorphic Linear Features (`LinearFeatures`)   | `TYPE` (all caps)          |
| Geomorphic Surface Features (`SurfaceFeatures`) | `TYPE` (all caps)          |

Because of this, AEGIS now falls back through a fixed chain of property names to find a label. That chain is
fragile and specific to this drop's spelling choices and will break the moment a future delivery
uses `Label`, `Name`, or `Class`, for example. **Need: settle on one label property name, spelled
identically in every dataset, for all future deliveries.** `label` (lowercase) is the preferred
name because the nomenclature dataset already uses it. Keep the domain-specific attributes
(`Unit`, `TYPE`, `SIZE`, `CONFIDENCE`) as well — they are useful for styling and filtering — but
add the one agreed label property alongside them.

### 3. `Geomorphic_Units` has a dead `Type` property

`GeoContacts_BuildPolygons8` carries a valid `Unit` value per feature, but also a `Type` property
whose values are all `null` or the literal string `"<null>"`. The literal `"<null>"` string is
worse than an absent property, because consuming code has to special-case it. Either populate
`Type` with meaningful values or drop the field from the export.

### 4. `MS3_Geomorphic_Contacts` is not usable as delivered

`GeoContacts` contains only a `TYPE` attribute with values such as `inferred` and `approximate`,
and every feature carries `"color": "rgb(0, 0, 0)"`. The result in AEGIS is a set of unlabelled
lines with nothing to explain what boundary each line represents or which units it
separates.

### 5. `Geomorphic_SurfaceFeatures` is likely out of scope

Beyond using `TYPE` for its label, this dataset sits well outside the EVA operating area and consists only of unlabeled areas. Unless there is a planning reason to carry it, it can be dropped from future data deliveries.

### 6. Repeat items still outstanding from delivery 1

These were raised in "Problems with delivery 1" above and are unchanged in delivery 2:

- `LocationFeatures` is still empty.
- `RasterT_Int_psr2` and `RasterT_Int_psr2_1` are still byte-for-byte duplicates.
- PSR feature `Id=100` still has a self-intersecting ring.
- `PSR_overlays.geojson` is still truncated.

### Open questions for the GIS/product teams

1. Is empty `LocationFeatures` intentional, or should a populated feature class be redelivered?
2. Should `map_boundary` be visible in AEGIS or remain an authoring/reference extent only?
3. May AEGIS repair PSR feature `Id=100`, or should GIS provide a corrected authoritative file?
4. Does "craters combined with boulders" require a single UI group only, as recommended here,
   or a single export file?
5. Should dragged nomenclature positions persist across reloads/users, or is session-local
   decluttering sufficient for MS3?
6. Which `.lyrx` symbols must be reproduced exactly, and which may use an OpenLayers
   approximation?
