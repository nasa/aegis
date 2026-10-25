import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeArrayBuffer } from "geotiff";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
import { readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

const POI_ACTION = "30000000-0000-4000-8000-000000009901";
const DEM_FILE = "entity-locations-synthetic.tif";
const GRID_FILE = "entity-locations-grid.json";
const LANDER_POINT = { lat: -3.4256273976012914, lng: -17.462978266484328 };
const POI_PARENT_POINT = { lat: -3.4251, lng: -17.463573 };
const LANDER_ELEVATION = 156;
const RASTER = { width: 256, height: 256, pixelSize: 4, center: 128, noData: 0 };
const EARTH_RADIUS = 6_378_137;

function projected(point: AEGISPoint): [number, number] {
  return [
    (point.lng * Math.PI * EARTH_RADIUS) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * EARTH_RADIUS,
  ];
}

async function createSyntheticDem(directory: string): Promise<void> {
  const [landerX, landerY] = projected(LANDER_POINT);
  const originX = landerX - (RASTER.center + 0.5) * RASTER.pixelSize;
  const originY = landerY + (RASTER.center + 0.5) * RASTER.pixelSize;
  const pixels = new Uint8Array(RASTER.width * RASTER.height);
  for (let row = 0; row < RASTER.height; row++) {
    for (let column = 0; column < RASTER.width; column++) {
      pixels[row * RASTER.width + column] = 100 + ((row + column) % 100);
    }
  }
  const bytes = await writeArrayBuffer(pixels, {
    width: RASTER.width,
    height: RASTER.height,
    BitsPerSample: [8],
    SampleFormat: [1],
    GDAL_NODATA: String(RASTER.noData),
    ProjectedCSTypeGeoKey: 3857,
    GeographicTypeGeoKey: 4326,
    ModelPixelScale: [RASTER.pixelSize, RASTER.pixelSize, 0],
    ModelTiepoint: [0, 0, 0, originX, originY, 0],
  });
  await writeFile(path.join(directory, DEM_FILE), Buffer.from(bytes));
}

async function prepareElevationAndGridFixture(
  mission: BehavioralMission,
  request: APIRequestContext
): Promise<void> {
  expect(process.env.STATIC_DIR, "The local API static directory must be configured").toBeTruthy();
  const missionDirectory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  const dataDirectory = path.join(missionDirectory, "Data");
  await mkdir(dataDirectory, { recursive: true });
  await createSyntheticDem(missionDirectory);
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
  await writeFile(path.join(dataDirectory, GRID_FILE), JSON.stringify(grid), "utf8");

  await mission.change((doc) => {
    doc.demFilePath = DEM_FILE;
    doc.demResolution = RASTER.pixelSize;
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

  const poiParentElevation = await sampleElevation(request, mission.id, POI_PARENT_POINT);
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].location = { ...LANDER_POINT };
    doc.stations[mission.ids.stationA].elevation = LANDER_ELEVATION;
    doc.pois[mission.ids.poiA].location = { ...POI_PARENT_POINT };
    doc.pois[mission.ids.poiA].elevation = poiParentElevation;
  });
  const gridResponse = await request.get(`/api/v1/grid?missionId=${mission.id}&getFullGrids=true`);
  expect(gridResponse.ok(), "The mission serves its deterministic grid fixture").toBe(true);
  const gridBody = await gridResponse.json();
  expect(gridBody.data.gridDefinition).toMatchObject({
    name: "Entity Location Contract Grid",
    numRows: gridSize,
    numCols: gridSize,
    fileName: GRID_FILE,
  });
  expect(gridBody.data.coordinates).toEqual(grid);
}

