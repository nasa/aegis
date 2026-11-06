import { readTerrainProfile } from "../fixtures/terrainAssertions";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { writeArrayBuffer } from "geotiff";
import { normalizeTerrainProfile } from "http-client/terrainProfile";
import { test, expect } from "../fixtures/behavioralTest";
import { seedStation } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
} from "./planningHelpers";

const DEM_FILE = "eva-itinerary-synthetic.tif";
const RASTER = {
  width: 64,
  height: 32,
  originX: -320,
  originY: 160,
  pixelSize: 10,
  noData: 0,
};
const EARTH_RADIUS = 6_378_137;

function cellCenter(column: number, row: number): AEGISPoint {
  const radiansToDegrees = 180 / Math.PI;
  const x = RASTER.originX + (column + 0.5) * RASTER.pixelSize;
  const y = RASTER.originY - (row + 0.5) * RASTER.pixelSize;
  return {
    lng: (x / EARTH_RADIUS) * radiansToDegrees,
    lat: ((2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180) / Math.PI,
  };
}

const LANDER = cellCenter(8, 16);
const ALPHA = cellCenter(18, 16);
const BRAVO = cellCenter(30, 16);
const MIDDLE = cellCenter(24, 16);
const EXTRA_POINTS = [
  cellCenter(13, 16),
  cellCenter(22, 16),
  cellCenter(34, 16),
  cellCenter(42, 16),
  cellCenter(50, 16),
];

async function terrainProfile(
  request: APIRequestContext,
  missionId: number,
  points: AEGISPoint[],
  distances: number[]
): Promise<number[][]> {
  const response = await request.post(`/api/v1/terrain-profile?missionId=${missionId}`, {
    data: { path: points, pathSegmentDistances: distances },
  });
  expect(response.ok(), `Golden DEM profile available for ${JSON.stringify(points)}`).toBe(true);
  return (await response.json()).data.elevationsMeters as number[][];
}

async function fullTerrainProfile(
  request: APIRequestContext,
  missionId: number,
  points: AEGISPoint[],
  distances: number[]
): Promise<TerrainProfile> {
  const response = await request.post(`/api/v1/terrain-profile?missionId=${missionId}`, {
    data: { path: points, pathSegmentDistances: distances },
  });
  expect(response.ok(), `Golden DEM profile available for ${JSON.stringify(points)}`).toBe(true);
  return (await response.json()).data as TerrainProfile;
}

async function pointElevation(
  request: APIRequestContext,
  missionId: number,
  point: AEGISPoint
): Promise<number> {
  const profile = await terrainProfile(request, missionId, [point, point], [0]);
  expect(Number.isFinite(profile[0][0])).toBe(true);
  return profile[0][0];
}

async function createSyntheticDem(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const pixels = new Uint8Array(RASTER.width * RASTER.height);
  for (let row = 0; row < RASTER.height; row++) {
    for (let column = 0; column < RASTER.width; column++) {
      pixels[row * RASTER.width + column] = 100 + column;
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
    ModelTiepoint: [0, 0, 0, RASTER.originX, RASTER.originY, 0],
  });
  await writeFile(path.join(directory, DEM_FILE), Buffer.from(bytes));
}

function pathDistances(points: AEGISPoint[], radius = EARTH_RADIUS): number[] {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const latitude = radians(point.lat - previous.lat);
    const longitude = radians(point.lng - previous.lng);
    const a =
      Math.sin(latitude / 2) ** 2 +
      Math.cos(radians(previous.lat)) * Math.cos(radians(point.lat)) * Math.sin(longitude / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  });
}

