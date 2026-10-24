import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type SimpleGeometry from "ol/geom/SimpleGeometry";

/** Observe the real map created by the development server, before navigating. */
export async function installMapObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__aegisMaps = [];
    document.addEventListener("aegis:map-ready", (event) => {
      const { map, mode } = (event as CustomEvent).detail;
      window.__aegisMaps.push({ map, mode });
    });
  });
}

/** Read actual layer features; expectations are supplied independently by tests. */
export async function readMapFeatures(
  page: Page,
  mode: MapMode = "editor"
): Promise<PlaywrightMapFeature[]> {
  return page.evaluate((mode) => {
    const observed = window.__aegisMaps?.find(
      (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
    );
    if (!window.__aegisMaps) throw new Error("Install the map observer before navigation.");
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
  }, mode);
}

export async function expectMapLabel(
  page: Page,
  text: string,
  mode: MapMode = "editor"
): Promise<void> {
  await expect
    .poll(async () =>
      (await readMapFeatures(page, mode))
        .filter((feature) => feature.labelType && feature.visible)
        .map((feature) => feature.name)
    )
    .toContain(text);
}

/** Pixel of a real rendered feature, for user-driven map gestures. */
export async function mapFeaturePixel(
  page: Page,
  id: string,
  mode: MapMode = "editor",
  vertexIndex: number = 0
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ id, mode, vertexIndex }) => {
      const map = window.__aegisMaps?.find(
        (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) throw new Error(`No observed ${mode} map`);
      for (const layer of map.getLayers().getArray()) {
        const source = (layer as VectorLayer).getSource?.();
        if (!source || !("getFeatureById" in source)) continue;
        const feature = source.getFeatureById(id);
        if (!feature) continue;
        const geometry = feature.getGeometry() as SimpleGeometry;
        const coordinates = geometry.getCoordinates();
        const coordinate =
          geometry.getType() === "LineString" ? coordinates[vertexIndex] : coordinates;
        const pixel = map.getPixelFromCoordinate(coordinate);
        const bounds = map.getTargetElement().getBoundingClientRect();
        return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
      }
      throw new Error(`Feature ${id} is absent from ${mode} map`);
    },
    { id, mode, vertexIndex }
  );
}
