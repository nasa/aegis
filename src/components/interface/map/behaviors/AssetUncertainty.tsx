/**
 * AssetUncertainty — draws each visible asset's uncertainty radius as a filled circle.
 *
 * One own (non-shared) layer at `Z_INDEX.CIRCLES`, so circles sit below every marker. Each
 * asset with a positive radius gets a polygon feature filled in its radius color with no
 * stroke; the selected asset's circle gets a white stroke. Features are rebuilt in full on
 * change, have no ids so they can never be an edit target, and are not interactive. Zero
 * uncertainty draws nothing. On the editor, the edited asset's circle follows the in-edit values.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import { Circle as CircleGeom } from "ol/geom";
import { fromCircle } from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

import { useAppSelector, refEqual } from "utils/useAppSelector";
import { getAssetRadiusColor } from "utils/assets";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { buildAssetRadiusStyleFunction } from "../utils/styles/assetRadius";
import { Z_INDEX } from "../utils/zIndex";
import { useVisibleMapAssets } from "./AssetMarkers";

const CIRCLE_VERTICES = 128;

export function AssetUncertainty(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();
  const visibleAssets = useVisibleMapAssets();
  const selectedAssetUuid = useAppSelector(
    (s) => (mode === "editor" ? s.asset.selectedAssetUuid : null),
    refEqual
  );

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    const layer = new VectorLayer({ source: new VectorSource(), zIndex: Z_INDEX.CIRCLES });
    map.addLayer(layer);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const source = layerRef.current?.getSource();
    if (!source) return;
    const features: Feature[] = [];
    for (const asset of visibleAssets) {
      const color = getAssetRadiusColor(asset);
      if (!color) continue;
      const center = toMapCoord(asset.location) as [number, number];
      const feature = new Feature({
        geometry: fromCircle(new CircleGeom(center, asset.uncertaintyMeters), CIRCLE_VERTICES),
      });
      feature.setProperties({ assetUuid: asset.uuid, color }, true);
      features.push(feature);
    }
    source.clear(true);
    source.addFeatures(features);
  }, [visibleAssets, toMapCoord, map]);

  useEffect(() => {
    layerRef.current?.setStyle(buildAssetRadiusStyleFunction(selectedAssetUuid));
  }, [selectedAssetUuid, map]);

  return null;
}
