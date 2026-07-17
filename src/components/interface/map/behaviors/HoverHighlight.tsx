/**
 * HoverHighlight — behavior component for hover highlight on the OL map.
 *
 * Draws a white dashed circle for hovered markers, or a white overlay polyline
 * for hovered traverses. Reacts to Redux hover state dispatched from the
 * timeline, left panel, or map pointermove events in other behaviors.
 *
 * Editor only. Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle, Style, Stroke } from "ol/style";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { Z_INDEX } from "../utils/zIndex";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const hoverCircleStyle = new Style({
  image: new Circle({
    radius: 25,
    stroke: new Stroke({ color: "#ffffff", width: 1, lineDash: [5, 5] }),
  }),
});

const hoverPolylineStyle = new Style({
  stroke: new Stroke({ color: "#ffffff", width: 4 }),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HoverHighlight(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();

  const mapHoverItemUuid = useAppSelector((s) => s.hover.mapItemUuid, refEqual);
  const mapHoverItemType = useAppSelector((s) => s.hover.mapItemType, refEqual);

  // POS markers are DOM overlays (not vector features), so resolve their
  // location from the selected REX's pos entries for the hover circle.
  const selectedRexUuid = useAppSelector((s) => s.rex?.selectedRexUuid ?? null, refEqual);
  const posEntries = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posEntries ?? []) : [];
  }, deepEqual);

  const sourceRef = useRef(new VectorSource());
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const featureRef = useRef<Feature | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    if (mode !== "editor") return;

    const layer = new VectorLayer({
      source: sourceRef.current,
      zIndex: Z_INDEX.HOVER,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, mode]);

  // --- Draw highlight based on hover state ---
  useEffect(() => {
    if (mode !== "editor") return;

    const source = sourceRef.current;

    if (!mapHoverItemUuid) return;

    // Draw the hover circle straight from the pos entry's location — independent
    // of whether its marker layer is currently mounted/visible.
    if (mapHoverItemType === "posEntry") {
      const posEntry = (posEntries as PosEntry[]).find((pe) => pe.uuid === mapHoverItemUuid);
      if (posEntry?.location?.lat != null && posEntry.location.lng != null) {
        const highlight = new Feature(new Point(toMapCoord(posEntry.location)));
        highlight.setStyle(hoverCircleStyle);
        highlight.setId(`hover-${mapHoverItemUuid}`);
        source.addFeature(highlight);
        featureRef.current = highlight;
      }
      return () => {
        if (featureRef.current) {
          source.removeFeature(featureRef.current);
          featureRef.current = null;
        }
      };
    }

    // Find the hovered feature across all layers
    let targetFeature: Feature | null = null;
    map.getLayers().forEach((layer) => {
      if (targetFeature) return;
      const layerSource = (layer as { getSource?: () => VectorSource }).getSource?.();
      if (layerSource?.getFeatureById) {
        const f = layerSource.getFeatureById(mapHoverItemUuid);
        if (f) targetFeature = f as Feature;
      }
    });

    if (!targetFeature) return;

    const geometry = targetFeature.getGeometry();

    if (geometry instanceof Point) {
      const highlight = new Feature(new Point(geometry.getCoordinates()));
      highlight.setStyle(hoverCircleStyle);
      highlight.setId(`hover-${mapHoverItemUuid}`);
      source.addFeature(highlight);
      featureRef.current = highlight;
    } else if (geometry instanceof LineString) {
      const highlight = new Feature(geometry.clone());
      highlight.setStyle(hoverPolylineStyle);
      highlight.setId(`hover-${mapHoverItemUuid}`);
      source.addFeature(highlight);
      featureRef.current = highlight;
    }

    return () => {
      if (featureRef.current) {
        source.removeFeature(featureRef.current);
        featureRef.current = null;
      }
    };
  }, [map, mode, mapHoverItemUuid, mapHoverItemType, posEntries, toMapCoord]);

  return null;
}
