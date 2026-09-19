# MS3 2026-09-17 GIS Delivery Review

## Scope

Reviewed delivery:

`F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260917`

Review date: 2026-09-19.

This review compares the drop with the 2026-08-05, 2026-08-12, and 2026-08-20 deliveries and with `MS3_20260812_GIS_TEAM_FEEDBACK.md`.

This document has two intentionally separate parts:

1. **Feedback to send to the GIS delivery team** — data or metadata that only the producing team can correct or clarify, followed by non-blocking packaging guidance for future drops.
2. **Internal AEGIS implementation plan** — decisions and pipeline work that belong to the AEGIS team and should not be sent as defects in the GIS delivery.

## Delivery decision summary

The drop contains three redelivered vector datasets and twelve new logical communications rasters.

The usable raster data is better than the packaging initially suggests. All twelve logical communications rasters:

- share one 5 m grid;
- use Byte class values and `255` NoData;
- carry embedded TIFF palettes whose colors match the supplied JSON;
- use an effective transparent NoData mask; and
- are tiled GeoTIFFs with COG layout metadata.

The following can be handled by AEGIS without a corrected delivery:

- Ignore the vectorized viewshed and use only the viewshed GeoTIFF.
- Ignore the twelve malformed duplicate communication filenames.
- Ignore the raster `.lyrx` files. The embedded TIFF palettes provide the pixel colors.
- Use the JSON class definitions only for human-readable legends and validation.
- Handle the viewshed's `0/1/2` source convention in the AEGIS converter.
- Ignore incomplete JSON file inventories and associate each explicitly selected input with the correct class definition during import.
- Assign `Walnut crater` the local AEGIS ID `90`, one greater than the highest feature-record ID `89` in the delivered file.

The following cannot be safely resolved by AEGIS because they require authoritative information from the producing team:

- the intended component scenarios or provenance of two bivariate communications rasters; and
- whether `0600` is a meaningless filename artifact that should be removed.

---

# Part 1 — Feedback to send to the GIS delivery team

## Viewshed delivery reconciliation

The delivery contains **one logical raster viewshed and one logical vectorized copy** of that viewshed:

| Logical product             | Files received                                                                                                                                                                                        | AEGIS decision                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Raster viewshed             | `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin.tif` plus its `.aux.xml` and raster attribute-table sidecars                                                                                                   | **Use this product.** It is the authoritative source for AEGIS.                                                     |
| Vectorized non-visible area | One shapefile dataset named `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY`, represented by the normal `.shp`, `.dbf`, `.shx`, `.prj`, `.cpg`, `.sbn`, `.sbx`, and `.shp.xml` companion files | **Ignore this entire dataset.** The multiple files are components of one shapefile, not multiple viewshed products. |
| ArcGIS styles               | One `.lyrx` for the raster and one `.lyrx` for the polygon                                                                                                                                            | **Ignore both.** AEGIS applies its established non-visible viewshed presentation during raster conversion.          |

The raster contains values `0`, `1`, and `2`, has no TIFF NoData tag, and defines no embedded palette. AEGIS can handle this without a replacement: `0` and visible class `1` will be transparent, and non-visible class `2` will use the established AEGIS viewshed color.

The vectorized copy contains 375 polygons and three ring self-intersections, at feature IDs 147, 265, and 449. Those defects do not block AEGIS because the vector dataset will not be imported.

**Future delivery requirement:** when the authoritative viewshed GeoTIFF is supplied, the vectorized viewshed and both viewshed `.lyrx` files should not be included in an AEGIS delivery unless a separate consumer has explicitly requested them. The raster's background/NoData convention should be stated in machine-readable metadata; preferably, the raster should contain only documented classes and carry a real NoData tag.

## Corrections or confirmation required before affected data is accepted

### 1. Confirm or correct the communications-layer bivariate scenario composition

This issue concerns the new UHF/WiFi communications layers. The supplied JSON defines the bivariate value as:

`(UHF_CLASS * 3) + WIFI_CLASS`

