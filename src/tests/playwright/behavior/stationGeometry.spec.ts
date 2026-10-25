import type { APIRequestContext, Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeArrayBuffer } from "geotiff";
import { test, expect } from "../fixtures/behavioralTest";
import { mapFeaturePixel, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

const DEM_FILE = "station-geometry-synthetic.tif";
const GRID_FILE = "station-geometry-grid.json";
const LANDER = { lat: -3.4256273976012914, lng: -17.462978266484328 };
const STATION = { lat: -3.4251, lng: -17.463573 };
const INTERIOR = { lat: -3.425627, lng: -17.462912 };
const LANDER_ELEVATION = 156;
const STATION_ELEVATION = 124;
const GRID_SIZE = 41;
const GRID_FILE_NAME = "Station Geometry Contract Grid";
const RASTER = { width: 256, height: 256, pixelSize: 4, center: 128, noData: 0 };
const EARTH_RADIUS = 6_378_137;

function projected(point: AEGISPoint): [number, number] {
  return [
    (point.lng * Math.PI * EARTH_RADIUS) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * EARTH_RADIUS,
  ];
}

async function createSyntheticDem(directory: string): Promise<void> {
  const [landerX, landerY] = projected(LANDER);
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

async function prepareTerrainAndGrid(mission: BehavioralMission): Promise<void> {
  expect(process.env.STATIC_DIR, "The local API static directory must be configured").toBeTruthy();
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  const dataDirectory = path.join(directory, "Data");
  await mkdir(dataDirectory, { recursive: true });
  await createSyntheticDem(directory);
  const step = 0.00005;
  const grid = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => ({
      id: row * GRID_SIZE + col,
      index: { row, col },
      coordinates: {
        lat: LANDER.lat + ((GRID_SIZE - 1) / 2 - row) * step,
        lng: LANDER.lng + (col - (GRID_SIZE - 1) / 2) * step,
      },
      name: `StationCell-${row}-${col}`,
    }))
  );
  await writeFile(path.join(dataDirectory, GRID_FILE), JSON.stringify(grid), "utf8");
  await mission.change((doc) => {
    doc.demFilePath = DEM_FILE;
    doc.demResolution = RASTER.pixelSize;
    doc.landerLocation = { ...LANDER };
    doc.landerElevationMeters = LANDER_ELEVATION;
    doc.initialZoom = 19;
    doc.projBoundsMinX = -180;
    doc.projBoundsMaxX = 180;
    doc.projBoundsMinY = -90;
    doc.projBoundsMaxY = 90;
    doc.gridRenderMode = "server-file";
    doc.serverFileGrid = {
      numRows: GRID_SIZE,
      numCols: GRID_SIZE,
      name: GRID_FILE_NAME,
      fileName: GRID_FILE,
    };
    doc.usingLGRSCoordinates = false;
    doc.presets[mission.ids.presetA].mapGridControl.visible = true;
  });
}

async function terrainProfile(
  request: APIRequestContext,
  missionId: number,
  pathPoints: AEGISPoint[],
  pathSegmentDistances: number[]
): Promise<number[][]> {
  const response = await request.post(`/api/v1/terrain-profile?missionId=${missionId}`, {
    data: { path: pathPoints, pathSegmentDistances },
  });
  const responseText = await response.text();
  expect(
    response.ok(),
    `The synthetic DEM returns an independent terrain profile: ${response.status()} ${responseText}`
  ).toBe(true);
  return JSON.parse(responseText).data.elevationsMeters as number[][];
}

function mercator(point: AEGISPoint): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

async function expectStationFeature(page: Page, stationUuid: string, point: AEGISPoint | null) {
  await expect
    .poll(async () => {
      const feature = (await readMapFeatures(page)).find((item) => item.id === stationUuid);
      return feature?.geometryType === "Point" ? feature.coordinates : null;
    })
    .toEqual(point ? mercator(point).map((coordinate) => expect.closeTo(coordinate, 5)) : null);
}

