import { test, expect } from "../fixtures/behavioralTest";
import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Point from "ol/geom/Point";
import { mapFeaturePixel, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

const ids = {
  stationOnlyAction: "30000000-0000-4000-8000-000000009302",
  poiOnlyAction: "30000000-0000-4000-8000-000000009303",
};

async function selectionHighlight(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const feature = map
      ?.getLayers()
      .getArray()
      .flatMap((layer) => (layer as VectorLayer<VectorSource>).getSource()?.getFeatures() ?? [])
      .find((item) => item.getId() === "selection-highlight");
    const geometry = feature?.getGeometry();
    return geometry?.getType() === "Point" ? (geometry as Point).getCoordinates() : null;
  });
}

async function mapView(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    return { center: map.getView().getCenter(), zoom: map.getView().getZoom() };
  });
}

async function expectedCoord(page: Page, point: AEGISPoint) {
  return page.evaluate((location) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    return map.getView().getProjection().getCode() === "EPSG:3857"
      ? [
          (location.lng * 6378137 * Math.PI) / 180,
          6378137 * Math.log(Math.tan((Math.PI * (90 + location.lat)) / 360)),
        ]
      : [location.lng, location.lat];
  }, point);
}

async function ensureActionMarkers(page: Page, expectedIds: string[]): Promise<void> {
  await page.getByTestId("map-menu-launcher").click();
  const panel = page.getByTestId("map-menu-floating-panel");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const visibleIds = (await readMapFeatures(page)).map((feature) => feature.id);
    if (expectedIds.every((id) => visibleIds.includes(id))) break;
    await panel.getByText("Actions", { exact: true }).locator("..").locator("svg").click();
    await page.waitForTimeout(250);
  }
  await expect
    .poll(async () => {
      const ids = (await readMapFeatures(page)).map((feature) => feature.id);
      return expectedIds.every((id) => ids.includes(id));
    })
    .toBe(true);
  await panel.locator('svg[data-icon="xmark"]').click();
}

test("selection context wins over stale selections, while POI station traverse action and position hover stays transient", async ({
  page,
  mission,
}) => {
  const originalAction = (await mission.read()).actions[mission.ids.actionA];
  await mission.change((doc) => {
    doc.actions[ids.stationOnlyAction] = {
      ...originalAction,
      uuid: ids.stationOnlyAction,
      refUuid: "40000000-0000-4000-8000-000000009302",
      name: "Station-only action",
      poiUuid: null,
      stationUuid: mission.ids.stationA,
      location: { lat: 0.0012, lng: 0.0013 },
    };
    doc.stations[mission.ids.stationA].actionOrderUuids.push(ids.stationOnlyAction);
    doc.actions[ids.poiOnlyAction] = {
      ...originalAction,
      uuid: ids.poiOnlyAction,
      refUuid: "40000000-0000-4000-8000-000000009303",
      name: "POI-only action",
      poiUuid: mission.ids.poiA,
      stationUuid: null,
      location: { lat: 0.0018, lng: 0.0017 },
    };
    doc.pois[mission.ids.poiA].actionOrderUuids.push(ids.poiOnlyAction);
  });
  await mission.open(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("actions_panel", { exact: true }).click();
  await ensureActionMarkers(page, [ids.stationOnlyAction]);
  const stationHighlight = await expectedCoord(page, { lat: 0.001, lng: 0.001 });
  await expect
    .poll(() => selectionHighlight(page))
    .toEqual([expect.closeTo(stationHighlight[0], 6), expect.closeTo(stationHighlight[1], 6)]);
  const stationActions = async () =>
    (await readMapFeatures(page))
      .filter((feature) => feature.geometryType === "Point")
      .map((f) => f.id);
  await expect.poll(stationActions).toContain(ids.stationOnlyAction);
  await expect.poll(stationActions).not.toContain(ids.poiOnlyAction);

  // The POI selection must win over the stale station UUID when its section is active.
  await selectPlanningPoi(page, "Reference POI");
  const poiHighlight = await expectedCoord(page, { lat: 0.0015, lng: 0.002 });
  const closePoiHighlight = [
    expect.closeTo(poiHighlight[0], 6),
    expect.closeTo(poiHighlight[1], 6),
  ];
  await expect.poll(() => selectionHighlight(page)).toEqual(closePoiHighlight);
  await ensureActionMarkers(page, [ids.poiOnlyAction]);
  await expect.poll(stationActions).toContain(ids.poiOnlyAction);
  await expect.poll(stationActions).not.toContain(ids.stationOnlyAction);

  const persistedBeforeHover = await mission.read();
  const poiPixel = await mapFeaturePixel(page, mission.ids.poiA);
  await page.mouse.move(poiPixel.x, poiPixel.y);
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).some((feature) => feature.id === `hover-${mission.ids.poiA}`)
    )
    .toBe(true);
  await expect.poll(() => selectionHighlight(page)).toEqual(closePoiHighlight);
  const viewportBounds = await page.locator('[data-map-mode="editor"] .ol-viewport').boundingBox();
  await page.mouse.move(
    viewportBounds.x + viewportBounds.width / 2 + 170,
    viewportBounds.y + viewportBounds.height / 2 + 130
  );
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).some((feature) => feature.id === `hover-${mission.ids.poiA}`)
    )
    .toBe(false);
  expect(await mission.read()).toEqual(persistedBeforeHover);

  await enablePlanningEditMode(page);
  await selectPlanningEva(page, "Survey Alpha");
  await expect.poll(() => selectionHighlight(page)).toBeNull();
  await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
  await expect(page.getByLabel("Edit Path on Map", { exact: true })).toBeVisible();
  const traverseFeature = async () =>
    (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.traverseA);
  await expect.poll(async () => (await traverseFeature())?.geometryType).toBe("LineString");
  await expect.poll(() => selectionHighlight(page)).toBeNull();
  const traverseStart = await mapFeaturePixel(page, mission.ids.traverseA, "editor", 0);
  const traverseInterior = await mapFeaturePixel(page, mission.ids.traverseA, "editor", 1);
  await page.mouse.move(
    (traverseStart.x + traverseInterior.x) / 2,
    (traverseStart.y + traverseInterior.y) / 2
  );
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).some(
        (feature) => feature.id === `hover-${mission.ids.traverseA}`
      )
    )
    .toBe(true);

  await selectPlanningStation(page, "Alpha station");
  const actionPixel = await mapFeaturePixel(page, ids.stationOnlyAction);
  await page.mouse.move(actionPixel.x, actionPixel.y);
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).some(
        (feature) => feature.id === `hover-${ids.stationOnlyAction}`
      )
    )
    .toBe(true);
  expect(await mission.read()).toEqual(persistedBeforeHover);
});

