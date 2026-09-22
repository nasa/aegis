# MS3 GIS Deliveries: Consolidated Feedback for the GIS Team

## Suggested introduction

The COMM MIA layers are now available in AEGIS production, along with the corrected Blue Origin viewshed.

There were variations in the delivery standards that required additional custom AEGIS code. NASAChat was used to assist with a detailed analysis of the deliveries, including the variations that led to the additional AEGIS integration work. The findings below were checked against the extracted source folders, conversion results, and AEGIS Git history.

## Purpose and scope

This document summarizes the MS3 GIS delivery sequence for A03MP026 and provides consolidated feedback for future deliveries. It distinguishes:

- source-data or packaging issues the GIS team can address;
- questions that require authoritative GIS clarification; and
- AEGIS-owned integration work that should not be treated as a GIS defect.

The feedback is not a request for the GIS team to continually add new AEGIS-specific products. Its purpose is to make the existing GIS-to-AEGIS handoff repeatable: identify the authoritative source for each requested layer, state its data contract, and keep that contract stable across redeliveries.

Detailed reports:

- [`MS3_20260615_INITIAL_DATA_DELIVERY_REVIEW.md`](MS3_20260615_INITIAL_DATA_DELIVERY_REVIEW.md)
- [`MS3_20260805_DELIVERY_REVIEW.md`](MS3_20260805_DELIVERY_REVIEW.md)
- [`MS3_20260812_GIS_TEAM_FEEDBACK.md`](MS3_20260812_GIS_TEAM_FEEDBACK.md)
- [`MS3_20260812_VECTOR_IMPORT_AUDIT.md`](MS3_20260812_VECTOR_IMPORT_AUDIT.md)
- [`MS3_20260922_GIS_TEAM_FEEDBACK.md`](MS3_20260922_GIS_TEAM_FEEDBACK.md)

## Baseline before the GIS conversion pipeline

Before this pipeline was added, AEGIS did not consume an ArcGIS project, geodatabase, shapefile, `.lyrx`, or arbitrary scientific GeoTIFF and turn it into a working mission layer. AEGIS consumed **already prepared web-map artifacts** placed in a mission's static file tree:

- raster display layers were pre-rendered 256-pixel PNG/JPEG tile pyramids under `missionFiles/<id>/Layers/`, with an AEGIS-compatible tile path, bounds, zoom range, and TMS/other tile-format setting;
- vector display layers were GeoJSON files under `missionFiles/<id>/Data/`;
- vector-tile layers used a prepared tile endpoint or tile template; and
- elevation and slope calculations used one separately configured mission DEM through `demFilePath` and its resolution.

The remaining setup was manual. An administrator downloaded or uploaded the prepared `Data` and `Layers` ZIPs, selected files in the admin interface, and entered or verified each sublayer's type, path, tile pattern, tile format, bounding box, native zoom range, display style, and mission DEM configuration. AEGIS rendered those products, but it did not provide the upstream GIS processing needed to create them.

The new pipeline automates that pre-existing handoff. It converts source GIS data into the same AEGIS-facing artifacts, validates them, writes their metadata, registers the mission and sublayers, and packages the output. Cap-grid tiling, COG/PMTiles creation, web-display colorization, API registration, and Box publishing remain AEGIS responsibilities.

### Moving toward a standard delivery

Taken together, the recommendations below define a consistent GIS-to-AEGIS delivery standard: one authoritative representation per product, a machine-readable manifest, stable metadata and naming conventions, and package-level preflight validation. This standard should reduce ambiguity, duplication, and product-specific handling while preserving the division of responsibilities between GIS source preparation and AEGIS integration. Following it should make future deliveries repeatable and allow most integration work to focus on configuration and validation.

## Delivery timeline