async function clickMapOffset(page: Page, dx: number, dy: number): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__aegisMaps
            .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
            ?.map.getTargetElement()?.style.cursor
      )
    )
    .toBe("crosshair");
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  const bounds = await viewport.boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width / 2 + dx, bounds!.y + bounds!.height / 2 + dy);
}

async function walkbackFeature(page: Page, stationUuid: string) {
  return (await readMapFeatures(page)).find(
    (item) => item.id === `walkback-${stationUuid}` && item.geometryType === "LineString"
  );
}

async function dragWalkbackVertex(page: Page, stationUuid: string, vertex: number) {
  const pixel = await mapFeaturePixel(page, `walkback-${stationUuid}`, "editor", vertex);
  const destination = await page.evaluate(
    ({ x, y }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )!.map;
      const bounds = map.getTargetElement()!.getBoundingClientRect();
      const [east, north] = map.getCoordinateFromPixel([x - bounds.left, y - bounds.top]);
      return {
        lng: ((east / 6378137) * 180) / Math.PI,
        lat: ((2 * Math.atan(Math.exp(north / 6378137)) - Math.PI / 2) * 180) / Math.PI,
      };
    },
    { x: pixel.x + 44, y: pixel.y - 35 }
  );
  await page.mouse.move(pixel.x, pixel.y);
  await page.mouse.down();
  await page.mouse.move(pixel.x + 44, pixel.y - 35, { steps: 12 });
  await page.mouse.up();
  return destination;
}