The bivariate rasters were checked pixel by pixel against all delivered same-site UHF and WiFi scenario combinations.

- `UHF_WiFi_BlueOrigin_Standing_0600_Conservative_Bivariate.tif` exactly equals Conservative UHF plus Conservative WiFi.
- `UHF_WiFi_SpaceX_Standing_0600_Available_Bivariate.tif` exactly equals Available UHF plus Available WiFi.
- `UHF_WiFi_BlueOrigin_Standing_0600_Available_Bivariate.tif` exactly equals **Available UHF plus Conservative WiFi**, not Available UHF plus Available WiFi. The latter comparison differs at 3,533 valid pixels.
- `UHF_WiFi_SpaceX_Standing_0600_Conservative_Bivariate.tif` does not exactly equal any delivered UHF/WiFi scenario pairing. Its closest pairing is Available UHF plus Conservative WiFi, but 19 valid pixels still differ. Conservative UHF plus Conservative WiFi differs at 1,157 valid pixels.

AEGIS can render these files as delivered, but it cannot determine whether the filenames, component rasters, or bivariate pixels express the intended scenario. Importing them under an assumed scenario could present incorrect operational meaning.

**Required confirmation or correction:** identify the exact UHF and WiFi source product used for each bivariate raster. If the rasters are correct, revise the metadata or filenames to state that provenance. If they are not correct, redeliver the affected rasters. Future manifest records should include the two component filenames so the published formula can be verified automatically.

### 2. Remove or explain the `0600` filename token

Communications coverage is not expected to vary by time, so `0600` should not define a product dimension. It appears in every communications filename but does not distinguish any delivered product.

The meaningful dimensions appear to be:

- lander/site: `BlueOrigin` or `SpaceX`;
- analysis scenario: `Available` or `Conservative`; and
- output product: UHF, WiFi, or combined UHF/WiFi bivariate.

**Required clarification:** confirm that `0600` has no effect on the coverage calculation. If it is only a processing or legacy naming artifact, remove it from future filenames and metadata. If it has another non-temporal meaning, document that meaning.

## Packaging guidance for future deliveries — no redelivery required for current use

The items in this section are recoverable by AEGIS for this drop. They should be corrected in future packaging, but they do not by themselves require another copy of the current data.

### 3. The nomenclature feature `Walnut crater` should have included an ID

The nomenclature redelivery contains 90 points. The original 89 features retain the same IDs, labels, and coordinates as the 2026-08-12 delivery. The one added feature is:

- Label: `Walnut crater`
- Coordinate: approximately `(33.5075552, -84.2209116)`
- delivered `id`: null

The delivered `id` attribute uses opaque strings rather than integers, so there is no numeric maximum in that attribute. The shapefile feature-record IDs run from `0` through `89`. For this import, AEGIS will assign `Walnut crater` the integer ID **`90`**, the next integer after the highest feature-record ID in the file. A corrected delivery is not required for this import.

**Future delivery requirement:** populate a non-null, unique `id` on every nomenclature feature. Keep the same identity for `Walnut crater` in later deliveries; do not assign it a different ID after AEGIS has imported it as `90`.

### 4. The communications package contains twelve duplicate rasters that should not have been delivered

The delivery contains twelve logical communications rasters: four UHF, four WiFi, and four combined UHF/WiFi bivariate products. Each of those twelve correctly named files has a byte-for-byte identical second copy whose filename inserts `tif` before the actual extension. The directory therefore contains 24 communications `.tif` files even though it contains only twelve distinct raster products.

- `..._Class.tif` and `..._Classtif.tif`
- `..._Bivariate.tif` and `..._Bivariatetif.tif`

AEGIS will ignore every `*Classtif.tif` and `*Bivariatetif.tif` file and use only the correctly named copy.

**Future delivery requirement:** deliver only the canonical `..._Class.tif` and `..._Bivariate.tif` files. Add a packaging check for duplicate checksums and malformed doubled extensions.

### 5. Communications raster `.lyrx` files are not needed by AEGIS

