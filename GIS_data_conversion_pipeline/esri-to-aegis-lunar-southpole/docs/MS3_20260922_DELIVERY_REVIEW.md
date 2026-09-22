# MS3 2026-09-17 GIS Delivery Review

## Scope

Reviewed delivery:

`F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260917`

Review date: 2026-09-19.

This review compares the drop with the 2026-08-05, 2026-08-12, and 2026-08-20 deliveries and with `MS3_20260812_GIS_TEAM_FEEDBACK.md`.

Feedback intended for the GIS delivery team is recorded separately in [`MS3_20260922_GIS_TEAM_FEEDBACK.md`](MS3_20260922_GIS_TEAM_FEEDBACK.md).

## Delivery decision summary

The drop contains three redelivered vector datasets and twelve new logical communications rasters.

The usable raster data is better than the packaging initially suggests. All twelve logical communications rasters:

- share one 5 m grid;
- use Byte class values and `255` NoData;
- carry embedded TIFF palettes whose colors match the supplied JSON;
- use an effective transparent NoData mask; and
- are tiled GeoTIFFs with COG layout metadata.

AEGIS can handle the following issues without a replacement delivery:

- Use only the viewshed GeoTIFF rather than the vectorized viewshed.
- Use the twelve canonical communication files and omit their duplicate copies with doubled extensions.
- Use the embedded TIFF palettes for pixel colors rather than the raster `.lyrx` files.
- Use the JSON class definitions only for human-readable legends and validation.
- Handle the viewshed's `0/1/2` source convention in the AEGIS converter.
- Select each input explicitly and associate it with the appropriate class definition rather than relying on the incomplete JSON file inventories.
- Assign `Walnut crater` the local AEGIS ID `90`, one greater than the highest feature-record ID `89` in the delivered file.

Two items need clarification from the producing team before AEGIS can assign the intended meaning to the affected layers:

- the intended component scenarios or provenance of two bivariate communications rasters; and
- whether `0600` represents a product characteristic or is a legacy filename token.

The remainder of this document records the internal AEGIS implementation plan.

## Inputs to use and omit

### Use

- The twelve correctly named communications GeoTIFFs ending in `_Class.tif` or `_Bivariate.tif`.
- The embedded TIFF palettes as the source of rendered pixel colors.
- The JSON `classes` arrays for legend labels and as a cross-check against the embedded palettes.
- `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin.tif` as the sole viewshed source.
- `MP026_Horizon_1mSfS_10mLOLA_alt_1_5_rng_9998_28.shp` if that horizon is not already registered.
- `MS3_A03MP026_Nomenclature_v2.shp`, assigning `Walnut crater` the local integer ID `90` during normalization.

### Omit from processing

- All `*Classtif.tif` and `*Bivariatetif.tif` duplicates and their sidecars.
- `A03MP026_SfS_1mpp_VIEWSHED_BlueOrigin_NONVISIBLE_POLY.*` in full.
- The viewshed polygon `.lyrx`.
- All raster `.lyrx` files for communications and viewshed processing.
- The `delivered_rasters` arrays; the pipeline does not use them.

## Why the delivered rasters need a conversion step before registration

The GeoTIFFs contain valid class indices and embedded palettes, but the current AEGIS OpenLayers COG path reads a one-band palette-indexed TIFF as numeric sample values. It does not automatically expand the TIFF color map into display RGB. Registering a communications source unchanged would therefore render class indices as grayscale rather than with the delivered class colors.

The pipeline will perform a mechanical conversion before registration:

```text
palette-indexed GeoTIFF
  -> expand embedded palette by exact class value
  -> transparent NoData
  -> RGBA DEFLATE COG
  -> properties.json with JSON-derived legend
```

This conversion preserves the colors already embedded in the source TIFF by expanding them losslessly. It does not require `.lyrx` parsing.

The viewshed is a separate binary-mask case. Its source has no palette, and AEGIS renders only non-visible class `2`; values `0` and `1` become transparent. The existing `viewshed-cogs` architecture already implements that presentation, and its validator needs to accommodate this file's missing NoData tag.

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

## Planned pipeline work

### 1. Add a generic categorical-raster conversion step

Implement a repeatable categorical-raster input path with an explicit source GeoTIFF, class-definition JSON, and output layer name.

For each input:

1. Validate one Byte band, CRS, transform, dimensions, NoData, and source values.
2. Read the embedded TIFF palette and validate it against the selected JSON class definition.
3. Expand exact class values to RGBA; make NoData transparent.
4. Preserve class values without interpolation, stretching, or rescaling.
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

No viewshed-vector processing is planned.

### 3. Add delivery preflight checks

Add a preflight utility or stage that:

- groups files by checksum and reports duplicate content;
- identifies and excludes doubled suffixes such as `Classtif.tif` and `Bivariatetif.tif`;
- reports manifest entries absent from disk and canonical rasters absent from the manifest;
- compares CRS, dimensions, transform, extent, and NoData for products expected to share a grid;
- checks expected, non-null, unique vector properties such as nomenclature `id` and `label`;
- reports vector geometry that may need attention; and
- optionally verifies `bivariate == UHF * 3 + WiFi` when confirmed component relationships are supplied.

When an input's meaning is unclear, preflight should request clarification rather than infer a scenario from the filename.

### 4. No implementation needed for the other vectors

- **Horizon:** the existing `horizons` step already consumes the shapefile and lunar geographic CRS.
- **Nomenclature rendering:** the existing vector normalizer and map label behavior support `id` and `label`. For this delivery, normalization will fill the one missing `Walnut crater` ID with integer `90`.
- **Viewshed polygon:** omit it; no additional import support is needed.

## Import plan

1. Exclude the duplicate raster copies with doubled extensions and all vectorized viewshed files.
2. Obtain confirmed bivariate provenance; this is the remaining open data-semantics question.
3. Convert the twelve canonical communications rasters through the new categorical-raster step.
4. Convert the Blue Origin viewshed raster through the updated `viewshed-cogs` step.
5. Import the altitude-1.5 horizon only if it is not already present.
6. Normalize nomenclature with `Walnut crater` assigned ID `90`, then assert 90 features, 90 non-null unique IDs, and 90 non-null labels.
7. Register the generated COGs and GeoJSON products through the existing registration path.
8. Compare AEGIS against the source at native resolution for exact colors, nearest-neighbor boundaries, transparent background/NoData, legend ordering, and spatial alignment.

## Validation criteria

- Exactly twelve communications sublayers are produced from twelve canonical inputs, not 24.
- Each communication output pixel is either transparent NoData or the exact RGBA color from the source TIFF palette.
- No categorical raster is stretched or interpolated.
- Each communication legend uses the complete human-readable JSON class vocabulary.
- All communication outputs preserve the common source grid and render at the expected mission location.
- Each imported bivariate product has GIS-confirmed component provenance and passes any applicable formula check.
- The viewshed output renders only non-visible class `2`; classes `0` and `1` are transparent.
- No vectorized viewshed is converted or registered.
- Nomenclature contains 90 non-null unique IDs and 90 non-null labels, with `Walnut crater` assigned integer ID `90`.
- Conversion records include canonical source filenames and checksums.
