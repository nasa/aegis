# MS3 2026-09-17 GIS Team Feedback

## Scope

Reviewed delivery:

`F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260917`

Review date: 2026-09-19.

This feedback compares the drop with the initial June terrain/orthophoto delivery and with the 2026-08-05, 2026-08-12, and 2026-08-20 deliveries.

Internal findings and implementation work are recorded separately in [`MS3_20260922_DELIVERY_REVIEW.md`](MS3_20260922_DELIVERY_REVIEW.md).

Cross-delivery context and consolidated recommendations are in [`MS3_20260922_ALL_GIS_DELIVERIES_FEEDBACK.md`](MS3_20260922_ALL_GIS_DELIVERIES_FEEDBACK.md).

## Feedback summary

The COMM MIA layers and corrected Blue Origin viewshed are now on AEGIS production. Two semantic items still need clarification so the affected COMM layers have authoritative provenance:

- the intended component scenarios or provenance of two bivariate communications rasters; and
- whether `0600` represents a product characteristic or is a legacy filename token.

The remaining items are non-blocking packaging suggestions. A replacement delivery is not needed for them.

## Viewshed files and geometry issue

The delivery contains **one logical raster viewshed and one logical vectorized copy** of that viewshed:

| Logical product             | Files received                                                                                                                                                                                        | AEGIS decision                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Raster viewshed             | `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin.tif` plus its `.aux.xml` and raster attribute-table sidecars                                                                                                   | **Use this product.** It served as the source for the corrected AEGIS production layer.                                  |
| Vectorized non-visible area | One shapefile dataset named `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY`, represented by the normal `.shp`, `.dbf`, `.shx`, `.prj`, `.cpg`, `.sbn`, `.sbx`, and `.shp.xml` companion files | **Not needed for the AEGIS import.** The multiple files are components of one shapefile, not multiple viewshed products. |
| ArcGIS styles               | One `.lyrx` for the raster and one `.lyrx` for the polygon                                                                                                                                            | **Not needed for the AEGIS import.** AEGIS applies its established non-visible viewshed presentation during conversion.  |

The raster contains values `0`, `1`, and `2`, has no TIFF NoData tag, and defines no embedded palette. AEGIS handled this without a replacement: `0` and visible class `1` are transparent, and non-visible class `2` uses the established AEGIS viewshed color.

The vectorized copy contains 375 polygons, three of which have invalid geometry: feature IDs 147, 265, and 449 contain ring self-intersections. This defect did not affect the AEGIS import because AEGIS used the raster rather than the vectorized copy.

**For future deliveries:** when the viewshed GeoTIFF is supplied, please omit the vectorized viewshed and viewshed `.lyrx` files from the AEGIS package unless another consumer needs them. Please also state the raster's background/NoData convention in machine-readable metadata and, when practical, include only documented classes and a NoData tag.

## Things that might need to be corrected

### 1. Two bivariate rasters do not match the scenarios implied by their filenames

This issue concerns the new UHF/WiFi communications layers. The supplied JSON defines the bivariate value as:

`(UHF_CLASS * 3) + WIFI_CLASS`

The bivariate rasters were checked pixel by pixel against all delivered same-site UHF and WiFi scenario combinations.

- `UHF_WiFi_BlueOrigin_Standing_0600_Conservative_Bivariate.tif` exactly equals Conservative UHF plus Conservative WiFi.
- `UHF_WiFi_SpaceX_Standing_0600_Available_Bivariate.tif` exactly equals Available UHF plus Available WiFi.
- `UHF_WiFi_BlueOrigin_Standing_0600_Available_Bivariate.tif` exactly equals **Available UHF plus Conservative WiFi**, not Available UHF plus Available WiFi. The latter comparison differs at 3,533 valid pixels.
- `UHF_WiFi_SpaceX_Standing_0600_Conservative_Bivariate.tif` does not exactly equal any delivered UHF/WiFi scenario pairing. Its closest pairing is Available UHF plus Conservative WiFi, but 19 valid pixels still differ. Conservative UHF plus Conservative WiFi differs at 1,157 valid pixels.

The Blue Origin Available raster uses a different component combination than its filename implies, and the SpaceX Conservative raster does not exactly match any delivered component combination. AEGIS can render both files, but it cannot determine whether the filenames, component rasters, or bivariate pixels are incorrect. Importing either raster under an assumed scenario could give the layer the wrong operational meaning.

**Correction or confirmation requested:** please identify the UHF and WiFi source product used for each bivariate raster. If the rasters are correct, update the metadata or filenames to state that provenance. If the pixels or component combinations are incorrect, please provide corrected rasters. Future manifest records could include both component filenames so the published formula can be verified automatically.

### 2. The meaning of the `0600` filename token is not documented

Communications coverage is not expected to vary by time. The `0600` token appears in every communications filename, does not distinguish among the delivered products, and has no documented meaning in the supplied metadata.

The meaningful dimensions appear to be:

- lander/site: `BlueOrigin` or `SpaceX`;
- analysis scenario: `Available` or `Conservative`; and
- output product: UHF, WiFi, or combined UHF/WiFi bivariate.

**Correction or confirmation requested:** please confirm whether `0600` affects the coverage calculation. If it is only a processing or legacy naming artifact, please omit it from future filenames and metadata. If it has another non-temporal meaning, please document that meaning.

## Non-blocking packaging issues for future deliveries

The items in this section are packaging or metadata issues, but AEGIS can accommodate them in the current drop. No redelivery is needed for these items. Addressing them in future deliveries would make the packages easier to process and validate.

### 3. The nomenclature feature `Walnut crater` is missing an ID