async function prepareGoldenMission(
  mission: BehavioralMission,
  request: APIRequestContext,
  extras: ItineraryStationFixture[]
): Promise<void> {
  expect(process.env.STATIC_DIR, "The local API static directory must be configured").toBeTruthy();
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await createSyntheticDem(directory);
  await mission.change((doc) => {
    doc.demFilePath = DEM_FILE;
    doc.demResolution = RASTER.pixelSize;
    doc.planetRadius = EARTH_RADIUS;
    doc.landerLocation = { ...LANDER };
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.projBoundsMinX = RASTER.originX;
    doc.projBoundsMaxX = RASTER.originX + RASTER.width * RASTER.pixelSize;
    doc.projBoundsMinY = RASTER.originY - RASTER.height * RASTER.pixelSize;
    doc.projBoundsMaxY = RASTER.originY;
    for (const stationId of [
      mission.ids.egressA,
      mission.ids.ingressA,
      mission.ids.egressB,
      mission.ids.ingressB,
    ]) {
      doc.stations[stationId].location = { ...LANDER };
    }
    doc.stations[mission.ids.stationA].location = { ...ALPHA };
    doc.stations[mission.ids.stationB].location = { ...BRAVO };
    doc.traverses[mission.ids.traverseOutbound].path = [{ ...LANDER }, { ...ALPHA }];
    doc.traverses[mission.ids.traverseA].path = [{ ...ALPHA }, { ...MIDDLE }, { ...BRAVO }];
    doc.traverses[mission.ids.traverseReturn].path = [{ ...BRAVO }, { ...LANDER }];
    doc.traverses[mission.ids.traverseB].path = [{ ...LANDER }, { ...BRAVO }];
    doc.traverses[mission.ids.traverseBReturn].path = [{ ...BRAVO }, { ...LANDER }];
    for (const extra of extras) {
      doc.stations[extra.uuid] = seedStation({
        uuid: extra.uuid,
        refUuid: extra.refUuid,
        name: extra.name,
        location: { ...extra.location },
        elevation: 0,
        walkbackPath: [{ ...extra.location }, { ...LANDER }],
        walkbackPathSegmentDistances: pathDistances([extra.location, LANDER]),
      });
    }
  });

  const locations: Record<string, AEGISPoint> = {
    [mission.ids.stationA]: ALPHA,
    [mission.ids.stationB]: BRAVO,
    [mission.ids.egressA]: LANDER,
    [mission.ids.ingressA]: LANDER,
    [mission.ids.egressB]: LANDER,
    [mission.ids.ingressB]: LANDER,
    ...Object.fromEntries(extras.map((station) => [station.uuid, station.location])),
  };
  const elevations: Record<string, number> = Object.fromEntries(
    await Promise.all(
      Object.entries(locations).map(async ([uuid, point]) => [
        uuid,
        await pointElevation(request, mission.id, point),
      ])
    )
  );
  expect(elevations[mission.ids.egressA]).toBe(108);
  expect(elevations[mission.ids.stationA]).toBe(118);
  expect(elevations[mission.ids.stationB]).toBe(130);
  for (const [index, station] of extras.entries()) {
    expect(elevations[station.uuid]).toBe(100 + [13, 22, 34, 42, 50][index]);
  }
  const routePaths: Record<string, AEGISPoint[]> = {
    [mission.ids.traverseOutbound]: [LANDER, ALPHA],
    [mission.ids.traverseA]: [ALPHA, MIDDLE, BRAVO],
    [mission.ids.traverseReturn]: [BRAVO, LANDER],
    [mission.ids.traverseB]: [LANDER, BRAVO],
    [mission.ids.traverseBReturn]: [BRAVO, LANDER],
  };
  const routeData: Record<string, { distances: number[]; profile: number[][] }> =
    Object.fromEntries(
      await Promise.all(
        Object.entries(routePaths).map(async ([uuid, points]) => {
          const distances = pathDistances(points);
          return [
            uuid,
            {
              distances,
              profile: await terrainProfile(request, mission.id, points, distances),
            },
          ];
        })
      )
    );
  await mission.change((doc) => {
    doc.landerElevationMeters = elevations[mission.ids.egressA];
    for (const [uuid, elevation] of Object.entries(elevations)) {
      doc.stations[uuid].elevation = elevation;
    }
    for (const [uuid, route] of Object.entries(routeData)) {
      doc.traverses[uuid].pathSegmentDistances = route.distances;
    }
  });
}

function makeExtraStations(names: string[]): ItineraryStationFixture[] {
  return names.map((name, index) => ({
    uuid: randomUUID(),
    refUuid: randomUUID(),
    name,
    location: EXTRA_POINTS[index],
  }));
}

async function evaSequence(
  mission: BehavioralMission,
  evaUuid: string
): Promise<EvaSequenceItem[]> {
  return (await mission.read()).evas[evaUuid].sequence;
}

function stationIds(sequence: EvaSequenceItem[]): string[] {
  return sequence.filter((item) => item.type === "station").map((item) => item.uuid);
}

async function assertSequenceShape(
  page: Page,
  mission: BehavioralMission,
  request: APIRequestContext,
  evaUuid: string
): Promise<void> {
  const doc = await mission.read();
  const sequence = doc.evas[evaUuid].sequence;
  expect(sequence.length % 2).toBe(1);
  expect(sequence[0].type).toBe("station");
  expect(sequence.at(-1)?.type).toBe("station");
  for (let index = 0; index < sequence.length; index++) {
    expect(sequence[index].type).toBe(index % 2 === 0 ? "station" : "traverse");
  }
  for (let index = 0; index < sequence.length; index += 2) {
    const from = doc.stations[sequence[index].uuid];
    expect(from, `Station ${sequence[index].uuid} exists`).toBeDefined();
    if (index + 2 >= sequence.length) continue;
    const to = doc.stations[sequence[index + 2].uuid];
    const traverse = doc.traverses[sequence[index + 1].uuid];
    expect(traverse, `Traverse ${sequence[index + 1].uuid} exists`).toBeDefined();
    expect(traverse.name.trim().length).toBeGreaterThan(0);
    expect(traverse.name).toContain(" to ");
    expect(traverse.path[0]).toEqual(from.location);
    expect(traverse.path.at(-1)).toEqual(to.location);
    expect(traverse.pathSegmentDistances).toHaveLength(traverse.path.length - 1);
    expect(traverse.pathSegmentDistances.every((distance) => distance > 0)).toBe(true);
    const independent = await fullTerrainProfile(
      request,
      mission.id,
      traverse.path,
      traverse.pathSegmentDistances
    );
    expect(
      normalizeTerrainProfile(independent, traverse.path, traverse.pathSegmentDistances),
      `Independent profile for traverse ${traverse.uuid} has aligned elevations and slopes`
    ).not.toBeNull();
    expect((await readTerrainProfile(page, traverse.uuid)).elevationsMeters).toEqual(
      independent.elevationsMeters
    );
  }
}

