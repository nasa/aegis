import type { BrowserPage as Page } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { expect } from "./missionHarness";
import { mapFeaturePixel } from "./mapInteractions";

export async function openMeasurements(page: Page): Promise<void> {
  await page.getBySelector('[data-tooltip-content="Measurements"]').click();
  await expect
    .element(page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]'))
    .toBeVisible();
}

export function measurements(): BrowserMeasurementState[] {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  if (!map) return [];
  return map
    .getLayers()
    .getArray()
    .flatMap((layer) => {
      const source = (layer as VectorLayer).getSource?.();
      if (!source || !("getFeatures" in source)) return [];
      return source
        .getFeatures()
        .filter((feature) => feature.get("mapItemType") === "measurement")
        .map((feature) => ({
          id: String(feature.getId()),
          coordinates: (feature.getGeometry() as LineString).getCoordinates(),
          segmentDistances: (feature.get("segmentDistances") as number[]) ?? [],
          segmentBearings: (feature.get("segmentBearings") as number[]) ?? [],
        }));
    });
}

export function featurePixel(id: string, vertexIndex?: number): BrowserScreenPoint {
  if (vertexIndex != null) return mapFeaturePixel(id, "editor", vertexIndex);
  const first = mapFeaturePixel(id, "editor", 0);
  const last = mapFeaturePixel(id, "editor", 1);
  return { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
}

export async function editMeasurement(page: Page): Promise<void> {
  await page.getByLabelText("Edit Path on Map", { exact: true }).click();
  await expect.element(page.getByLabelText("Finished", { exact: true })).toBeVisible();
}