The nomenclature redelivery contains 90 points. The original 89 features retain the same IDs, labels, and coordinates as the 2026-08-12 delivery. The one added feature is:

- Label: `Walnut crater`
- Coordinate: approximately `(33.5075552, -84.2209116)`
- delivered `id`: null

The delivered `id` attribute uses string identifiers rather than integers, so there is no numeric maximum in that attribute. The shapefile feature-record IDs run from `0` through `89`. For this import, AEGIS assigned `Walnut crater` the integer ID **`90`**, the next integer after the highest feature-record ID in the file. No updated delivery is needed for this import.

**For future deliveries:** please populate a non-null, unique `id` on every nomenclature feature. Please keep the same identity for `Walnut crater` in later deliveries so it remains aligned with the local AEGIS ID `90` used for this import.

### 4. The communications package contains twelve duplicate raster copies

The delivery contains twelve logical communications rasters: four UHF, four WiFi, and four combined UHF/WiFi bivariate products. Each of those twelve correctly named files has a byte-for-byte identical second copy whose filename inserts `tif` before the actual extension. The directory therefore contains 24 communications `.tif` files even though it contains only twelve distinct raster products.

- `..._Class.tif` and `..._Classtif.tif`
- `..._Bivariate.tif` and `..._Bivariatetif.tif`

AEGIS omitted every `*Classtif.tif` and `*Bivariatetif.tif` copy and used the canonical filename for each raster.

**For future deliveries:** please include only the canonical `..._Class.tif` and `..._Bivariate.tif` files. A packaging check for duplicate checksums and doubled extensions may help identify these copies before delivery.

### 5. Communications raster `.lyrx` files are not needed by AEGIS

The communications GeoTIFFs already contain the exact class colors in their embedded TIFF palettes. AEGIS can expand those palettes to RGBA during conversion and does not need to parse the ArcGIS `.lyrx` files.

The JSON class definitions remain useful because they provide the human-readable legend labels that are not present in the TIFF palette. For example, the TIFF contains the RGB value for class `2`, while the JSON says that class `2` means `Available`.

This has been confirmed against the AEGIS metadata path: the pipeline can write the JSON labels and colors into each output layer's `properties.json`; `register.py` imports that `legend`; and the AEGIS layer UI renders the registered legend. The `.lyrx` is therefore not needed either to color the output pixels or to generate and display the legend.

**For future deliveries:** for AEGIS, please provide each categorical GeoTIFF with a machine-readable JSON class definition. The communications `.lyrx` files may be omitted. If `.lyrx` files are retained for other consumers, their human-readable labels should match the JSON.

### 6. The `delivered_rasters` lists are incomplete and inconsistently grouped

The JSON class definitions are useful, but their `delivered_rasters` inventories are incomplete and inconsistently grouped. This did not affect import: the GIS pipeline does not read `delivered_rasters`, and the categorical-raster step receives each source raster explicitly. It needs the class values, labels, colors, and NoData metadata from the JSON—not its file inventory.

#### These parts are correct and usable

- The UHF, WiFi, and bivariate class values, human-readable labels, and colors are complete.
- The JSON colors match the embedded TIFF palettes.
- NoData `255`, transparent rendering, and nearest-neighbor categorical rendering are documented.
- The bivariate encoding `(UHF_CLASS * 3) + WIFI_CLASS` is documented.
- `MIA_UHF_Symbology.json` correctly references the two Blue Origin UHF files that it lists.
- `MIA_Bivariate_Symbology.json` correctly references the two Blue Origin bivariate files that it lists.
- The five files listed by `MIA_WiFi_Symbology.json` exist and match the applicable class definitions inside that JSON.

#### These raster files were delivered but omitted from the JSON lists

The GeoTIFFs below are present in the delivery and have usable symbology, but none of the three delivered `MIA_*_Symbology.json` files names them in its `delivered_rasters` inventory:

- `WiFi_BlueOrigin_Standing_0600_Available_Class.tif`
- `WiFi_BlueOrigin_Standing_0600_Conservative_Class.tif`
- `UHF_WiFi_SpaceX_Standing_0600_Available_Bivariate.tif`

#### Inventory inconsistencies

- `MIA_WiFi_Symbology.json` is named as a WiFi-only file but its inventory mixes SpaceX UHF, WiFi, and bivariate products.
- The three files do not collectively provide a complete inventory of the twelve logical communications rasters.
- The package mixes schema/toolbox versions: `MIA_WiFi_Symbology.json` uses `1.0` / `2.4.0-candidate`, while the UHF and bivariate JSON files use `1.1` / `2.4.1-candidate`.

#### Effect on AEGIS

There was no effect on AEGIS processing. `delivered_rasters` is not referenced anywhere in the GIS pipeline. The implemented categorical-raster step selects each canonical input explicitly and uses only the applicable class metadata. No redelivery is needed for these inventory differences. The separate bivariate provenance question in feedback item 1 still needs clarification.

**For future deliveries:** please either make the `delivered_rasters` lists complete and consistently grouped or omit them. If a final-package manifest is provided, one record per logical raster should include the filename, site, scenario, product, class-schema version, and component provenance for bivariate products. Unless `0600` changes the analysis, it should not be represented as a time dimension.

## Positive changes from the previous delivery

1. **Vectors were supplied as shapefiles without additional GeoJSON exports.** This follows the prior request and preserves source CRS information in each `.prj`.
2. **Communications classes are machine-readable.** The JSON supplies values, labels, colors, NoData behavior, and the bivariate formula.
3. **Communications products share a consistent grid.** Their extent, resolution, dimensions, type, and NoData footprint match.
4. **Nomenclature retains the agreed lowercase `label` property.** The existing 89 feature identities remain stable; AEGIS can fill the new point's missing ID locally for this import.