| Delivery round                                                      | Scope                                                                                 | Outcome                                                                                                               | Closely associated AEGIS work                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **2026-06-15/16** — `A03MP026` plus `A03MP026_SFS_1mpp_orthoimages` | 1 m SfS DEM, ancillary DEMs, slope, landing ellipse, and 126 NAC frames               | Established the mission terrain and imagery foundation                                                                | Initial import on 2026-06-17 (`a19048e2`); NAC/slope import on 2026-06-22 (`36548ebb`); registration and publishing on 2026-06-30 (`884a6771`) |
| **2026-08-05** — `AEGIS_MS3_MP026_GIS_Data_20260805`                | Horizons, contours, lander, two viewsheds, slope keep-out, styles, and metadata       | Added classified masks and additional vector products                                                                 | GIS pipeline and vector styling on 2026-08-05 (`6ee1d580`, `f6131175`); classified viewshed/keep-out conversion on 2026-08-06 (`98e7245c`)     |
| **2026-08-12** — `AEGIS_MS3_MP026_GIS_Data_20260812`                | Geomorphic map, craters, boulders, nomenclature, and PSRs                             | Added detailed planning vectors; exposed CRS, geometry, naming, and attribute-contract issues                         | CRS-safe vector normalization and nomenclature behavior on 2026-08-18 (`b22a6002`)                                                             |
| **2026-08-20** — viewshed-focused redelivery                        | Revised viewshed products                                                             | Intermediate correction; the Blue Origin source still used an undocumented `0/1/2` contract without a TIFF NoData tag | Informed the final viewshed-converter contract                                                                                                 |
| **2026-09-17** — `AEGIS_MS3_MP026_GIS_Data_20260917`                | 12 logical COMM MIA rasters plus redelivered viewshed, horizon, and nomenclature data | COMM MIA layers and corrected Blue Origin viewshed are now on AEGIS production                                        | Generic categorical raster imports on 2026-09-19 (`a1b11038`)                                                                                  |

Git author dates are used in this table because several early GIS commits were merged later; their author dates preserve when the work was performed.

## What improved across the deliveries

1. **The initial source data preserved full resolution.** The 1 m SfS DEM and NAC frames allowed AEGIS to generate mission-specific products rather than depend on pre-rendered screenshots or low-resolution exports.
2. **Packaging became more structured.** The August deliveries introduced dedicated GIS, style, log, and metadata folders.
3. **CRS-bearing shapefiles remained available.** These provided the authoritative source needed for safe lunar reprojection.
4. **Nomenclature adopted a useful `label` field and stable IDs.** The original 89 features remained stable through the September redelivery.
5. **COMM metadata became machine-readable.** The September JSON files provided class values, human-readable labels, colors, NoData behavior, and the bivariate formula.
6. **The COMM rasters shared one consistent grid.** This made spatial and pixel-level validation practical.
7. **The corrected Blue Origin viewshed and COMM MIA products could be converted and published.** The production layers demonstrate that the usable source content was recoverable despite the packaging and metadata inconsistencies described below.

## Consolidated feedback for future deliveries

### 1. Include one machine-readable final-package manifest

The manifest should describe what is actually in the delivered package, not the larger source geodatabase. Use one record per logical product with:

- stable product ID and display name;
- filename and authoritative format;
- product type and intended use;
- CRS, resolution, extent, units, data type, and NoData/background convention;
- style or class-definition filename;
- version and supersedes/superseded-by relationship; and
- component provenance for derived products.

This would have resolved the difference between the August 5 export log and its selected final package, the incomplete September `delivered_rasters` arrays, and uncertainty about which redelivery superseded which earlier file.

### 2. Deliver one authoritative representation per logical product

Repeated deliveries included both:

- shapefile and GeoJSON copies of the same vectors;
- source GeoTIFF and pixel-identical COG copies; and
- raster viewsheds plus polygonized copies.

For AEGIS, the preferred source contracts are:

- **vectors:** shapefile with `.prj`, unless a GeoJSON is explicitly geographic and fully validated;
- **continuous rasters:** GeoTIFF/COG with documented CRS, units, resolution, and NoData;
- **categorical rasters:** GeoTIFF/COG plus a machine-readable class definition; and
- **viewsheds:** the raster only, unless another identified consumer requires polygons.

### 3. Standardize CRS and raster metadata