The communications GeoTIFFs already contain the exact class colors in their embedded TIFF palettes. AEGIS can expand those palettes to RGBA during conversion and does not need to parse the ArcGIS `.lyrx` files.

The JSON class definitions remain useful because they provide the human-readable legend labels that are not present in the TIFF palette. For example, the TIFF contains the RGB value for class `2`, while the JSON says that class `2` means `Available`.

This has been confirmed against the AEGIS metadata path: the pipeline can write the JSON labels and colors into each output layer's `properties.json`; `register.py` imports that `legend`; and the AEGIS layer UI renders the registered legend. The `.lyrx` is therefore not needed either to color the output pixels or to generate and display the legend.

**Future delivery requirement:** for AEGIS, provide each categorical GeoTIFF with a machine-readable JSON class definition. The communications `.lyrx` files may be omitted. If `.lyrx` files are retained for other consumers, their human-readable labels should match the JSON.

### 6. The `delivered_rasters` lists are inconsistent but unused by AEGIS

The JSON class definitions are useful, but their `delivered_rasters` inventories are inconsistent. This does not block import: the current GIS pipeline does not read `delivered_rasters`, and the planned categorical-raster step will receive each source raster explicitly. It needs the class values, labels, colors, and NoData metadata from the JSON—not its file inventory.

#### These parts are correct and usable

- The UHF, WiFi, and bivariate class values, human-readable labels, and colors are complete.
- The JSON colors match the embedded TIFF palettes.
- NoData `255`, transparent rendering, and nearest-neighbor categorical rendering are documented.
- The bivariate encoding `(UHF_CLASS * 3) + WIFI_CLASS` is documented.
- `MIA_UHF_Symbology.json` correctly references the two Blue Origin UHF files that it lists.
- `MIA_Bivariate_Symbology.json` correctly references the two Blue Origin bivariate files that it lists.
- The five files listed by `MIA_WiFi_Symbology.json` exist and match the applicable class definitions inside that JSON.

#### These raster files were delivered but omitted from the JSON lists

The GeoTIFFs below are present in the delivery and have usable symbology. The problem is only that none of the three delivered `MIA_*_Symbology.json` files names them in its `delivered_rasters` inventory:

- `WiFi_BlueOrigin_Standing_0600_Available_Class.tif`
- `WiFi_BlueOrigin_Standing_0600_Conservative_Class.tif`
- `UHF_WiFi_SpaceX_Standing_0600_Available_Bivariate.tif`

#### These lists are inconsistent

- `MIA_WiFi_Symbology.json` is named as a WiFi-only file but its inventory mixes SpaceX UHF, WiFi, and bivariate products.
- The three files do not collectively provide a complete inventory of the twelve logical communications rasters.
- The package mixes schema/toolbox versions: `MIA_WiFi_Symbology.json` uses `1.0` / `2.4.0-candidate`, while the UHF and bivariate JSON files use `1.1` / `2.4.1-candidate`.

#### Effect on AEGIS

There is no effect on AEGIS processing. `delivered_rasters` is not referenced anywhere in the current GIS pipeline. The planned categorical-raster step will also select each canonical input explicitly and use only the applicable class metadata. No redelivery is needed for these list inconsistencies. This does not resolve the separate bivariate provenance problem in feedback item 1.

**Future delivery guidance:** either make the `delivered_rasters` lists complete and consistently grouped, or omit them. If a final-package manifest is provided, use one record per logical raster with explicit filename, site, scenario, product, class-schema version, and component provenance for bivariate products. Do not model `0600` as a time dimension unless the value changes the analysis.

## Positive changes from the previous delivery

1. **Vectors were supplied as shapefiles without redundant GeoJSON exports.** This follows the prior request and preserves authoritative CRS information in each `.prj`.
2. **Communications classes are machine-readable.** The JSON supplies values, labels, colors, NoData behavior, and the bivariate formula.
3. **Communications products share a consistent grid.** Their extent, resolution, dimensions, type, and NoData footprint match.
4. **Nomenclature retains the agreed lowercase `label` property.** The existing 89 feature identities remain stable; AEGIS can fill the new point's missing ID locally for this import.

