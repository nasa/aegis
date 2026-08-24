# products — DEM-derived standardized layers

Derive AEGIS raster products **from a DEM** so we control our own standardized outputs
instead of depending on whatever a GIS drop happens to include.

```bash
cd GIS_data_conversion_pipeline
pixi run python esri-to-aegis-lunar-southpole/products/dem_products.py \
    --dem /path/to/dem.tif --out /path/to/products \
    --products slope hillshade aspect tri
```

| Product       | Engine (`gdal.DEMProcessing`) | Colour ramp                      | Output             |
| ------------- | ----------------------------- | -------------------------------- | ------------------ |
| **slope**     | `slope` → `color-relief`      | `default_color_ramps/slope.txt`  | 8-bit RGBA GeoTIFF |
| **hillshade** | `hillshade`                   | none (grayscale)                 | 8-bit grayscale    |
| **aspect**    | `aspect` → `color-relief`     | `default_color_ramps/aspect.txt` | 8-bit RGBA GeoTIFF |
| **tri**       | `TRI` → `color-relief`        | `default_color_ramps/tri.txt`    | 8-bit RGBA GeoTIFF |

Then tile each with [`../common/tile_to_cap_grid.py`](../common/tile_to_cap_grid.py) and
write a legend with [`../properties/write_properties.py`](../properties/). `main.py`'s
`products` step does all of this for you (hillshade/aspect/tri by default).

GDAL comes from **pixi/conda-forge** — no system GDAL install required.

## Colour standards (`default_color_ramps/`)

These are the **built-in fallback ramps**, used when the GIS team does **not** deliver product
symbology. When a `.lyrx` is provided (see "Provided symbology" below), it is converted and
used instead. The ramps are GDAL `color-relief` text files (`value R G B [A]`, with `nv` =
no-data), copied from the legacy `lunar_utils/aegis/default_color_ramps/`.

| File                                    | Legacy source            | Notes                                                                              |
| --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `slope.txt`                             | `AMPES_Slope 1.lyrx`     | **Identical to the MS3 GIS standard** (RdYlBu-10 reversed + dark-purple >20° cap). |
| `slope_constant_color.txt`              | `slope_color11_blue.txt` | Archived previous constant-color slope ramp.                                       |
| `aspect.txt`                            | `AspectColors.txt`       | ColorBrewer Set1, 8 ordinal directions (N…NW).                                     |
| `tri.txt`                               | `tri_7class.txt`         | 7-class. **TRI is resolution-dependent** — see ARCHIVE below.                      |
| `viewshed.txt`                          | `viewshed_color.txt`     | No generator here; kept as the AEGIS viewshed standard.                            |
| `comm_mask_4glte.txt`                   | `4GLTE_Comm_Mask.txt`    | No generator here; kept as the AEGIS comm-mask standard.                           |
| `ARCHIVE/TRIColors_{1m,5m,10m}_DEM.txt` | same                     | Resolution-specific TRI ramps — pass via `--tri-ramp` to match your DEM.           |

## Provided symbology (`.lyrx`)

When the GIS team delivers product symbology as an ArcGIS `.lyrx` (e.g. `AMPES_Slope 1.lyrx`),
it is used **instead of** the matching `default_color_ramps/` ramp — no manual ramp editing:

- [`lyrx_to_ramp.py`](lyrx_to_ramp.py) converts a `.lyrx` (`CIMRasterClassifyColorizer`) into
  a `gdaldem color-relief` ramp, byte-compatible with `dem_products.py` and
  `properties/write_properties.py` (so colorize and legend match).
- `dem_products.py` accepts `--slope-lyrx` / `--aspect-lyrx` / `--tri-lyrx`; precedence per
  product is `--*-lyrx` > `--*-ramp` > `default_color_ramps/`.
- The `main.py` `slope` and `products` steps auto-use the `--lyrx` symbology when present (for
  both the colorize and the AEGIS legend), falling back to `default_color_ramps/slope.txt`.

`slope.txt` encodes the same bins as the MS3 `AMPES_Slope 1.lyrx` (0–2° `rgb(49,54,149)` …
18–20° `rgb(215,48,39)`, >20° `rgb(48,31,66)`), so the fallback renders identically to the
delivered symbology.

### TRI is resolution-dependent

TRI values scale with DEM resolution, so a single ramp can't fit every DEM. The default
`tri.txt` is the legacy 7-class ramp; for a known resolution prefer a matching ramp from
`default_color_ramps/ARCHIVE/` via `--tri-ramp`, e.g.:

```bash
... --products tri --tri-ramp esri-to-aegis-lunar-southpole/products/default_color_ramps/ARCHIVE/TRIColors_1m_DEM.txt
```
