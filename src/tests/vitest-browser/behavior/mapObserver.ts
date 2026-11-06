import type VectorLayer from "ol/layer/Vector";
import type SimpleGeometry from "ol/geom/SimpleGeometry";

/** Observe real OpenLayers instances through the same development event as E2E tests. */
export function observeMissionMaps(): () => void {
  window.__aegisMaps = [];
  const onReady = (event: Event) => {
    window.__aegisMaps.push((event as CustomEvent).detail);
  };
  document.addEventListener("aegis:map-ready", onReady);
  return () => {
    document.removeEventListener("aegis:map-ready", onReady);
    window.__aegisMaps = [];
  };
}

export function readMapFeatures(mode: MapMode = "editor"): PlaywrightMapFeature[] {
  const observed = window.__aegisMaps?.find(
    (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
  );
  if (!observed) return [];
  return observed.map
    .getLayers()
    .getArray()
    .flatMap((layer) => {
      const source = (layer as VectorLayer).getSource?.();
      if (!source || !("getFeatures" in source)) return [];
      return source.getFeatures().map((feature) => {
        const geometry = feature.getGeometry() as SimpleGeometry | undefined;
        return {
          id: String(feature.getId() ?? ""),
          name: String(feature.get("name") ?? ""),
          labelType: feature.get("labelType") ?? null,
          geometryType: geometry?.getType() ?? null,
          coordinates: geometry?.getCoordinates?.() ?? null,
          layerZIndex: layer.getZIndex() ?? 0,
          visible: layer.getVisible() && layer.getOpacity() > 0,
        };
      });
    });
}
