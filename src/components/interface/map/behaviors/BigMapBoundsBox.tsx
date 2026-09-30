/**
 * BigMapBoundsBox — minimap behavior that draws a rectangle showing the
 * dashboard (big map) viewport bounds.
 *
 * Reads the big map extent from DashboardBoundsProvider and draws a white
 * dashed rectangle on the minimap.
 *
 * Minimap only. Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import { fromExtent } from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Stroke } from "ol/style";

import { useMapContext } from "../MapProvider";
import { useDashboardBoundsContext } from "../DashboardBoundsProvider";
import { Z_INDEX } from "../utils/zIndex";

const boundsBoxStyle = new Style({
  stroke: new Stroke({ color: "#ffffff", width: 2 }),
});

export function BigMapBoundsBox(): null {
  const { map, mode } = useMapContext();
  const { bigMapExtent } = useDashboardBoundsContext();

  const sourceRef = useRef(new VectorSource());
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    if (mode !== "minimap") return;

    const layer = new VectorLayer({
      source: sourceRef.current,
      style: boundsBoxStyle,
      zIndex: Z_INDEX.SELECTION,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, mode]);

  // --- Update bounds rectangle ---
  useEffect(() => {
    if (mode !== "minimap") return;

    sourceRef.current.clear();
    if (!bigMapExtent) return;

    const feature = new Feature(fromExtent(bigMapExtent));
    feature.setId("big-map-bounds");
    sourceRef.current.addFeature(feature);
  }, [mode, bigMapExtent]);

  return null;
}
