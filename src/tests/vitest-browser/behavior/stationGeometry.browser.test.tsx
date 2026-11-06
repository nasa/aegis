import { exactText } from "./browserAssertions";
import store from "store";
import { commands } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { mapFeaturePixel } from "./mapInteractions";
import { readMapFeatures } from "./mapObserver";
import {
  enablePlanningEditMode,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";
const LANDER = { lat: -3.4256273976012914, lng: -17.462978266484328 };
const STATION = { lat: -3.4251, lng: -17.463573 };
const INTERIOR = { lat: -3.425627, lng: -17.462912 };
const LANDER_ELEVATION = 156;
const STATION_ELEVATION = 124;
const GRID_SIZE = 41;
async function prepareTerrainAndGrid(
  mission: BrowserMission,
  requestHandlers: Record<string, BrowserRequestHandler>
) {
  const grid = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => ({
      id: row * GRID_SIZE + col,
      index: { row, col },
      coordinates: {
        lat: LANDER.lat + (20 - row) * 0.00005,
        lng: LANDER.lng + (col - 20) * 0.00005,
      },
      name: `StationCell-${row}-${col}`,
    }))
  );
  requestHandlers["/api/v1/grid"] = () =>
    Response.json({ status: "success", data: { coordinates: grid } });
  const profile = (input: TerrainProfilePostData) => ({
    status: "success",
    data: {
      elevationsMeters: input.pathSegmentDistances.map(() => [156, 156]),
      terrainSlopesDegrees: input.pathSegmentDistances.map(() => [0, 0]),
    },
  });
  requestHandlers["/api/v1/terrain-profile"] = (_url, init) =>
    Response.json(profile(JSON.parse(String(init.body))));
  requestHandlers["/api/v1/terrain-profile/batch"] = (_url, init) =>
    Response.json({ status: "success", data: JSON.parse(String(init.body)).profiles.map(profile) });
  await mission.change((doc) => {
    doc.demFilePath = "explicit-station.dem";
    doc.demResolution = 4;
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
      name: "Station Geometry Contract Grid",
      fileName: "explicit-station-grid.json",
    };
    doc.usingLGRSCoordinates = false;
    doc.presets[mission.ids.presetA].mapGridControl.visible = true;
  });
}
async function readTerrainProfile(uuid: string): Promise<TerrainProfile> {
  await expect.poll(() => store.getState().terrainProfiles.profiles[uuid]?.status).toBe("ready");
  return store.getState().terrainProfiles.profiles[uuid].profile;
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
      const feature = (await readMapFeatures()).find((item) => item.id === stationUuid);
      return feature?.geometryType === "Point" ? feature.coordinates : null;
    })
    .toEqual(point ? mercator(point).map((coordinate) => expect.closeTo(coordinate, 5)) : null);
}

async function clickMapOffset(page: Page, dx: number, dy: number): Promise<void> {
  await expect
    .poll(() =>
      (() =>
        window.__aegisMaps
          .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
          ?.map.getTargetElement()?.style.cursor)()
    )
    .toBe("crosshair");
  const viewport = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
  const bounds = viewport.element().getBoundingClientRect();
  await commands.mapPointer(
    "click",
    bounds!.x + bounds!.width / 2 + dx,
    bounds!.y + bounds!.height / 2 + dy
  );
}

async function walkbackFeature(page: Page, stationUuid: string) {
  return (await readMapFeatures()).find(
    (item) => item.id === `walkback-${stationUuid}` && item.geometryType === "LineString"
  );
}

