import type { BrowserPage as Page, Locator } from "vitest/browser";
import { commands } from "vitest/browser";
import { exactText, isVisible } from "./browserAssertions";
import { test, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import { readMapFeatures } from "./mapObserver";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

const POI_ACTION = "30000000-0000-4000-8000-000000009901";
const GRID_FILE = "explicit-locations-grid.json";
const LANDER_POINT = { lat: -3.4256273976012914, lng: -17.462978266484328 };
const POI_PARENT_POINT = { lat: -3.4251, lng: -17.463573 };
const LANDER_ELEVATION = 156;
const EARTH_RADIUS = 6378137;
const FIXTURE_ELEVATION = 120;
function projected(point: AEGISPoint): [number, number] {
  return [
    (point.lng * Math.PI * EARTH_RADIUS) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * EARTH_RADIUS,
  ];
}

async function prepareElevationAndGridFixture(
  mission: BrowserMission,
  requestHandlers: Record<string, BrowserRequestHandler>
): Promise<void> {
  const gridSize = 41;
  const gridStep = 0.00005;
  const grid = Array.from({ length: gridSize }, (_, row) =>
    Array.from({ length: gridSize }, (_, column) => ({
      id: row * gridSize + column,
      index: { row, col: column },
      coordinates: {
        lat: LANDER_POINT.lat + ((gridSize - 1) / 2 - row) * gridStep,
        lng: LANDER_POINT.lng + (column - (gridSize - 1) / 2) * gridStep,
      },
      name: `Cell-${row}-${column}`,
    }))
  );
  requestHandlers["/api/v1/grid"] = () =>
    Response.json({
      status: "success",
      data: {
        gridDefinition: {
          numRows: gridSize,
          numCols: gridSize,
          name: "Entity Location Contract Grid",
          fileName: GRID_FILE,
        },
        coordinates: grid,
      },
    });
  requestHandlers["/api/v1/terrain-profile"] = (_url, init) => {
    const input = JSON.parse(String(init.body)) as TerrainProfilePostData;
    return Response.json({
      status: "success",
      data: {
        elevationsMeters: input.pathSegmentDistances.map(() => [
          FIXTURE_ELEVATION,
          FIXTURE_ELEVATION,
        ]),
        terrainSlopesDegrees: input.pathSegmentDistances.map(() => [0, 0]),
      },
    });
  };
  await mission.change((doc) => {
    doc.demFilePath = "explicit-locations.dem";
    doc.demResolution = 4;
    doc.landerLocation = { ...LANDER_POINT };
    doc.landerElevationMeters = LANDER_ELEVATION;
    doc.initialZoom = 19;
    doc.projBoundsMinX = -180;
    doc.projBoundsMaxX = 180;
    doc.projBoundsMinY = -90;
    doc.projBoundsMaxY = 90;
    doc.gridRenderMode = "server-file";
    doc.serverFileGrid = {
      numRows: gridSize,
      numCols: gridSize,
      name: "Entity Location Contract Grid",
      fileName: GRID_FILE,
    };
    doc.usingLGRSCoordinates = false;
    doc.presets[mission.ids.presetA].mapGridControl.visible = true;
  });

  const poiParentElevation = FIXTURE_ELEVATION;
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].location = { ...LANDER_POINT };
    doc.stations[mission.ids.stationA].elevation = FIXTURE_ELEVATION;
    doc.pois[mission.ids.poiA].location = { ...POI_PARENT_POINT };
    doc.pois[mission.ids.poiA].elevation = poiParentElevation;
  });
}

async function mapPointAt(page: Page, dx: number, dy: number): Promise<AEGISPoint> {
  const bounds = page
    .getBySelector('[data-map-mode="editor"] .ol-viewport')
    .element()
    .getBoundingClientRect();
  return (({ x, y }: BrowserScreenPoint) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    const target = map.getTargetElement().getBoundingClientRect();
    const [east, north] = map.getCoordinateFromPixel([x - target.left, y - target.top]);
    return {
      lng: ((east / 6378137) * 180) / Math.PI,
      lat: ((2 * Math.atan(Math.exp(north / 6378137)) - Math.PI / 2) * 180) / Math.PI,
    };
  })({ x: bounds.x + bounds.width / 2 + dx, y: bounds.y + bounds.height / 2 + dy });
}