---

# Part 2 — Internal AEGIS implementation plan — do not send externally

## Inputs to use and ignore

### Use

- The twelve correctly named communications GeoTIFFs ending in `_Class.tif` or `_Bivariate.tif`.
- The embedded TIFF palettes as the authoritative source of rendered pixel colors.
- The JSON `classes` arrays for legend labels and as a cross-check against the embedded palettes.
- `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin.tif` as the sole viewshed source.
- `MP026_Horizon_1mSfS_10mLOLA_alt_1_5_rng_9998_28.shp` if that horizon is not already registered.
- `MS3_A03MP026_Nomenclature_v2.shp`, assigning `Walnut crater` the local integer ID `90` during normalization.

### Ignore

- All `*Classtif.tif` and `*Bivariatetif.tif` duplicates and their sidecars.
- `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY.*` in full.
- The viewshed polygon `.lyrx`.
- All raster `.lyrx` files for communications and viewshed processing.
- The `delivered_rasters` arrays; the pipeline does not use them.

## Why the delivered rasters cannot all be registered blindly

The GeoTIFFs contain valid class indices and embedded palettes, but the current AEGIS OpenLayers COG path reads a one-band palette-indexed TIFF as numeric sample values. It does not automatically expand the TIFF color map into display RGB. Registering a communications source unchanged would therefore render class indices as grayscale rather than with the delivered class colors.

The pipeline must perform a mechanical conversion before registration:

```text
palette-indexed GeoTIFF
  -> expand embedded palette by exact class value
  -> transparent NoData
  -> RGBA DEFLATE COG
  -> properties.json with JSON-derived legend
```

This is not subjective reinterpretation of GIS symbology. It is a lossless expansion of colors already embedded in the source TIFF. No `.lyrx` parsing is required.

The viewshed is a separate binary-mask case. Its source palette is absent and AEGIS intentionally renders only non-visible class `2`; values `0` and `1` become transparent. The existing `viewshed-cogs` architecture already implements that presentation, but its validator must accept this delivered file's missing NoData tag.

## Communications raster contract

All twelve canonical communications rasters have:

- dimensions `334 x 334`;
- resolution `5 m/pixel`;
- bounds approximately `(95940.595, 145351.848)` to `(97610.595, 147021.848)` metres;
- one unsigned Byte band;
- NoData `255` with a transparent mask;
- LZW compression and COG layout metadata; and
- nearest-neighbor categorical semantics.

### UHF classes

| Value | Label       | Color       |
| ----: | ----------- | ----------- |
|     0 | No coverage | `#2A1A8A`   |
|     1 | Marginal    | `#3D64AD`   |
|     2 | Available   | `#4FADD0`   |
|   255 | NoData      | transparent |

### WiFi classes

| Value | Label       | Color       |
| ----: | ----------- | ----------- |
|     0 | No coverage | `#2A1A8A`   |
|     1 | Marginal    | `#843598`   |
|     2 | Available   | `#DE4FA6`   |
|   255 | NoData      | transparent |

### Bivariate classes

| Value | Label                           | Color       |
| ----: | ------------------------------- | ----------- |
|     0 | No voice or video               | `#2A1A8A`   |
|     1 | Marginal video only             | `#843598`   |
|     2 | Video only                      | `#DE4FA6`   |
|     3 | Marginal voice only             | `#3D64AD`   |
|     4 | Both marginal                   | `#9080BD`   |
|     5 | Marginal voice; video available | `#E39BCC`   |
|     6 | Voice only                      | `#4FADD0`   |
|     7 | Voice available; video marginal | `#9CCAE1`   |
|     8 | Voice and video available       | `#E9E6F2`   |
|   255 | NoData                          | transparent |

Legends should retain the complete declared vocabulary even when a particular raster contains no pixels for one or more valid classes.

## Pipeline work required

### 1. Add a generic categorical-raster conversion step