The initial terrain delivery used several spatially compatible lunar south-pole CRS definitions under different names and authority codes, together with several NoData conventions. Later projected GeoJSON files also required special handling to avoid interpreting metre coordinates as longitude/latitude.

For every raster and vector, provide an explicit authoritative CRS and use one agreed lunar CRS representation where practical. For rasters, also state the pixel size, units, data type, NoData/background value, resampling rule, and whether the file is continuous or categorical.

### 4. Standardize categorical raster contracts

Every categorical raster should include:

- exact pixel value;
- human-readable class label;
- RGB/RGBA color;
- NoData and transparency behavior;
- nearest-neighbor rendering requirement;
- schema/tool version; and
- the complete list of products using that class definition.

Do not rely on `.lyrx` alone for this contract. The September COMM JSON files were a strong step in this direction, but their product inventories were incomplete and inconsistently grouped.

### 5. Use stable names, IDs, and property conventions

- Use a stable product name that describes the content rather than the authoring workflow.
- Use lowercase `label` for human-readable per-feature labels.
- Provide a stable, non-null `id` for every feature that must survive redelivery.
- Use one consistently spelled class-property name.
- Publish closed vocabularies and definitions for coded attributes.
- Keep free-form observations in a comment field rather than mixing spelling variants into fields intended for styling or filtering.

These conventions would address the August 12 label and class inconsistencies, undocumented crater/boulder fields, and the missing ID on September's new `Walnut crater` feature.

### 6. Make symbology complete and product-specific

Deliver the style or class definition with the product it describes, and ensure filenames map one-to-one. Avoid styles for omitted products or mismatched resolutions. Use explicit, stable colors rather than random renderer assignments. Class names belong in a legend; per-feature labels should identify individual features rather than repeat the class name across the map.

### 7. Run package preflight before delivery

Recommended automated checks:

- duplicate checksums and doubled extensions;
- missing manifest entries and manifest entries absent from disk;
- empty or truncated files;
- invalid vector geometry;
- null or duplicate required IDs and labels;
- consistency of CRS, dimensions, transform, extent, and NoData for products expected to share a grid;
- class values not represented in the supplied class definition; and
- formula verification for derived categorical products when component filenames are known.

## Current questions requiring GIS confirmation

The current production import does not remove the need to resolve these semantic questions:

1. **Bivariate COMM provenance.** Please identify the UHF and WiFi component source used for each bivariate raster. The Blue Origin Available raster matches Available UHF plus Conservative WiFi rather than the same-scenario pairing implied by its filename. The SpaceX Conservative raster does not exactly match any delivered component pairing.
2. **Meaning of `0600`.** Please confirm whether `0600` changes the COMM coverage calculation. If it is only a processing or legacy filename token, omit it from future filenames and metadata; otherwise document its non-temporal meaning.

Detailed pixel counts and filenames are in [`MS3_20260922_GIS_TEAM_FEEDBACK.md`](MS3_20260922_GIS_TEAM_FEEDBACK.md).

## AEGIS-owned integration work

The following work belongs to AEGIS and is listed for transparency, not as a request for GIS correction:

- lunar cap-grid tiling and application-specific tile metadata;
- radiometric stretching of source NAC frames for web display;
- generation of hillshade, slope, aspect, TRI, and contours;
- COG and PMTiles generation;
- mission registration, LGRS generation, and Box publishing;
- OpenLayers map integration; and
- production validation and layer registration.

Additional AEGIS code was required where delivery contracts varied or were incomplete:

- resolving multiple lunar CRS representations and projected GeoJSON;
- expanding palette-indexed COMM rasters to browser-renderable RGBA COGs;
- accepting the untagged `0/1/2` Blue Origin viewshed convention;
- extracting complete legends from class-definition JSON;
- detecting malformed duplicate COMM filenames; and
- repairing or rejecting invalid vector inputs.

## Requested standard for the next delivery

A future package that follows the manifest, authoritative-format, metadata, naming, and preflight recommendations above should require configuration and validation in AEGIS rather than new product-specific conversion code.