async function sampleElevation(
  request: APIRequestContext,
  missionId: number,
  point: AEGISPoint
): Promise<number> {
  const response = await request.post(`/api/v1/terrain-profile?missionId=${missionId}`, {
    data: { path: [point, point], pathSegmentDistances: [0], getElevationOnly: true },
  });
  const responseText = await response.text();
  expect(
    response.ok(),
    `The deterministic DEM samples ${JSON.stringify(point)}: ${response.status()} ${responseText}`
  ).toBe(true);
  const body = JSON.parse(responseText);
  const elevation = body.data.elevationsMeters[0][0] as number;
  expect(Number.isFinite(elevation)).toBe(true);
  return elevation;
}

test.afterEach(async ({ mission }) => {
  if (!process.env.STATIC_DIR) return;
  const missionDirectory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await Promise.all([
    rm(path.join(missionDirectory, DEM_FILE), { force: true }),
    rm(path.join(missionDirectory, "Data", GRID_FILE), { force: true }),
  ]);
});

async function mapPointAt(page: Page, dx: number, dy: number): Promise<AEGISPoint> {
  const bounds = await page.locator('[data-map-mode="editor"] .ol-viewport').boundingBox();
  return page.evaluate(
    ({ x, y }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      ).map;
      const target = map.getTargetElement().getBoundingClientRect();
      const [east, north] = map.getCoordinateFromPixel([x - target.left, y - target.top]);
      return {
        lng: ((east / 6378137) * 180) / Math.PI,
        lat: ((2 * Math.atan(Math.exp(north / 6378137)) - Math.PI / 2) * 180) / Math.PI,
      };
    },
    { x: bounds.x + bounds.width / 2 + dx, y: bounds.y + bounds.height / 2 + dy }
  );
}

async function clickMapOffset(page: Page, dx: number, dy: number): Promise<AEGISPoint> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = window.__aegisMaps.find(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )?.map;
        return map?.getTargetElement()?.style.cursor;
      })
    )
    .toBe("crosshair");
  const target = await mapPointAt(page, dx, dy);
  const bounds = await page.locator('[data-map-mode="editor"] .ol-viewport').boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy);
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
      const feature = (await readMapFeatures(page)).find((item) => item.id === uuid);
      return feature?.geometryType === "Point" ? feature.coordinates : null;
    })
    .toEqual(point ? projected(point).map((coordinate) => expect.closeTo(coordinate, 4)) : null);
}

async function expectDisplay(
  container: Page | Locator,
  label: string,
  value: string
): Promise<void> {
  await expect(
    container
      .getByText(label, { exact: true })
      .locator("../..")
      .locator('[class*="displayFieldValue"]')
  ).toHaveText(value);
}

async function displayValue(container: Page | Locator, label: string): Promise<string> {
  return container
    .getByText(label, { exact: true })
    .locator("../..")
    .locator('[class*="displayFieldValue"]')
    .innerText();
}

async function actionRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function openActionLocation(page: Page, name: string) {
  const row = await actionRow(page, name);
  if (!(await row.getByText("Location", { exact: true }).isVisible())) {
    await row.locator('svg[data-icon="caret-right"]').click();
  }
  await expect(row.getByText("Location", { exact: true })).toBeVisible();
  return row;
}