test("selection pans only to off-screen targets, preserves zoom, and geometry edits keep their target", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.pois[mission.ids.poiA].location = { lat: 0.045, lng: 0.045 };
  });
  await mission.open(page);
  const initial = await mapView(page);
  const initialTarget = await expectedCoord(page, { lat: 0.001, lng: 0.001 });
  await selectPlanningStation(page, "Alpha station");
  const afterVisible = await mapView(page);
  expect(afterVisible.center).toEqual(initial.center);
  expect(afterVisible.zoom).toBe(initial.zoom);
  await expect
    .poll(() => selectionHighlight(page))
    .toEqual([expect.closeTo(initialTarget[0], 6), expect.closeTo(initialTarget[1], 6)]);

  await selectPlanningPoi(page, "Reference POI");
  const farTarget = await expectedCoord(page, { lat: 0.045, lng: 0.045 });
  await expect
    .poll(async () => (await mapView(page)).center)
    .toEqual([expect.closeTo(farTarget[0], 6), expect.closeTo(farTarget[1], 6)]);
  expect((await mapView(page)).zoom).toBe(initial.zoom);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__aegisMaps?.some(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )
      )
    )
    .toBe(true);
  const reloaded = await mapView(page);
  expect(reloaded.center).toEqual(initial.center);
  expect(reloaded.zoom).toBe(initial.zoom);

  await enablePlanningEditMode(page);
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Alpha");
  await page
    .getByLabel("evaList-item")
    .filter({ hasText: "Survey Alpha" })
    .getByText("Alpha to Bravo", { exact: true })
    .click();
  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
  const original = (await mission.read()).traverses[mission.ids.traverseA].path;
  const viewAtEditStart = await mapView(page);
  const point = await mapFeaturePixel(page, mission.ids.traverseA, "editor", 1);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 45, point.y - 35, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .not.toEqual(original);
  await page.getByLabel("Cancel", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .toEqual(original);
  await expect(page.getByLabel("Edit Path on Map", { exact: true })).toBeVisible();
  expect((await mapView(page)).zoom).toBe(viewAtEditStart.zoom);

  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
  await selectPlanningPoi(page, "Reference POI");
  await expect(page.getByLabel("Edit Path on Map", { exact: true })).toHaveCount(0);
  const selectedPoiTarget = await expectedCoord(page, { lat: 0.045, lng: 0.045 });
  await expect
    .poll(async () => (await mapView(page)).center)
    .toEqual([expect.closeTo(selectedPoiTarget[0], 6), expect.closeTo(selectedPoiTarget[1], 6)]);
  expect((await mapView(page)).zoom).toBe(viewAtEditStart.zoom);
  expect((await mission.read()).traverses[mission.ids.traverseA].path).toEqual(original);
});

test.describe("execution position selection", () => {
  test.use({ scenario: "execution" });

  test("selecting and hovering a crew position highlights the resolved position without changing mission data", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    const before = await mission.read();
    const menu = page.getByTestId("rex-map-menu");
    await menu.getByText("All Positions", { exact: true }).click();
    const row = menu.locator("table").last().getByRole("row").filter({ hasText: "00:02:00" });
    await expect(row).toBeVisible();
    await row.hover();
    await expect
      .poll(async () =>
        (await readMapFeatures(page)).some((feature) => feature.id === `hover-${mission.ids.posB}`)
      )
      .toBe(true);
    await row.click();
    const position = await expectedCoord(page, { lat: 0.001, lng: 0.0025 });
    await expect
      .poll(() => selectionHighlight(page))
      .toEqual([expect.closeTo(position[0], 6), expect.closeTo(position[1], 6)]);
    expect(await mission.read()).toEqual(before);
  });
});
