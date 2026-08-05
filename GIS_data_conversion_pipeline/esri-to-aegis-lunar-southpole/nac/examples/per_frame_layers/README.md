# Preserved example — per-frame NAC layers

> ⚠️ **This is a kept example, not the shipping pipeline.** The production NAC
> process tiles a _single_ GIS-provided mosaic into **one** `nac` layer (see
> [`../../stretch_to_8bit.py`](../../stretch_to_8bit.py) +
> [`../../../common/tile_to_cap_grid.py`](../../../common/tile_to_cap_grid.py),
> driven by [`../../../main.py`](../../../main.py)). Nothing here is invoked by
> `main.py`.

## What it does

This is the earlier **test configuration** that processed each LROC NAC ortho frame
independently and imported it as its **own** AEGIS sublayer — producing **100+
sublayers** per mission (one per `M*-map.tif` frame). We decided not to ship that
(too many sublayers), but it is retained as a worked reference for how per-frame
layering could be done if ever needed.

Per-frame flow:

1. `build_nac_layer_pyramids.py` discovers all `M*-map.tif` frames (excluding `mm2-*`
   QA rasters), then for each frame: contrast-stretch independently
   (`nac/stretch_to_8bit.py`) → tile onto the cap grid
   (`common/tile_to_cap_grid.py`) → write `Layers/<frame-stem>/`.
2. `insert_nac_layers_into_aegis_db.py` registers each built frame folder as an
   individual `tile` sublayer via the AEGIS API.

## Running it (standalone)

From `GIS_data_conversion_pipeline/`, via pixi:

```bash
# Build one tile pyramid per NAC frame
pixi run python esri-to-aegis-lunar-southpole/nac/examples/per_frame_layers/build_nac_layer_pyramids.py \
    F:/_repos/aegis_static/MS3/A03MP026_SFS_1mpp_orthoimages \
    F:/_repos/aegis_static/<env>/Layers

# Register each built frame as its own AEGIS sublayer (un-pinned: pass everything)
pixi run python esri-to-aegis-lunar-southpole/nac/examples/per_frame_layers/insert_nac_layers_into_aegis_db.py \
    --mission-id <id> \
    --layers-dir F:/_repos/aegis_static/<env>/Layers \
    --layer-name <parent-layer-name> \
    --dry-run
```

The insert script has no hardcoded mission/path defaults — `--mission-id` and
`--layers-dir` are required.