test.describe("POI and action point location lifecycles", () => {
  test("POI location create, move, field edit, cancel, clear, and reload preserve the point contract", async ({
    page,
    mission,
    request,
  }) => {
    await prepareElevationAndGridFixture(mission, request);
    await mission.change((doc) => {
      doc.pois[mission.ids.poiA].location = null;
      doc.pois[mission.ids.poiA].elevation = null;
    });
    const originalPoi = (await mission.read()).pois[mission.ids.poiA];
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();

    await page.getByLabel("Create Location", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await page.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(originalPoi);
    await expectPointFeature(page, mission.ids.poiA, null);

    await page.getByLabel("Create Location", { exact: true }).click();
    const createdPoint = await clickMapOffset(page, 155, -90);
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toEqual({
        lat: expect.closeTo(createdPoint.lat, 8),
        lng: expect.closeTo(createdPoint.lng, 8),
      });
    const createdPoi = (await mission.read()).pois[mission.ids.poiA];
    expect(createdPoi.elevation).toBe(
      await sampleElevation(request, mission.id, createdPoi.location)
    );
    expect(createdPoi).toMatchObject({ uuid: originalPoi.uuid, name: originalPoi.name });
    await expect(page.locator('div[aria-label="LatitudePoi"]')).toHaveText(
      createdPoint.lat.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    );
    await expect(page.locator('div[aria-label="LongitudePoi"]')).toHaveText(
      createdPoint.lng.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    );
    await expectDisplay(
      page,
      "Relative Elevation (m):",
      (createdPoi.elevation - (await mission.read()).landerElevationMeters).toFixed(0)
    );
    const createdGrid = await displayValue(page, "Grid Coords:");
    expect(createdGrid).toMatch(/^Cell-\d+-\d+$/);
    await expectPointFeature(page, mission.ids.poiA, createdPoi.location);

    const fieldDialog = page.locator('div[aria-label="LongitudePoi"]');
    await fieldDialog.click();
    const lngDialog = page.locator("dialog[open]");
    const editedLng = createdPoint.lng + 0.00008;
    await lngDialog.getByLabel("LongitudePoi", { exact: true }).fill(editedLng.toString());
    await lngDialog.getByText("Save", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location.lng)
      .toBeCloseTo(editedLng, 8);
    let current = (await mission.read()).pois[mission.ids.poiA];
    expect(current.elevation).toBe(await sampleElevation(request, mission.id, current.location));
    await expectDisplay(
      page,
      "Relative Elevation (m):",
      (current.elevation - (await mission.read()).landerElevationMeters).toFixed(0)
    );
    const fieldGrid = await displayValue(page, "Grid Coords:");
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabel("Edit on Map", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await page.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(current);
    await expectDisplay(page, "Grid Coords:", fieldGrid);
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabel("Edit on Map", { exact: true }).click();
    const movedPoint = await clickMapOffset(page, -145, 105);
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toEqual({ lat: expect.closeTo(movedPoint.lat, 8), lng: expect.closeTo(movedPoint.lng, 8) });
    current = (await mission.read()).pois[mission.ids.poiA];
    expect(current.elevation).toBe(await sampleElevation(request, mission.id, current.location));
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
    await page.reload();
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(page.locator('div[aria-label="LatitudePoi"]')).toHaveText(
      current.location.lat.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    );
    await expectDisplay(page, "Grid Coords:", movedGrid);
    await expectPointFeature(page, mission.ids.poiA, current.location);

    await page.getByLabel("Clear Location", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).pois[mission.ids.poiA].location)
      .toBeNull();
    const cleared = (await mission.read()).pois[mission.ids.poiA];
    expect(cleared.elevation).toBeNull();
    expect(cleared.name).toBe(originalPoi.name);
    expect(cleared.description).toBe(originalPoi.description);
    await expect(page.getByLabel("Create Location", { exact: true })).toBeVisible();
    await expectDisplay(page, "Relative Elevation (m):", "Not set");
    await expectDisplay(page, "Grid Coords:", "Not set");
    await expectPointFeature(page, mission.ids.poiA, null);
    await page.reload();
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();
    expect((await mission.read()).pois[mission.ids.poiA]).toEqual(cleared);
    await expectDisplay(page, "Relative Elevation (m):", "Not set");
    await expectDisplay(page, "Grid Coords:", "Not set");
    await expectPointFeature(page, mission.ids.poiA, null);
  });

  test("action location create, move, cancel, clear, and Set to Station keep parent identity and reload", async ({
    page,
    mission,
    request,
  }) => {
    await prepareElevationAndGridFixture(mission, request);
    await mission.change((doc) => {
      doc.actions[mission.ids.actionA].location = null;
      doc.actions[mission.ids.actionA].elevation = 73;
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    let row = await openActionLocation(page, "Sample regolith");

    await row.getByLabel("Create Location", { exact: true }).click();
    await expect(row.getByLabel("Cancel", { exact: true })).toBeVisible();
    await row.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(
      before.actions[mission.ids.actionA]
    );
    await expectPointFeature(page, mission.ids.actionA, null);

    await row.getByLabel("Create Location", { exact: true }).click();
    const createdPoint = await clickMapOffset(page, 150, -75);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual({
        lat: expect.closeTo(createdPoint.lat, 8),
        lng: expect.closeTo(createdPoint.lng, 8),
      });
    let action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBe(await sampleElevation(request, mission.id, action.location));
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

    await row.getByLabel("Edit on Map", { exact: true }).click();
    await expect(row.getByLabel("Cancel", { exact: true })).toBeVisible();
    await row.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(action);
    await expectDisplay(row, "Grid Coords:", createdGrid);
    await expectPointFeature(page, mission.ids.actionA, action.location);

    await row.getByLabel("Edit on Map", { exact: true }).click();
    const movedPoint = await clickMapOffset(page, -135, 95);
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual({ lat: expect.closeTo(movedPoint.lat, 8), lng: expect.closeTo(movedPoint.lng, 8) });
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBe(await sampleElevation(request, mission.id, action.location));
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
    await page.getByLabel("info_panel", { exact: true }).click();
    const stationGrid = await displayValue(page, "Grid Coords:");
    expect(stationGrid).toMatch(/^Cell-\d+-\d+$/);
    await selectPlanningStationActions(page, "Alpha station");
    row = await openActionLocation(page, "Sample regolith");
    await row.getByLabel("Set to Station", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toEqual(before.stations[mission.ids.stationA].location);
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action).toMatchObject({
      stationUuid: before.actions[mission.ids.actionA].stationUuid,
      poiUuid: before.actions[mission.ids.actionA].poiUuid,
      elevation: before.stations[mission.ids.stationA].elevation,
    });
    expect(action.elevation).toBe(
      await sampleElevation(request, mission.id, before.stations[mission.ids.stationA].location)
    );
    await expectPointFeature(page, mission.ids.actionA, action.location);
    await expectDisplay(row, "Elevation Relative to Station (m):", "0");
    await expectDisplay(row, "Distance to Station (m):", "0");
    await expectDisplay(row, "Grid Coords:", stationGrid);

    await row.getByLabel("Clear Location", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].location)
      .toBeNull();
    action = (await mission.read()).actions[mission.ids.actionA];
    expect(action.elevation).toBeNull();
    expect(action.stationUuid).toBe(before.actions[mission.ids.actionA].stationUuid);
    expect(action.poiUuid).toBe(before.actions[mission.ids.actionA].poiUuid);
    await expectDisplay(row, "Elevation Relative to Station (m):", "Not set");
    await expectDisplay(row, "Grid Coords:", "Not set");
    await expect(row.getByLabel("Create Location", { exact: true })).toBeVisible();
    await expectPointFeature(page, mission.ids.actionA, null);
    await page.reload();
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
    request,
  }) => {
    await prepareElevationAndGridFixture(mission, request);
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
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();
    const poiGrid = await displayValue(page, "Grid Coords:");
    expect(poiGrid).toMatch(/^Cell-\d+-\d+$/);
    expect(before.pois[mission.ids.poiA].elevation).toBe(
      await sampleElevation(request, mission.id, before.pois[mission.ids.poiA].location)
    );
    await page.getByLabel("actions_panel", { exact: true }).click();
    const row = await openActionLocation(page, "Map the outcrop");
    await row.getByLabel("Set to POI", { exact: true }).click();
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
    await page.reload();
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("actions_panel", { exact: true }).click();
    await openActionLocation(page, "Map the outcrop");
    expect((await mission.read()).actions[POI_ACTION]).toEqual(action);
    await expectPointFeature(page, POI_ACTION, action.location);
  });
});