async function evaStationRow(page: Page, evaName: string, stationIndex: number): Promise<Locator> {
  return planningEvaRow(page, evaName)
    .locator('[class*="evaSequence"] > [class*="evaItem"]')
    .nth(stationIndex * 2);
}

async function selectedValues(page: Page, evaName: string): Promise<string[]> {
  return planningEvaRow(page, evaName)
    .getByRole("combobox")
    .evaluateAll((selects) => selects.map((select) => (select as HTMLSelectElement).value));
}

async function expectPeerSequence(
  peer: Page,
  evaName: string,
  doc: Mission,
  sequence: EvaSequenceItem[]
): Promise<void> {
  await openPlanningSection(peer, "evas");
  const expectedTypes = sequence.map((item) => item.type);
  const row = planningEvaRow(peer, evaName);
  await expect(row).toBeVisible();
  const collapsedExpander = row.locator('svg[data-icon="caret-right"]');
  if (await collapsedExpander.count()) await collapsedExpander.click();
  const items = row.locator('[class*="evaSequence"] > [class*="evaItem"]');
  await expect.poll(async () => items.count()).toBe(sequence.length);
  if ((await row.getByRole("combobox").count()) > 0) {
    const expected = sequence
      .filter((item) => item.type === "station")
      .map((item) => (doc.stations[item.uuid]?.isLanderXgress ? "lander" : item.uuid));
    expect(await selectedValues(peer, evaName)).toEqual(expected);
    return;
  }
  for (const [index, item] of sequence.entries()) {
    const rendered = items.nth(index);
    if (item.type === "station") {
      await expect(rendered.locator('[class*="evaItemNameText"]')).toHaveText(
        doc.stations[item.uuid]?.name ?? "< Station not selected >"
      );
    } else {
      const traverse = doc.traverses[item.uuid];
      const text = await rendered.locator('[class*="evaTraverseNameText"]').innerText();
      expect(text).toContain(traverse.name.split(" to ")[0]);
      expect(text).toContain(traverse.name.split(" to ")[1]);
    }
    expect(item.type).toBe(expectedTypes[index]);
  }
}

test.afterEach(async ({ mission }) => {
  if (!process.env.STATIC_DIR) return;
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await rm(path.join(directory, DEM_FILE), { force: true });
});

test("itinerary add, reorder, replace and remove refresh served raster profiles and persist their final graph", async ({
  page,
  context,
  mission,
  request,
}) => {
  const extras = makeExtraStations(["Charlie station", "Delta station"]);
  await prepareGoldenMission(mission, request, extras);
  const before = await mission.read();
  await mission.open(page);
  await selectPlanningEva(page, "Survey Alpha");
  await enablePlanningEditMode(page);
  const row = planningEvaRow(page, "Survey Alpha");
  await page.getByLabel("Add Station", { exact: true }).click();
  await expect.poll(async () => (await evaSequence(mission, mission.ids.evaA)).length).toBe(9);
  await row.getByRole("combobox").nth(3).selectOption(extras[0].uuid);
  await expect
    .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA))[3])
    .toBe(extras[0].uuid);
  await assertSequenceShape(page, mission, request, mission.ids.evaA);
  await (await evaStationRow(page, "Survey Alpha", 3)).locator('[data-icon="arrow-up"]').click();
  await expect
    .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA))[2])
    .toBe(extras[0].uuid);
  await assertSequenceShape(page, mission, request, mission.ids.evaA);
  await row.getByRole("combobox").nth(2).selectOption(extras[1].uuid);
  await expect
    .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA))[2])
    .toBe(extras[1].uuid);
  await assertSequenceShape(page, mission, request, mission.ids.evaA);
  const beforeRemove = await evaSequence(mission, mission.ids.evaA);
  const removedTraverse = beforeRemove[5].uuid;
  await (await evaStationRow(page, "Survey Alpha", 2)).locator('[data-icon="trash"]').click();
  await expect
    .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA)))
    .toEqual(stationIds(before.evas[mission.ids.evaA].sequence));
  await assertSequenceShape(page, mission, request, mission.ids.evaA);
  const after = await mission.read();
  expect(after.traverses[removedTraverse]).toBeUndefined();
  expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
  expect(after.stations).toEqual(before.stations);
  expect(after.actions).toEqual(before.actions);
  const peer = await context.newPage();
  await mission.open(peer);
  await expectPeerSequence(peer, "Survey Alpha", after, after.evas[mission.ids.evaA].sequence);
});