async function clickMapOffset(page: Page, dx: number, dy: number): Promise<AEGISPoint> {
  await expect
    .poll(() =>
      (() => {
        const map = window.__aegisMaps.find(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )?.map;
        return map?.getTargetElement()?.style.cursor;
      })()
    )
    .toBe("crosshair");
  const target = await mapPointAt(page, dx, dy);
  const bounds = page
    .getBySelector('[data-map-mode="editor"] .ol-viewport')
    .element()
    .getBoundingClientRect();
  await commands.mapPointer(
    "click",
    bounds.x + bounds.width / 2 + dx,
    bounds.y + bounds.height / 2 + dy
  );
  return target;
}

function distanceMeters(first: AEGISPoint, second: AEGISPoint, radius: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(second.lat - first.lat);
  const longitude = radians(second.lng - first.lng);
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function expectPointFeature(
  page: Page,
  uuid: string,
  point: AEGISPoint | null
): Promise<void> {
  await expect
    .poll(async () => {
      const feature = (await readMapFeatures()).find((item) => item.id === uuid);
      return feature?.geometryType === "Point" ? feature.coordinates : null;
    })
    .toEqual(point ? projected(point).map((coordinate) => expect.closeTo(coordinate, 4)) : null);
}

async function expectDisplay(
  container: Page | Locator,
  label: string,
  value: string
): Promise<void> {
  await expect
    .element(
      container
        .getByText(label, { exact: true })
        .getBySelector("../..")
        .getBySelector('[class*="displayFieldValue"]')
    )
    .toMatchTextContent(exactText(value));
}

async function displayValue(container: Page | Locator, label: string): Promise<string> {
  return container
    .getByText(label, { exact: true })
    .getBySelector("../..")
    .getBySelector('[class*="displayFieldValue"]')
    .element().textContent!;
}

async function actionRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.getBySelector('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function openActionLocation(page: Page, name: string) {
  const row = await actionRow(page, name);
  if (!isVisible(row.getByText("Location", { exact: true }))) {
    await row.getBySelector('svg[data-icon="caret-right"]').click();
  }
  await expect.element(row.getByText("Location", { exact: true })).toBeVisible();
  return row;
}

test.describe("POI and action point location lifecycles", () => {
  test("POI location create, move, field edit, cancel, clear, and reload preserve the point contract", async ({
    page,
    mission,
    requestHandlers,
  }) => {
    await prepareElevationAndGridFixture(mission, requestHandlers);
    await mission.change((doc) => {
      doc.pois[mission.ids.poiA].location = null;
      doc.pois[mission.ids.poiA].elevation = null;
    });
    const originalPoi = (await mission.read()).pois[mission.ids.poiA];
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();

    await page.getByLabelText("Create Location", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await page.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(originalPoi);
    await expectPointFeature(page, mission.ids.poiA, null);

    await page.getByLabelText("Create Location", { exact: true }).click();
    const createdPoint = await clickMapOffset(page, 155, -90);
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toEqual({
        lat: expect.closeTo(createdPoint.lat, 8),
        lng: expect.closeTo(createdPoint.lng, 8),
      });
    const createdPoi = (await mission.read()).pois[mission.ids.poiA];
    expect(createdPoi.elevation).toBe(FIXTURE_ELEVATION);
    expect(createdPoi).toMatchObject({ uuid: originalPoi.uuid, name: originalPoi.name });
    await expect
      .element(page.getBySelector('div[aria-label="LatitudePoi"]'))
      .toMatchTextContent(
        exactText(createdPoint.lat.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""))
      );
    await expect
      .element(page.getBySelector('div[aria-label="LongitudePoi"]'))
      .toMatchTextContent(
        exactText(createdPoint.lng.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""))
      );
    await expectDisplay(
      page,
      "Relative Elevation (m):",
      (createdPoi.elevation - (await mission.read()).landerElevationMeters).toFixed(0)
    );
    const createdGrid = await displayValue(page, "Grid Coords:");
    expect(createdGrid).toMatch(/^Cell-\d+-\d+$/);
    await expectPointFeature(page, mission.ids.poiA, createdPoi.location);

    const fieldDialog = page.getBySelector('div[aria-label="LongitudePoi"]');
    await fieldDialog.click();
    const lngDialog = page.getBySelector("dialog[open]");
    const editedLng = createdPoint.lng + 0.00008;
    await lngDialog.getByLabelText("LongitudePoi", { exact: true }).fill(editedLng.toString());
    await lngDialog.getByText("Save", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location.lng)
      .toBeCloseTo(editedLng, 8);
    let current = (await mission.read()).pois[mission.ids.poiA];
    expect(current.elevation).toBe(FIXTURE_ELEVATION);
    await expectDisplay(
      page,
      "Relative Elevation (m):",
      (current.elevation - (await mission.read()).landerElevationMeters).toFixed(0)
    );
    const fieldGrid = await displayValue(page, "Grid Coords:");
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabelText("Edit on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await page.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(current);
    await expectDisplay(page, "Grid Coords:", fieldGrid);
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabelText("Edit on Map", { exact: true }).click();
    const movedPoint = await clickMapOffset(page, -145, 105);
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toEqual({ lat: expect.closeTo(movedPoint.lat, 8), lng: expect.closeTo(movedPoint.lng, 8) });
    current = (await mission.read()).pois[mission.ids.poiA];
    expect(current.elevation).toBe(FIXTURE_ELEVATION);
    expect(current.name).toBe(originalPoi.name);
    await expectDisplay(
      page,
      "Relative Elevation (m):",
      (current.elevation - (await mission.read()).landerElevationMeters).toFixed(0)
    );
    const movedGrid = await displayValue(page, "Grid Coords:");
    expect(movedGrid).toMatch(/^Cell-\d+-\d+$/);
    expect(movedGrid).not.toBe(createdGrid);
    await expectPointFeature(page, mission.ids.poiA, current.location);
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(page.getBySelector('div[aria-label="LatitudePoi"]'))
      .toMatchTextContent(
        exactText(current.location.lat.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""))
      );
    await expectDisplay(page, "Grid Coords:", movedGrid);
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabelText("Clear Location", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toBeNull();
    const cleared = (await mission.read()).pois[mission.ids.poiA];
    expect(cleared.elevation).toBeNull();
    expect(cleared.name).toBe(originalPoi.name);
    expect(cleared.description).toBe(originalPoi.description);
    await expect.element(page.getByLabelText("Create Location", { exact: true })).toBeVisible();
    await expectDisplay(page, "Relative Elevation (m):", "Not set");
    await expectDisplay(page, "Grid Coords:", "Not set");
    await expectPointFeature(page, mission.ids.poiA, null);
    await mission.open();
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(cleared);
    await expectDisplay(page, "Relative Elevation (m):", "Not set");
    await expectDisplay(page, "Grid Coords:", "Not set");
    await expectPointFeature(page, mission.ids.poiA, null);
  });

  test("action location create, move, cancel, clear, and Set to Station keep parent identity and reload", async ({
    page,
    mission,
    requestHandlers,
  }) => {
    await prepareElevationAndGridFixture(mission, requestHandlers);
    await mission.change((doc) => {
      doc.actions[mission.ids.actionA].location = null;
      doc.actions[mission.ids.actionA].elevation = 73;
    });
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    let row = await openActionLocation(page, "Sample regolith");

    await row.getByLabelText("Create Location", { exact: true }).click();
    await expect.element(row.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await row.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(
      before.actions[mission.ids.actionA]
    );
    await expectPointFeature(page, mission.ids.actionA, null);

    await row.getByLabelText("Create Location", { exact: true }).click();
    const createdPoint = await clickMapOffset(page, 150, -75);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual({
        lat: expect.closeTo(createdPoint.lat, 8),
        lng: expect.closeTo(createdPoint.lng, 8),
      });
    let action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBe(FIXTURE_ELEVATION);
    expect(action.stationUuid).toBe(before.actions[mission.ids.actionA].stationUuid);
    expect(action.poiUuid).toBe(before.actions[mission.ids.actionA].poiUuid);
    await expectDisplay(
      row,
      "Elevation Relative to Station (m):",
      (action.elevation - before.stations[mission.ids.stationA].elevation).toFixed(0)
    );
    const createdGrid = await displayValue(row, "Grid Coords:");
    expect(createdGrid).toMatch(/^Cell-\d+-\d+$/);
    await expectDisplay(
      row,
      "Distance to Station (m):",
      distanceMeters(
        action.location,
        before.stations[mission.ids.stationA].location,
        before.planetRadius
      ).toFixed(0)
    );
    await expectPointFeature(page, mission.ids.actionA, action.location);

    await row.getByLabelText("Edit on Map", { exact: true }).click();
    await expect.element(row.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await row.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(action);
    await expectDisplay(row, "Grid Coords:", createdGrid);
    await expectPointFeature(page, mission.ids.actionA, action.location);

    await row.getByLabelText("Edit on Map", { exact: true }).click();
    const movedPoint = await clickMapOffset(page, -135, 95);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual({ lat: expect.closeTo(movedPoint.lat, 8), lng: expect.closeTo(movedPoint.lng, 8) });
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBe(FIXTURE_ELEVATION);
    expect(action.stationUuid).toBe(before.actions[mission.ids.actionA].stationUuid);
    expect(action.poiUuid).toBe(before.actions[mission.ids.actionA].poiUuid);
    await expectDisplay(
      row,
      "Elevation Relative to Station (m):",
      (action.elevation - before.stations[mission.ids.stationA].elevation).toFixed(0)
    );
    const movedGrid = await displayValue(row, "Grid Coords:");
    expect(movedGrid).toMatch(/^Cell-\d+-\d+$/);
    expect(movedGrid).not.toBe(createdGrid);
    await expectDisplay(
      row,
      "Distance to Station (m):",
      distanceMeters(
        action.location,
        before.stations[mission.ids.stationA].location,
        before.planetRadius
      ).toFixed(0)
    );
    await expectPointFeature(page, mission.ids.actionA, action.location);

    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    const stationGrid = await displayValue(page, "Grid Coords:");
    expect(stationGrid).toMatch(/^Cell-\d+-\d+$/);
    await selectPlanningStationActions(page, "Alpha station");
    row = await openActionLocation(page, "Sample regolith");
    await row.getByLabelText("Set to Station", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual(before.stations[mission.ids.stationA].location);
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action).toMatchObject({
      stationUuid: before.actions[mission.ids.actionA].stationUuid,
      poiUuid: before.actions[mission.ids.actionA].poiUuid,
      elevation: before.stations[mission.ids.stationA].elevation,
    });
    expect(action.elevation).toBe(FIXTURE_ELEVATION);
    await expectPointFeature(page, mission.ids.actionA, action.location);
    await expectDisplay(row, "Elevation Relative to Station (m):", "0");
    await expectDisplay(row, "Distance to Station (m):", "0");
    await expectDisplay(row, "Grid Coords:", stationGrid);

    await row.getByLabelText("Clear Location", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toBeNull();
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBeNull();
    expect(action.stationUuid).toBe(before.actions[mission.ids.actionA].stationUuid);
    expect(action.poiUuid).toBe(before.actions[mission.ids.actionA].poiUuid);
    await expectDisplay(row, "Elevation Relative to Station (m):", "Not set");
    await expectDisplay(row, "Grid Coords:", "Not set");
    await expect.element(row.getByLabelText("Create Location", { exact: true })).toBeVisible();
    await expectPointFeature(page, mission.ids.actionA, null);
    await mission.open();
    await selectPlanningStationActions(page, "Alpha station");
    row = await openActionLocation(page, "Sample regolith");
    expect((await mission.read()).actions[mission.ids.actionA]).toMatchObject({
      location: null,
      elevation: null,
      stationUuid: before.actions[mission.ids.actionA].stationUuid,
      poiUuid: before.actions[mission.ids.actionA].poiUuid,
    });
    await expectDisplay(row, "Elevation Relative to Station (m):", "Not set");
    await expectDisplay(row, "Grid Coords:", "Not set");
    await expectPointFeature(page, mission.ids.actionA, null);
  });

  test("a POI action uses Set to POI without changing its POI parent", async ({
    page,
    mission,
    requestHandlers,
  }) => {
    await prepareElevationAndGridFixture(mission, requestHandlers);
    await mission.change((doc) => {
      doc.actions[POI_ACTION] = seedAction({
        uuid: POI_ACTION,
        refUuid: "40000000-0000-4000-8000-000000009901",
        name: "Map the outcrop",
        poiUuid: mission.ids.poiA,
        location: null,
        elevation: 81,
      });
      doc.pois[mission.ids.poiA].actionOrderUuids = [POI_ACTION];
    });
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();
    const poiGrid = await displayValue(page, "Grid Coords:");
    expect(poiGrid).toMatch(/^Cell-\d+-\d+$/);
    expect(before.pois[mission.ids.poiA].elevation).toBe(FIXTURE_ELEVATION);
    await page.getByLabelText("actions_panel", { exact: true }).click();
    const row = await openActionLocation(page, "Map the outcrop");
    await row.getByLabelText("Set to POI", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[POI_ACTION].location)
      .toEqual(before.pois[mission.ids.poiA].location);
    const action = (await mission.read()).actions[POI_ACTION];
    expect(action).toMatchObject({
      poiUuid: mission.ids.poiA,
      stationUuid: null,
      elevation: before.pois[mission.ids.poiA].elevation,
    });
    await expectPointFeature(page, POI_ACTION, action.location);
    await expectDisplay(row, "Elevation Relative to POI (m):", "0");
    await expectDisplay(row, "Distance to POI (m):", "0");
    await expectDisplay(row, "Grid Coords:", poiGrid);
    await mission.open();
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("actions_panel", { exact: true }).click();
    await openActionLocation(page, "Map the outcrop");
    expect((await mission.read()).actions[POI_ACTION]).toEqual(action);
    await expectPointFeature(page, POI_ACTION, action.location);
  });
});
