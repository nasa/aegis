/**
 * AssetUncertainty — draws each visible asset's uncertainty radius as a ring.
 *
 * Rings are built like the lander/station proximity circles in `Circles`: one
 * `createCircleLayer(center, radiusMeters)` per asset with a positive radius, at
 * `Z_INDEX.CIRCLES` so rings sit below every marker, rebuilt in full on change. The ring
 * layers have no feature ids, so they can never be an edit target, and are not interactive.
 * Zero uncertainty draws no ring. On the editor, the edited asset's ring follows the draft.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { DEFAULT_ASSET_RING_COLOR } from "utils/assets";
import { createCircleLayer } from "../utils/layers/circleLayer";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { Z_INDEX } from "../utils/zIndex";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useVisibleMapAssets } from "./AssetMarkers";

export function AssetUncertainty(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();
  const circleMinWidth = MODE_CONFIGS[mode].circle.minWidth;
  const visibleAssets = useVisibleMapAssets();

  const layersRef = useRef<VectorLayer<VectorSource>[]>([]);

  useEffect(() => {
    const layers = layersRef.current;
    for (const asset of visibleAssets) {
      if (!(asset.uncertaintyMeters > 0)) continue;
      const layer = createCircleLayer(
        toMapCoord(asset.location) as [number, number],
        asset.uncertaintyMeters,
        {
          zIndex: Z_INDEX.CIRCLES,
          stroke: {
            mode: "solid",
            color: asset.color || DEFAULT_ASSET_RING_COLOR,
            width: circleMinWidth,
          },
          label: null,
        }
      );
      map.addLayer(layer);
      layers.push(layer);
    }

    return () => {
      for (const layer of layers) map.removeLayer(layer);
      layers.length = 0;
    };
  }, [visibleAssets, toMapCoord, map, circleMinWidth]);

  return null;
}