Implement a repeatable categorical-raster input path with an explicit source GeoTIFF, class-definition JSON, and output layer name.

For each input:

1. Validate one Byte band, CRS, transform, dimensions, NoData, and source values.
2. Read the embedded TIFF palette and validate it against the selected JSON class definition.
3. Expand exact class values to RGBA; make NoData transparent.
4. Do not interpolate, stretch, or rescale class values.
5. Write a browser-decodable DEFLATE COG at `Layers/<name>/<name>_cog.tif`.
6. Write `properties.json` with a human-readable name, description, and one legend row per declared JSON class in source order.
7. Record source checksum, class counts, source grid, metadata version, and output checksum in an audit sidecar or conversion report.

Generalize `common/colorize_classified_mask.py` rather than adding hardcoded UHF, WiFi, and bivariate constants. Existing COG registration already discovers the output and reads its `properties.json`.

### 2. Align viewshed validation with the source actually delivered

The current viewshed converter requires a TIFF NoData tag of `255`. The 2026-08-20 and 2026-09-17 Blue Origin viewshed COGs instead have no NoData tag and contain `0`, `1`, and `2`.

Update and test the converter contract to:

- accept this known untagged `0/1/2` source;
- render `0` and visible class `1` as transparent;
- render non-visible class `2` with the AEGIS viewshed color; and
- write an RGBA DEFLATE COG and one-class `Non-visible` legend.

Do not add any viewshed-vector processing.

### 3. Add delivery preflight checks

Add a preflight utility or stage that:

- groups files by checksum and reports duplicate content;
- rejects malformed suffixes such as `Classtif.tif` and `Bivariatetif.tif`;
- reports manifest entries absent from disk and canonical rasters absent from the manifest;
- compares CRS, dimensions, transform, extent, and NoData for products expected to share a grid;
- checks required, non-null, unique vector properties such as nomenclature `id` and `label`;
- reports invalid vector geometry; and
- optionally verifies `bivariate == UHF * 3 + WiFi` when authoritative component relationships are supplied.

Preflight should stop on ambiguous semantic inputs rather than choosing a scenario from its filename.

### 4. No implementation needed for the other vectors

- **Horizon:** the existing `horizons` step already consumes the shapefile and lunar geographic CRS.
- **Nomenclature rendering:** the existing vector normalizer and map label behavior support `id` and `label`. For this delivery, normalization will fill the one missing `Walnut crater` ID with integer `90`.
- **Viewshed polygon:** ignore it; no repair or import support is needed.

## Import plan

1. Exclude all malformed duplicate rasters and all vectorized viewshed files.
2. Obtain authoritative bivariate provenance; this remains the only data-semantics blocker.
3. Convert the twelve canonical communications rasters through the new categorical-raster step.
4. Convert the Blue Origin viewshed raster through the updated `viewshed-cogs` step.
5. Import the altitude-1.5 horizon only if it is not already present.
6. Normalize nomenclature with `Walnut crater` assigned ID `90`, then assert 90 features, 90 non-null unique IDs, and 90 non-null labels.
7. Register the generated COGs and GeoJSON products through the existing registration path.
8. Compare AEGIS against the source at native resolution for exact colors, nearest-neighbor boundaries, transparent background/NoData, legend ordering, and spatial alignment.

## Acceptance criteria

- Exactly twelve communications sublayers are produced from twelve canonical inputs, not 24.
- Each communication output pixel is either transparent NoData or the exact RGBA color from the source TIFF palette.
- No categorical raster is stretched or interpolated.
- Each communication legend uses the complete human-readable JSON class vocabulary.
- All communication outputs preserve the common source grid and render at the expected mission location.
- Each accepted bivariate product has GIS-confirmed component provenance and passes any applicable formula check.
- The viewshed output renders only non-visible class `2`; classes `0` and `1` are transparent.
- No vectorized viewshed is converted or registered.
- Nomenclature contains 90 non-null unique IDs and 90 non-null labels, with `Walnut crater` assigned integer ID `90`.
- Conversion records include canonical source filenames and checksums.