async function dragWalkbackVertex(page: Page, stationUuid: string, vertex: number) {
  const pixel = await mapFeaturePixel(`walkback-${stationUuid}`, "editor", vertex);
  const destination = await (({ x, y }: BrowserScreenPoint) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )!.map;
    const bounds = map.getTargetElement()!.getBoundingClientRect();
    const [east, north] = map.getCoordinateFromPixel([x - bounds.left, y - bounds.top]);
    return {
      lng: ((east / 6378137) * 180) / Math.PI,
      lat: ((2 * Math.atan(Math.exp(north / 6378137)) - Math.PI / 2) * 180) / Math.PI,
    };
  })({ x: pixel.x + 44, y: pixel.y - 35 });
  await commands.mapPointer("move", pixel.x, pixel.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", pixel.x + 44, pixel.y - 35, 12);
  await commands.mapPointer("up");
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

test.describe("Station geometry and walkback lifecycles", () => {
  test("station location creation, cancellation, lander shortcut, and missing terrain preserve valid geometry", async ({
    page,
    mission,
    requestHandlers,
  }) => {
    await prepareTerrainAndGrid(mission, requestHandlers);
    await mission.change((doc) => {
      const station = doc.stations[mission.ids.stationA];
      station.location = null;
      station.elevation = null;
      station.walkbackPath = null;
      station.walkbackPathSegmentDistances = null;
    });
    const original = (await mission.read()).stations[mission.ids.stationA];
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();

    await page.getByLabelText("Create Location", { exact: true }).click();
    await page.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(original);
    await expectStationFeature(page, mission.ids.stationA, null);

    await page.getByLabelText("Create Location", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await clickMapOffset(page, 155, -90);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    const created = (await mission.read()).stations[mission.ids.stationA];
    expect(created.elevation).toBe(156);
    expect(created.location).not.toEqual(LANDER);
    expect(created.walkbackPath?.[0]).toEqual(created.location);
    expect(created.walkbackPath?.at(-1)).toEqual(LANDER);
    const createdWalkback = created.walkbackPath!;
    const createdDistances = created.walkbackPathSegmentDistances!;
    expect(createdDistances).toEqual([
      expect.closeTo(haversineMeters(createdWalkback[0], LANDER), 2),
    ]);
    expect((await readTerrainProfile(mission.ids.stationA)).elevationsMeters).toEqual(
      createdDistances.map(() => [156, 156])
    );
    await expectStationFeature(page, mission.ids.stationA, created.location);
    const entityGrid = await page
      .getByText("Grid Coords:", { exact: true })
      .getBySelector("../..")
      .getBySelector('[class*="displayFieldValue"]')
      .element().textContent!;
    expect(entityGrid).toMatch(/^StationCell-\d+-\d+$/);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toHaveLength(2);

    await page.getByLabelText("Edit on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await page.getByLabelText("Cancel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(created);
    await expectStationFeature(page, mission.ids.stationA, created.location);

    await page.getByLabelText("Edit on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await clickMapOffset(page, -145, 105);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .not.toEqual(created.location);
    const moved = (await mission.read()).stations[mission.ids.stationA];
    expect(moved.elevation).toBe(156);
    expect(moved.name).toBe(created.name);
    expect(moved.walkbackPath?.[0]).toEqual(moved.location);
    expect(moved.walkbackPath?.at(-1)).toEqual(LANDER);
    const movedGrid = await page
      .getByText("Grid Coords:", { exact: true })
      .getBySelector("../..")
      .getBySelector('[class*="displayFieldValue"]')
      .element().textContent!;
    expect(movedGrid).toMatch(/^StationCell-\d+-\d+$/);
    expect(movedGrid).not.toBe(entityGrid);
    await expectStationFeature(page, mission.ids.stationA, moved.location);

    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(moved);
    await expectStationFeature(page, mission.ids.stationA, moved.location);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        moved.walkbackPath!.map((point) => mercator(point).map((value) => expect.closeTo(value, 5)))
      );

    await page.getByLabelText("Set to Lander", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
      .toEqual(LANDER);
    const landed = (await mission.read()).stations[mission.ids.stationA];
    expect(landed.elevation).toBe(LANDER_ELEVATION);
    expect(landed.walkbackPath?.[0]).toEqual(LANDER);
    expect(landed.walkbackPath?.at(-1)).toEqual(LANDER);
    expect(landed.walkbackPathSegmentDistances).toEqual([0]);
    expect((await readTerrainProfile(mission.ids.stationA)).elevationsMeters).toEqual([[156, 156]]);
    await expect
      .element(
        page
          .getByText("Grid Coords:", { exact: true })
          .getBySelector("../..")
          .getBySelector('[class*="displayFieldValue"]')
      )
      .toHaveTextContent(exactText("StationCell-20-20"));
    await expectStationFeature(page, mission.ids.stationA, LANDER);
    await mission.open();
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
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
    });
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(page.getByText("Mission lander location not set", { exact: true }))
      .toBeVisible();
    await expect.poll(() => page.getByLabelText("Set to Lander", { exact: true }).length).toBe(0);
    await page.getByLabelText("Create Location", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
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
    requestHandlers,
  }) => {
    await prepareTerrainAndGrid(mission, requestHandlers);
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
    });
    const seededStation = (await mission.read()).stations[mission.ids.stationA];
    const independentProfile = seededStation.walkbackPathSegmentDistances!.map(() => [156, 156]);
    expect(independentProfile).toHaveLength(2);
    const before = (await mission.read()).stations[mission.ids.stationA];
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );

    await page.getByLabelText("Edit Path on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    const cancelledPoint = await dragWalkbackVertex(page, mission.ids.stationA, 1);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .not.toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );
    await page.getByLabelText("Cancel", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA])
      .toEqual({
        ...before,
        walkbackPathSegmentDistances: before.walkbackPathSegmentDistances!.map((value) =>
          expect.closeTo(value, 10)
        ),
      });
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        before.walkbackPath!.map((point) =>
          mercator(point).map((value) => expect.closeTo(value, 5))
        )
      );
    expect(cancelledPoint).not.toEqual(INTERIOR);

    await page.getByLabelText("Edit Path on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    const movedPoint = await dragWalkbackVertex(page, mission.ids.stationA, 1);
    await page.getByLabelText("Finished", { exact: true }).click();
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
    expect((await readTerrainProfile(mission.ids.stationA)).elevationsMeters).toEqual(
      edited.walkbackPathSegmentDistances!.map(() => [156, 156])
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
      .poll(
        async () =>
          page
            .getByText("Distance (m):", { exact: true })
            .getBySelector("../..")
            .getBySelector('[class*="displayFieldValue"]')
            .element().textContent!
      )
      .toBe(Math.round(distance).toLocaleString("en-US"));
    await expect
      .poll(
        async () =>
          page
            .getByText("Time (mins):", { exact: true })
            .getBySelector("../..")
            .getBySelector('[class*="displayFieldValue"]')
            .element().textContent!
      )
      .toBe(String(Math.ceil((distance / 1000 / 3) * 60)));

    await page.getByLabelText("Reset Path", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].walkbackPath)
      .toEqual([STATION, LANDER]);
    const reset = (await mission.read()).stations[mission.ids.stationA];
    expect(reset.walkbackPathSegmentDistances).toEqual([
      expect.closeTo(haversineMeters(STATION, LANDER), 2),
    ]);
    expect((await readTerrainProfile(mission.ids.stationA)).elevationsMeters).toEqual(
      reset.walkbackPathSegmentDistances!.map(() => [156, 156])
    );
    await mission.open();
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(reset);
    await expect
      .poll(async () => (await walkbackFeature(page, mission.ids.stationA))?.coordinates)
      .toEqual(
        reset.walkbackPath!.map((point) => mercator(point).map((value) => expect.closeTo(value, 5)))
      );
    await expect
      .poll(
        async () =>
          page
            .getByText("Distance (m):", { exact: true })
            .getBySelector("../..")
            .getBySelector('[class*="displayFieldValue"]')
            .element().textContent!
      )
      .toBe(Math.round(reset.walkbackPathSegmentDistances![0]).toLocaleString("en-US"));
  });
});
