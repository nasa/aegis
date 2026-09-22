# MS3 2026-08-05 GIS Delivery Review

## Scope

Reviewed extracted delivery folder:

`F:\tempF\MS3_data_drop\AEGIS_MS3_MP026_GIS_Data_20260805`

Review date: 2026-09-22.

This was the second delivery round used to extend the AEGIS GIS pipeline. It introduced packaged horizons, contours, classified viewsheds, and a slope keep-out product.

## Delivery and implementation timeline

The export log records processing from 2026-08-05 15:17 through 15:57. The following Git author dates align with the delivery:

| Date       | Commit     | AEGIS work                                                  |
| ---------- | ---------- | ----------------------------------------------------------- |
| 2026-08-05 | `6ee1d580` | Generalized the MS3 work into the GIS data pipeline         |
| 2026-08-05 | `f6131175` | Added vector-layer styling                                  |
| 2026-08-06 | `98e7245c` | Added classified-mask and viewshed conversion               |
| 2026-08-13 | `4e8f2efe` | Added the horizon import path and other pipeline extensions |

The first two commits were authored during the recorded GIS export window, indicating coordinated development rather than a response to a completed package. The August 6 classified-raster work is the clearest immediate implementation response to the delivered viewshed and keep-out products.

## High-level inventory

The approximately 89 MB extracted package contains:

- 11 logical vector datasets, each represented as a shapefile and GeoJSON;
- three logical classified raster products, each represented as a source GeoTIFF and a COG copy;
- eight ArcGIS `.lyrx` style files;
- an export log; and
- an FGDC metadata summary.

### Vector products

- exploration-zone 10 m contours: 294 lines;
- far-field 100 m contours: 209 lines;
- one lander point;
- Blue Origin non-visible viewshed polygons: 531 polygons;
- SpaceX non-visible viewshed polygons: 487 polygons; and
- six single-feature horizon lines for altitudes `0`, `1.5`, `2`, `36`, `41`, and `54`.

The contours, lander, and horizon shapefiles have valid geometry. The polygonized viewsheds contain geometry errors: 8 invalid Blue Origin polygons and 10 invalid SpaceX polygons.

### Raster products

The Blue Origin viewshed, SpaceX viewshed, and 20-degree slope keep-out products all share a 1 m/pixel, `5448 x 5449`, unsigned Byte grid with `255` NoData. Each source/COG pair has identical pixels, transform, and CRS.

- Blue Origin viewshed classes: `1` visible and `2` non-visible.
- SpaceX viewshed classes: `1` visible and `2` non-visible.
- Slope keep-out classes: `0` keep-out and `255` NoData.

## AEGIS implementation resulting from this delivery

The delivery prompted or validated:

- generic vector normalization and map styling;
- horizon-shapefile import using authoritative lunar CRS metadata;
- exact class-mask colorization for viewsheds and keep-out zones;
- transparent background/NoData handling;
- browser-compatible generated raster products; and
- registration of the resulting vector and raster sublayers.

AEGIS later standardized on the raster viewshed as the authoritative source. Polygonizing the same viewshed adds geometry, validation, and rendering work without adding information needed by AEGIS.

## Positive aspects

1. The package had a clear `00_GIS_Files` / `01_Styles` organization.
2. The export log and FGDC summary materially improved traceability.
3. Shapefiles retained authoritative CRS metadata.
4. The classified rasters used a common grid and explicit NoData value.
5. Source and COG copies allowed exact conversion verification.
6. Horizon lines were supplied in lunar geographic coordinates and were directly usable through a CRS-aware import path.

## High-level feedback for future deliveries

1. **Provide one authoritative representation per logical product.** For AEGIS, use shapefile for vectors requiring CRS verification and GeoTIFF for classified rasters.
2. **Omit polygonized viewsheds when the raster is supplied.** The August 5 polygon copies contain invalid geometry and are not needed by AEGIS.
3. **Avoid duplicate source/COG and shapefile/GeoJSON copies unless both serve documented consumers.** The raster pairs are pixel-identical, while the paired vector formats increase review work.
4. **Provide a machine-readable class definition for every categorical raster.** Include values, labels, colors, NoData/background behavior, and nearest-neighbor rendering semantics.
5. **Make styles map one-to-one to delivered products.** The style folder includes styles for products not present in the final extracted package, and a 20 m contour style accompanies a delivered 10 m contour dataset.
6. **Describe the final package, not only the source geodatabase.** The export log reports 28 vectors and 10 rasters from the source geodatabase, while the extracted package contains a selected subset. A final-package manifest would remove that ambiguity.
7. **Prefer source DEM plus documented contour intervals, or a tiled vector product, for dense contours.** The delivered contour GeoJSON copies are much larger than the corresponding shapefiles and are not an efficient AEGIS map format.

## Disposition

The delivery was usable after AEGIS conversion. The raster viewsheds and keep-out mask were the preferred classified sources; horizon shapefiles were suitable inputs; polygonized viewsheds were unnecessary. Later deliveries superseded or corrected portions of the viewshed data.