function haversineMeters(first: AEGISPoint, second: AEGISPoint, radius = 1737400): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(second.lat - first.lat);
  const dLng = radians(second.lng - first.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

test.afterEach(async ({ mission }) => {
  if (!process.env.STATIC_DIR) return;
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await Promise.all([
    rm(path.join(directory, DEM_FILE), { force: true }),
    rm(path.join(directory, "Data", GRID_FILE), { force: true }),
  ]);
});

test.describe("Station geometry and walkback lifecycles", () => {
  test("station location creation, cancellation, lander shortcut, and missing terrain preserve valid geometry", async ({
    page,
    mission,
    request,
  }) => {
    await prepareTerrainAndGrid(mission);
    await mission.change((doc) => {
      const station = doc.stations[mission.ids.stationA];
      station.location = null;
      station.elevation = null;
      station.walkbackPath = null;
      station.walkbackPathSegmentDistances = null;
      station.walkbackPathSegmentElevations = null;
    });
    const original = (await mission.read()).stations[mission.ids.stationA];
    const landerProfile = await terrainProfile(request, mission.id, [LANDER, LANDER], [0]);
    expect(landerProfile).toEqual([[LANDER_ELEVATION, LANDER_ELEVATION]]);
    const stationProfile = await terrainProfile(request, mission.id, [STATION, STATION], [0]);
    expect(stationProfile[0][0]).toBe(STATION_ELEVATION);
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();

    await page.getByLabel("Create Location", { exact: true }).click();
    await page.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(original);
    await expectStationFeature(page, mission.ids.stationA, null);

    await page.getByLabel("Create Location", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await clickMapOffset(page, 155, -90);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    const created = (await mission.read()).stations[mission.ids.stationA];
    expect(created.elevation).toBe(
      await (async () => {
        const profile = await terrainProfile(
          request,
          mission.id,
          [created.location, created.location],
          [0]
        );
        return profile[0][0];
      })()
    );
    expect(created.location).not.toEqual(LANDER);
    expect(created.walkbackPath?.[0]).toEqual(created.location);
    expect(created.walkbackPath?.at(-1)).toEqual(LANDER);
    const createdWalkback = created.walkbackPath!;
    const createdDistances = created.walkbackPathSegmentDistances!;
    expect(createdDistances).toEqual([
      expect.closeTo(haversineMeters(createdWalkback[0], LANDER), 2),
    ]);
    expect(created.walkbackPathSegmentElevations).toEqual(
      await terrainProfile(request, mission.id, createdWalkback, createdDistances)
    );
    await expectStationFeature(page, mission.ids.stationA, created.location);
    const entityGrid = await page
      .getByText("Grid Coords:", { exact: true })
      .locator("../..")
      .locator('[class*="displayFieldValue"]')
      .innerText();
    expect(entityGrid).toMatch(/^StationCell-\d+-\d+$/);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toHaveLength(2);

    await page.getByLabel("Edit on Map", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await page.getByLabel("Cancel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(created);
    await expectStationFeature(page, mission.ids.stationA, created.location);

    await page.getByLabel("Edit on Map", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await clickMapOffset(page, -145, 105);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .not.toEqual(created.location);
    const moved = (await mission.read()).stations[mission.ids.stationA];
    expect(moved.elevation).toBe(
      await (async () => {
        const profile = await terrainProfile(
          request,
          mission.id,
          [moved.location!, moved.location!],
          [0]
        );
        return profile[0][0];
      })()
    );
    expect(moved.name).toBe(created.name);
    expect(moved.walkbackPath?.[0]).toEqual(moved.location);
    expect(moved.walkbackPath?.at(-1)).toEqual(LANDER);
    const movedGrid = await page
      .getByText("Grid Coords:", { exact: true })
      .locator("../..")
      .locator('[class*="displayFieldValue"]')
      .innerText();
    expect(movedGrid).toMatch(/^StationCell-\d+-\d+$/);
    expect(movedGrid).not.toBe(entityGrid);
    await expectStationFeature(page, mission.ids.stationA, moved.location);

    await page.reload();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(moved);
    await expectStationFeature(page, mission.ids.stationA, moved.location);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        moved.walkbackPath!.map((point) => mercator(point).map((value) => expect.closeTo(value, 5)))
      );

    await page.getByLabel("Set to Lander", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .toEqual(LANDER);
    const landed = (await mission.read()).stations[mission.ids.stationA];
    expect(landed.elevation).toBe(LANDER_ELEVATION);
    expect(landed.walkbackPath?.[0]).toEqual(LANDER);
    expect(landed.walkbackPath?.at(-1)).toEqual(LANDER);
    expect(landed.walkbackPathSegmentDistances).toEqual([0]);
    expect(landed.walkbackPathSegmentElevations).toEqual(
      await terrainProfile(request, mission.id, [LANDER, LANDER], [0])
    );
    await expect(
      page
        .getByText("Grid Coords:", { exact: true })
        .locator("../..")
        .locator('[class*="displayFieldValue"]')
    ).toHaveText("StationCell-20-20");
    await expectStationFeature(page, mission.ids.stationA, LANDER);
    await page.reload();
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(landed);

    // Missing DEM and mission lander leave a saved point intact, without stale elevation/path data.
    await mission.change((doc) => {
      doc.demFilePath = "";
      doc.landerLocation = { lat: null, lng: null };
      const station = doc.stations[mission.ids.stationA];
      station.location = null;
      station.elevation = null;
      station.walkbackPath = null;
      station.walkbackPathSegmentDistances = null;
      station.walkbackPathSegmentElevations = null;
    });
    await page.reload();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(page.getByText("Mission lander location not set", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Set to Lander", { exact: true })).toHaveCount(0);
    await page.getByLabel("Create Location", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    await clickMapOffset(page, -145, 105);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    const noTerrain = (await mission.read()).stations[mission.ids.stationA];
    expect(noTerrain.elevation).toBeNull();
    expect(noTerrain.walkbackPath).toBeNull();
    expect(noTerrain.walkbackPathSegmentDistances).toBeNull();
    await expectStationFeature(page, mission.ids.stationA, noTerrain.location);
  });

  test("walkback edit cancel, finish, rate metrics, reset, and reload preserve pinned endpoints", async ({
    page,
    mission,
    request,
  }) => {
    await prepareTerrainAndGrid(mission);
    await mission.change((doc) => {
      const station = doc.stations[mission.ids.stationA];
      station.location = { ...STATION };
      station.elevation = STATION_ELEVATION;
      station.walkbackTraverseRate = 1.5;
      station.walkbackPath = [{ ...STATION }, { ...INTERIOR }, { ...LANDER }];
      station.walkbackPathSegmentDistances = [
        haversineMeters(STATION, INTERIOR),
        haversineMeters(INTERIOR, LANDER),
      ];
      station.walkbackPathSegmentElevations = null;
    });
    const seededStation = (await mission.read()).stations[mission.ids.stationA];
    const independentProfile = await terrainProfile(
      request,
      mission.id,
      seededStation.walkbackPath!,
      seededStation.walkbackPathSegmentDistances!
    );
    await mission.change((doc) => {
      doc.stations[mission.ids.stationA].walkbackPathSegmentElevations = independentProfile;
    });
    const before = (await mission.read()).stations[mission.ids.stationA];
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );

    await page.getByLabel("Edit Path on Map", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    const cancelledPoint = await dragWalkbackVertex(page, mission.ids.stationA, 1);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .not.toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );
    await page.getByLabel("Cancel", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA])
      .toEqual(before);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );
    expect(cancelledPoint).not.toEqual(INTERIOR);

    await page.getByLabel("Edit Path on Map", { exact: true }).click();
    await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
    const movedPoint = await dragWalkbackVertex(page, mission.ids.stationA, 1);
    await page.getByLabel("Finished", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].walkbackPath)
      .toEqual([
        STATION,
        { lat: expect.closeTo(movedPoint.lat, 8), lng: expect.closeTo(movedPoint.lng, 8) },
        LANDER,
      ]);
    let edited = (await mission.read()).stations[mission.ids.stationA];
    expect(edited.walkbackPath?.[0]).toEqual(STATION);
    expect(edited.walkbackPath?.at(-1)).toEqual(LANDER);
    expect(edited.walkbackPathSegmentDistances).toHaveLength(2);
    expect(edited.walkbackPathSegmentDistances?.every((d) => d > 0 && Number.isFinite(d))).toBe(
      true
    );
    expect(edited.walkbackPathSegmentElevations).toEqual(
      await terrainProfile(
        request,
        mission.id,
        edited.walkbackPath!,
        edited.walkbackPathSegmentDistances!
      )
    );
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        edited.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );

    await savePlanningField(page, "Average Walkback Traverse Rate", "3");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].walkbackTraverseRate)
      .toBe(3);
    edited = (await mission.read()).stations[mission.ids.stationA];
    expect(edited.walkbackTraverseRate).toBe(3);
    const distance = edited.walkbackPathSegmentDistances!.reduce((sum, value) => sum + value, 0);
    await expect
      .poll(async () =>
        page
          .getByText("Distance (m):", { exact: true })
          .locator("../..")
          .locator('[class*="displayFieldValue"]')
          .innerText()
      )
      .toBe(Math.round(distance).toLocaleString("en-US"));
    await expect
      .poll(async () =>
        page
          .getByText("Time (mins):", { exact: true })
          .locator("../..")
          .locator('[class*="displayFieldValue"]')
          .innerText()
      )
      .toBe(String(Math.ceil((distance / 1000 / 3) * 60)));

    await page.getByLabel("Reset Path", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].walkbackPath)
      .toEqual([STATION, LANDER]);
    const reset = (await mission.read()).stations[mission.ids.stationA];
    expect(reset.walkbackPathSegmentDistances).toEqual([
      expect.closeTo(haversineMeters(STATION, LANDER), 2),
    ]);
    expect(reset.walkbackPathSegmentElevations).toEqual(
      await terrainProfile(
        request,
        mission.id,
        reset.walkbackPath!,
        reset.walkbackPathSegmentDistances!
      )
    );
    await page.reload();
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(reset);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        reset.walkbackPath!.map((point) => mercator(point).map((value) => expect.closeTo(value, 5)))
      );
    await expect
      .poll(async () =>
        page
          .getByText("Distance (m):", { exact: true })
          .locator("../..")
          .locator('[class*="displayFieldValue"]')
          .innerText()
      )
      .toBe(Math.round(reset.walkbackPathSegmentDistances![0]).toLocaleString("en-US"));
  });
});
