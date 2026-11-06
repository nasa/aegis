import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import type Point from "ol/geom/Point";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver } from "../fixtures/mapAssertions";
import { enablePlanningEditMode, selectPlanningStation } from "./planningHelpers";

async function radiusAroundStation(page: Page, stationUuid: string): Promise<number[]> {
  return page.evaluate((stationUuid) => {
    const map = window.__aegisMaps?.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return [];
    const layers = map.getLayers().getArray();
    const markerLayer = layers.find((layer) => layer.getZIndex() === 14) as VectorLayer | undefined;
    const center = markerLayer?.getSource()?.getFeatureById(stationUuid)?.getGeometry() as
      Point | undefined;
    if (!center) return [];
    const point = center.getCoordinates();
    return layers
      .filter((layer) => layer.getZIndex() === 6 && layer.getVisible())
      .flatMap((layer) => {
        const source = (layer as VectorLayer).getSource();
        return (source?.getFeatures() ?? []).flatMap((feature) => {
          const geometry = feature.getGeometry() as LineString;
          if (geometry.getType() !== "LineString") return [];
          const coordinates = geometry.getCoordinates();
          const distances = coordinates.map((coordinate) =>
            Math.hypot(coordinate[0] - point[0], coordinate[1] - point[1])
          );
          return [distances.reduce((sum, distance) => sum + distance, 0) / distances.length];
        });
      });
  }, stationUuid);
}

async function openMissionCircles(page: Page): Promise<void> {
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "Proximity Circle Definitions"
  );
}

test("station circle visibility and definition deletion reach peer geometry and persist after reload", async ({
  page,
  context,
  mission,
}) => {
  const uuid = "91000000-0000-4000-8000-000000000080";
  await mission.change((doc) => {
    doc.circleDefinitions[uuid] = { name: "350 m radius", radius: 350 };
    const control = {
      uuid,
      visible: false,
      style: {
        opacity: 1,
        contrast: 1,
        brightness: 1,
        saturation: 1,
        blendMode: "normal" as const,
        color: "#ffffff",
        weight: 2,
        fillColor: "none",
        fillOpacity: 0,
        isDashed: false,
        dashLen: 10,
        altColor: "#ffffff",
        altOpacity: 1,
        showLabels: true,
      },
    };
    for (const preset of Object.values(doc.presets))
      preset.mapCircleControls[uuid] = structuredClone(control);
    for (const station of Object.values(doc.stations))
      if (!station.isLanderXgress) station.mapCircleControls[uuid] = structuredClone(control);
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("circle_panel", { exact: true }).click();
  await selectPlanningStation(peer, "Alpha station");
  await peer.getByLabel("circle_panel", { exact: true }).click();
  await page
    .locator('[class*="sublayerItemContainer"]')
    .filter({ hasText: "350 m radius" })
    .locator('[class*="visibility"]')
    .click();
  await expect
    .poll(() => radiusAroundStation(peer, mission.ids.stationA).then((radii) => radii[0]))
    .toBeCloseTo(350, 1);
  await openMissionCircles(page);
  await page
    .getByLabel("circle-definition-item", { exact: true })
    .getByLabel("deleteButton", { exact: true })
    .click();
  await expect.poll(() => radiusAroundStation(peer, mission.ids.stationA)).toEqual([]);
  await peer.reload();
  await selectPlanningStation(peer, "Alpha station");
  await peer.getByLabel("circle_panel", { exact: true }).click();
  await expect(peer.getByText("350 m radius", { exact: true })).toHaveCount(0);
  const after = await mission.read();
  expect(after.circleDefinitions[uuid]).toBeUndefined();
  for (const station of Object.values(after.stations))
    expect(station.mapCircleControls[uuid]).toBeUndefined();
  for (const preset of Object.values(after.presets))
    expect(preset.mapCircleControls[uuid]).toBeUndefined();
});
