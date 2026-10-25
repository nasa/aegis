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

async function editCircleField(
  page: Page,
  row: ReturnType<Page["locator"]>,
  label: string,
  value: string
) {
  await row.locator(`div[aria-label="${label}"]`).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("circle definitions create hidden controls, sort by radius, render saved geometry, and prune every reference", async ({
  page,
  context,
  mission,
}) => {
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openMissionCircles(page);

  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).circleDefinitions).length)
    .toBe(1);
  let circleIds = Object.keys((await mission.read()).circleDefinitions);
  const outerUuid = circleIds[0];
  let outerRow = page.getByLabel("circle-definition-item", { exact: true }).filter({
    hasText: "(Circle Definition Name)",
  });
  await editCircleField(page, outerRow, "Circle Definition Name", "350 m radius");
  outerRow = page
    .getByLabel("circle-definition-item", { exact: true })
    .filter({ hasText: "350 m radius" });
  await editCircleField(page, outerRow, "Circle Definition Range", "350");
  await expect
    .poll(async () => (await mission.read()).circleDefinitions[outerUuid].radius)
    .toBe(350);

  const invalid = page.locator("dialog[open]");
  await outerRow.locator('div[aria-label="Circle Definition Range"]').first().click();
  await invalid.getByLabel("Circle Definition Range", { exact: true }).fill("0");
  await expect(
    invalid.getByText("Should be greater than or equal to 1", { exact: true })
  ).toBeVisible();
  await expect(invalid.getByText("Save", { exact: true })).toBeDisabled();
  await expect(invalid.getByLabel("Circle Definition Range", { exact: true })).toBeVisible();
  await invalid.getByText("Cancel", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).circleDefinitions[outerUuid].radius)
    .toBe(350);

  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).circleDefinitions).length)
    .toBe(2);
  circleIds = Object.keys((await mission.read()).circleDefinitions);
  const innerUuid = circleIds.find((uuid) => uuid !== outerUuid)!;
  const innerRow = page.getByLabel("circle-definition-item", { exact: true }).filter({
    hasText: "(Circle Definition Name)",
  });
  await editCircleField(page, innerRow, "Circle Definition Name", "50 m radius");
  const namedInnerRow = page
    .getByLabel("circle-definition-item", { exact: true })
    .filter({ hasText: "50 m radius" });
  await editCircleField(page, namedInnerRow, "Circle Definition Range", "50");
  const orderedCircleRows = page.getByLabel("circle-definition-item", { exact: true });
  await expect(orderedCircleRows.nth(0)).toContainText("50 m radius");
  await expect(orderedCircleRows.nth(1)).toContainText("350 m radius");

  const arranged = await mission.read();
  for (const preset of Object.values(arranged.presets)) {
    expect(preset.mapCircleControls[outerUuid]).toMatchObject({ uuid: outerUuid, visible: false });
    expect(preset.mapCircleControls[innerUuid]).toMatchObject({ uuid: innerUuid, visible: false });
  }
  for (const station of Object.values(arranged.stations).filter(
    (candidate) => !candidate.isLanderXgress
  )) {
    expect(station.mapCircleControls[outerUuid]).toMatchObject({ uuid: outerUuid, visible: false });
    expect(station.mapCircleControls[innerUuid]).toMatchObject({ uuid: innerUuid, visible: false });
  }

  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("circle_panel", { exact: true }).click();
  await selectPlanningStation(peer, "Alpha station");
  await peer.getByLabel("circle_panel", { exact: true }).click();
  const outerControl = (client: Page) =>
    client.locator('[class*="sublayerItemContainer"]').filter({ hasText: "350 m radius" });
  await expect(outerControl(page)).toBeVisible();
  await expect(outerControl(page).locator('[class*="inVisible"]')).toBeVisible();
  await outerControl(page).locator('[class*="visibility"]').click();
  await expect
    .poll(
      async () =>
        (await mission.read()).stations[mission.ids.stationA].mapCircleControls[outerUuid].visible
    )
    .toBe(true);
  await expect.poll(() => radiusAroundStation(page, mission.ids.stationA)).toHaveLength(1);
  await expect
    .poll(() => radiusAroundStation(page, mission.ids.stationA).then((radii) => radii[0]))
    .toBeCloseTo(350, 1);
  await expect.poll(() => radiusAroundStation(peer, mission.ids.stationA)).toHaveLength(1);
  await expect
    .poll(() => radiusAroundStation(peer, mission.ids.stationA).then((radii) => radii[0]))
    .toBeCloseTo(350, 1);

  await openMissionCircles(page);
  const selectedOuterRow = page
    .getByLabel("circle-definition-item", { exact: true })
    .filter({ hasText: "350 m radius" });
  await selectedOuterRow.getByLabel("deleteButton", { exact: true }).click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).circleDefinitions, outerUuid))
    .toBe(false);
  const afterDelete = await mission.read();
  for (const preset of Object.values(afterDelete.presets)) {
    expect(preset.mapCircleControls).not.toHaveProperty(outerUuid);
    expect(preset.mapCircleControls[innerUuid]).toBeDefined();
  }
  for (const station of Object.values(afterDelete.stations)) {
    expect(station.mapCircleControls).not.toHaveProperty(outerUuid);
    if (!station.isLanderXgress) expect(station.mapCircleControls[innerUuid]).toBeDefined();
  }
  await expect.poll(() => radiusAroundStation(page, mission.ids.stationA)).toEqual([]);
  await expect.poll(() => radiusAroundStation(peer, mission.ids.stationA)).toEqual([]);
  await mission.open(page);
  await expect
    .poll(async () => Object.keys((await mission.read()).circleDefinitions))
    .toEqual([innerUuid]);
  await openMissionCircles(page);
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(1);
  await expect(
    page.getByLabel("circle-definition-item", { exact: true }).filter({ hasText: "50 m radius" })
  ).toBeVisible();
});
