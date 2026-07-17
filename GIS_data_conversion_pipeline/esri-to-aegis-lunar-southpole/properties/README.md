# properties — AEGIS `properties.json` writer

Generates the per-layer metadata file the AEGIS admin auto-imports
(`loadSublayerPropertiesFromFile` in `src/components/admin/layerSublayerEdit.tsx`), built
from a GDAL `color-relief` colour ramp so the legend always matches the applied colours.

```bash
cd GIS_data_conversion_pipeline

# Slope legend (degrees) from the standard ramp
pixi run python esri-to-aegis-lunar-southpole/properties/write_properties.py \
    --processing slope --units deg \
    --ramp esri-to-aegis-lunar-southpole/products/default_color_ramps/slope.txt \
    --out <out>/Layers/slope/properties.json

# Hillshade — no ramp, no legend
pixi run python esri-to-aegis-lunar-southpole/properties/write_properties.py \
    --processing hillshade --out <out>/Layers/hillshade/properties.json
```

## Output contract

Validated against `.local/schemas/sublayerImportable.json` (`additionalProperties: false`),
so the file contains **only** schema-allowed keys:

```json
{
  "type": "tile",
  "name": "slope",
  "description": "…",
  "tilePattern": "{z}/{x}/{y}.png",
  "legend": { "version": "2", "unitsAbbr": "deg", "legend": [ { "color": "rgb(...)", "description": "[0.0, 2.0)" }, … ] }
}
```

`boundingBox` / `minNativeZoom` / `maxNativeZoom` / `maxZoom` / `tileFormat` are **not**
emitted here — the admin reads those straight from the layer's `tilemapresource.xml`.

Legend formatting matches the legacy `lunar_utils/aegis/properties.py`: consecutive equal
colours merge into one bin, the last bin is `≥ x`, and **aspect** bins are labelled by
ordinal direction (N, NE, … NW). Pass `--processing` to pick the default description/units
(`slope`=deg, `tri`=m); override with `--units`, `--name`, `--description`.

Ported from `lunar_utils/aegis/properties.py` (the `tiff_manager`/`ManagedPath` coupling
dropped in favour of plain CLI args).
