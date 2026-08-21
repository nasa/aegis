# Native elevation prototype

This directory is an isolated first implementation of native Node GeoTIFF elevation sampling. It
is not connected to the Express elevation route and does not change the current GDAL service.

The prototype:

- reads ordinary tiled or striped GeoTIFFs with `geotiff`;
- transforms longitude/latitude with an explicitly supplied proj4 definition;
- groups samples by raster block so each required tile or strip is read once;
- preserves the legacy great-circle interpolation and `-1100101` missing-value sentinel; and
- prints raster metadata and read counts for inspection.

Run it with a DEM, the projection encoded by that DEM, and a path:

```text
npm run elevation:prototype -- --raster <dem.tif> --projection '<proj4>' --path '<json>' --steps '<json>'
```

For the local Apollo 14 DEM, its GeoTIFF keys describe an equirectangular lunar projection:

```text
+proj=eqc +lat_ts=-3 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs
```

The current Apollo 14 mission `projProj4String` is a different display projection and produces
out-of-bounds pixels for this raster. The production implementation must derive or validate the
raster CRS instead of assuming the mission display projection is identical.

## Mission 50 results

The prototype was tested against mission 50's configured elevation raster:

```text
Data/mp2-sfs-dem_MoonSP_COG_deflate_cog.tif
```

The raster is a `57840 × 41790`, one-meter Float32 COG with `512 × 512` Deflate-compressed tiles.
Its embedded projection metadata agrees with mission 50's lunar south-pole stereographic
projection.

A six-point profile near the mission lander returned:

| Engine                | Elevations (meters)                                                            |
| --------------------- | ------------------------------------------------------------------------------ |
| Node prototype        | `5414.891113, 5414.891113, 5414.891113, 5414.891113, 5414.913574, 5414.913574` |
| Existing GDAL service | `5414.891, 5414.891, 5414.891, 5414.891, 5414.9136, 5414.9136`                 |

The values agree within the precision shown by the GDAL service. All six samples were served by
one decoded tile. The prototype also sampled mission 50's
`Data/LOLA_LDEM_83S_10MPP_ADJ_deflate_cog.tif` successfully at its ten-meter resolution.

## Local performance results

These measurements were collected locally with Node 24 against mission 50's one-meter COG. Each
reported Node value excludes the first warm-up run. The GDAL values include the local HTTP hop to
the existing container, while the Node prototype measurements call `readElevationProfile`
directly.

| Scenario                          | Blocks read | Node median | Node mean | Existing GDAL mean |
| --------------------------------- | ----------: | ----------: | --------: | -----------------: |
| 6 samples in one tile             |           1 |     12.4 ms |   12.6 ms |            13.7 ms |
| 1,000 samples in one tile         |           1 |     16.8 ms |   17.1 ms |            33.8 ms |
| 10,000 samples in one tile        |           1 |     48.2 ms |   52.6 ms |       Not measured |
| 10,000 samples across seven tiles |           7 |    131.5 ms |  127.1 ms |           263.8 ms |

The first cold Node request took approximately 55 ms. The prototype currently opens, parses, and
closes the GeoTIFF for every call, so the planned open-handle cache should reduce that overhead.
The results also show that cost is driven more by unique blocks decoded than by sample count:
10,000 samples in one tile were substantially cheaper than 10,000 samples spanning seven tiles.

These are sequential development-machine measurements, not concurrent load tests. Wide profiles
can consume more than 100 ms on the API process, so event-loop delay under concurrent long-profile
requests still needs to be measured before cutover. Ordinary station and short-traverse requests
appear comparable to or faster than the current GDAL service.
