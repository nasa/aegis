import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { writeArrayBuffer } from "geotiff";
import { normalizeTerrainProfile } from "http-client/terrainProfile";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction, seedStation } from "../fixtures/entitySeeds";
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

type ExtraStation = { uuid: string; refUuid: string; name: string; location: AEGISPoint };

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
  extras: ExtraStation[]
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
      doc.traverses[uuid].pathSegmentElevations = route.profile;
    }
  });
}

function makeExtraStations(names: string[]): ExtraStation[] {
  return names.map((name, index) => ({
    uuid: randomUUID(),
    refUuid: randomUUID(),
    name,
    location: EXTRA_POINTS[index],
  }));
}

async function addStationActions(
  mission: BehavioralMission,
  station: ExtraStation,
  actionName: string
): Promise<string> {
  const actionUuid = randomUUID();
  await mission.change((doc) => {
    doc.stations[station.uuid].actionOrderUuids = [actionUuid];
    doc.actions[actionUuid] = seedAction({
      uuid: actionUuid,
      refUuid: randomUUID(),
      name: actionName,
      stationUuid: station.uuid,
      enabled: true,
    });
  });
  return actionUuid;
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

function traverseIds(sequence: EvaSequenceItem[]): string[] {
  return sequence.filter((item) => item.type === "traverse").map((item) => item.uuid);
}

async function assertSequenceShape(
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
    await expect
      .poll(async () => {
        const persisted = await mission.read();
        return persisted.traverses[traverse.uuid]?.pathSegmentElevations;
      })
      .toEqual(independent.elevationsMeters);
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

test.describe("EVA itinerary station lifecycle", () => {
  test("adding and replacing itinerary stations keeps shared stations and owned traverse paths aligned", async ({
    page,
    context,
    mission,
    request,
  }) => {
    const extras = makeExtraStations([
      "Charlie station",
      "Delta station",
      "Echo station",
      "Foxtrot station",
      "Golf station",
    ]);
    await prepareGoldenMission(mission, request, extras);
    const before = await mission.read();
    const evaUuid = mission.ids.evaA;
    const evaName = "Survey Alpha";
    const originalSequence = before.evas[evaUuid].sequence;
    const originalTraverseIds = traverseIds(originalSequence);
    const otherEva = before.evas[mission.ids.evaB];
    const otherEvaTraverseIds = traverseIds(otherEva.sequence);

    await mission.open(page);
    await openPlanningSection(page, "evas");
    await selectPlanningEva(page, evaName);
    await enablePlanningEditMode(page);

    const peer = await context.newPage();
    await mission.open(peer);
    await expectPeerSequence(peer, evaName, before, originalSequence);
    const row = planningEvaRow(page, evaName);
    const rowExpander = row.locator('svg[data-icon="caret-right"]');
    if (await rowExpander.count()) await rowExpander.click();
    await expect(page.getByLabel("Add Station", { exact: true })).toBeVisible();

    const addedTraverseIds: string[] = [];
    for (const station of extras.slice(0, 3)) {
      const beforeAdd = await mission.read();
      await page.getByLabel("Add Station", { exact: true }).click();
      await expect
        .poll(async () => (await evaSequence(mission, evaUuid)).length)
        .toBe(beforeAdd.evas[evaUuid].sequence.length + 2);
      const added = (await mission.read()).evas[evaUuid].sequence;
      const newTraverse = traverseIds(added).find(
        (uuid) => !traverseIds(beforeAdd.evas[evaUuid].sequence).includes(uuid)
      );
      expect(newTraverse).toBeDefined();
      addedTraverseIds.push(newTraverse!);
      const blankStationIndex = stationIds(added).findIndex((uuid) => uuid === "");
      await row.getByRole("combobox").nth(blankStationIndex).selectOption(station.uuid);
      await expect
        .poll(async () => stationIds(await evaSequence(mission, evaUuid)))
        .toContain(station.uuid);
    }
    let afterAdds = await mission.read();
    let sequence = afterAdds.evas[evaUuid].sequence;
    expect(stationIds(sequence)).toEqual([
      mission.ids.egressA,
      mission.ids.stationA,
      mission.ids.stationB,
      extras[0].uuid,
      extras[1].uuid,
      extras[2].uuid,
      mission.ids.ingressA,
    ]);
    expect(sequence.map((item) => item.type)).toEqual([
      "station",
      "traverse",
      "station",
      "traverse",
      "station",
      "traverse",
      "station",
      "traverse",
      "station",
      "traverse",
      "station",
      "traverse",
      "station",
    ]);
    expect(addedTraverseIds.every((uuid) => originalTraverseIds.includes(uuid) === false)).toBe(
      true
    );
    expect(afterAdds.evas[mission.ids.evaB]).toEqual(otherEva);
    await assertSequenceShape(mission, request, evaUuid);

    const moveAddedStation = async (uuid: string, direction: "up" | "down") => {
      const current = await evaSequence(mission, evaUuid);
      const expected = stationIds(current);
      const stationIndex = expected.indexOf(uuid);
      const rowIndex = stationIndex;
      await (
        await evaStationRow(page, evaName, rowIndex)
      )
        .locator(`[data-icon="arrow-${direction}"]`)
        .click();
      const swapIndex = stationIndex + (direction === "up" ? -1 : 1);
      [expected[stationIndex], expected[swapIndex]] = [expected[swapIndex], expected[stationIndex]];
      await expect
        .poll(async () => stationIds(await evaSequence(mission, evaUuid)))
        .toEqual(expected);
      await assertSequenceShape(mission, request, evaUuid);
    };
    await moveAddedStation(extras[0].uuid, "up");
    await moveAddedStation(extras[0].uuid, "up");
    await moveAddedStation(extras[1].uuid, "up");
    sequence = await evaSequence(mission, evaUuid);
    expect(stationIds(sequence)).toEqual([
      mission.ids.egressA,
      extras[0].uuid,
      mission.ids.stationA,
      extras[1].uuid,
      mission.ids.stationB,
      extras[2].uuid,
      mission.ids.ingressA,
    ]);

    // Replace shared Bravo with a new plan station, freeing Bravo for egress.
    await row.getByRole("combobox").nth(4).selectOption(extras[3].uuid);
    await expect
      .poll(async () => stationIds(await evaSequence(mission, evaUuid))[4])
      .toBe(extras[3].uuid);
    await assertSequenceShape(mission, request, evaUuid);
    await row.getByRole("combobox").first().selectOption(mission.ids.stationB);
    await expect
      .poll(async () => stationIds(await evaSequence(mission, evaUuid))[0])
      .toBe(mission.ids.stationB);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationB])
      .toEqual(before.stations[mission.ids.stationB]);
    await assertSequenceShape(mission, request, evaUuid);

    // The ingress can be changed to a new regular station, then back to a managed lander copy.
    const ingressIndex = stationIds(await evaSequence(mission, evaUuid)).length - 1;
    await row.getByRole("combobox").nth(ingressIndex).selectOption(extras[4].uuid);
    await expect
      .poll(async () => stationIds(await evaSequence(mission, evaUuid)).at(-1))
      .toBe(extras[4].uuid);
    await assertSequenceShape(mission, request, evaUuid);
    await row.getByRole("combobox").nth(ingressIndex).selectOption("lander");
    await expect
      .poll(async () => {
        const doc = await mission.read();
        const endpointUuid = doc.evas[evaUuid].sequence.at(-1)!.uuid;
        return doc.stations[endpointUuid]?.isLanderXgress;
      })
      .toBe(true);
    await row.getByRole("combobox").first().selectOption("lander");
    await expect
      .poll(async () => {
        const doc = await mission.read();
        const endpointUuid = doc.evas[evaUuid].sequence[0].uuid;
        return doc.stations[endpointUuid]?.isLanderXgress;
      })
      .toBe(true);
    afterAdds = await mission.read();
    sequence = afterAdds.evas[evaUuid].sequence;
    expect(sequence.map((item) => item.type)).toEqual(
      Array.from({ length: sequence.length }, (_, index) =>
        index % 2 === 0 ? "station" : "traverse"
      )
    );
    expect(afterAdds.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(afterAdds.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    expect(afterAdds.actions[mission.ids.actionA].enabled).toBe(true);
    expect(afterAdds.evas[mission.ids.evaB]).toEqual(otherEva);
    expect(afterAdds.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    for (const traverseUuid of otherEvaTraverseIds) {
      expect(afterAdds.traverses[traverseUuid]).toEqual(before.traverses[traverseUuid]);
    }
    await assertSequenceShape(mission, request, evaUuid);
    await expectPeerSequence(peer, evaName, afterAdds, sequence);
    await mission.open(page);
    await openPlanningSection(page, "evas");
    await selectPlanningEva(page, "Survey Alpha");
    await enablePlanningEditMode(page);
    expect((await mission.read()).evas[evaUuid].sequence).toEqual(sequence);
    const reloadedCopy = await mission.read();
    await expectPeerSequence(page, evaName, reloadedCopy, sequence);
    await expectPeerSequence(peer, evaName, reloadedCopy, sequence);
  });

  test("reordering and removing itinerary stations updates paths and cleans only owned traverse actions", async ({
    page,
    context,
    mission,
    request,
  }) => {
    const extras = makeExtraStations(["Charlie remove", "Delta remove"]);
    await prepareGoldenMission(mission, request, extras);
    const sharedStationActionUuid = randomUUID();
    await mission.change((doc) => {
      doc.stations[mission.ids.stationB].actionOrderUuids = [sharedStationActionUuid];
      doc.actions[sharedStationActionUuid] = seedAction({
        uuid: sharedStationActionUuid,
        refUuid: randomUUID(),
        name: "Shared Bravo enabled action",
        stationUuid: mission.ids.stationB,
        enabled: true,
      });
    });
    const before = await mission.read();
    const originalBravo = before.stations[mission.ids.stationB];
    const originalEvaBravo = before.evas[mission.ids.evaB];
    const actionA = before.actions[mission.ids.actionA];
    const deltaActionUuid = await addStationActions(mission, extras[1], "Delta retained action");

    await mission.open(page);
    await openPlanningSection(page, "evas");
    await enablePlanningEditMode(page);
    const row = planningEvaRow(page, "Survey Alpha");
    const rowExpander = row.locator('svg[data-icon="caret-right"]');
    if (await rowExpander.count()) await rowExpander.click();
    await expect(page.getByLabel("Add Station", { exact: true })).toBeVisible();

    for (const station of extras) {
      const currentSequence = await evaSequence(mission, mission.ids.evaA);
      await page.getByLabel("Add Station", { exact: true }).click();
      await expect
        .poll(async () => (await evaSequence(mission, mission.ids.evaA)).length)
        .toBe(currentSequence.length + 2);
      const addedSequence = await evaSequence(mission, mission.ids.evaA);
      const blankStationIndex = stationIds(addedSequence).findIndex((uuid) => uuid === "");
      expect(blankStationIndex).toBeGreaterThanOrEqual(0);
      await row.getByRole("combobox").nth(blankStationIndex).selectOption(station.uuid);
      await expect
        .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA)))
        .toContain(station.uuid);
    }
    let sequence = await evaSequence(mission, mission.ids.evaA);
    expect(stationIds(sequence)).toEqual([
      mission.ids.egressA,
      mission.ids.stationA,
      mission.ids.stationB,
      extras[0].uuid,
      extras[1].uuid,
      mission.ids.ingressA,
    ]);
    const initialAddedTraverses = traverseIds(sequence).filter(
      (uuid) => !traverseIds(before.evas[mission.ids.evaA].sequence).includes(uuid)
    );
    expect(initialAddedTraverses).toHaveLength(2);
    // Move a first, then a middle, then a last station in the as-planned order.
    const move = async (uuid: string, direction: "up" | "down") => {
      const current = await evaSequence(mission, mission.ids.evaA);
      const stationIndex = stationIds(current).indexOf(uuid);
      const rowIndex = current
        .filter((item) => item.type === "station")
        .findIndex((id) => id.uuid === uuid);
      await (
        await evaStationRow(page, "Survey Alpha", rowIndex)
      )
        .locator(`[data-icon="arrow-${direction}"]`)
        .click();
      const expected = stationIds(current);
      const next = stationIndex + (direction === "up" ? -1 : 1);
      [expected[stationIndex], expected[next]] = [expected[next], expected[stationIndex]];
      await expect
        .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA)))
        .toEqual(expected);
      await assertSequenceShape(mission, request, mission.ids.evaA);
    };
    await move(mission.ids.stationA, "down");
    await move(extras[0].uuid, "up");
    await move(extras[1].uuid, "up");
    sequence = await evaSequence(mission, mission.ids.evaA);
    expect(stationIds(sequence)).toEqual([
      mission.ids.egressA,
      mission.ids.stationB,
      extras[0].uuid,
      extras[1].uuid,
      mission.ids.stationA,
      mission.ids.ingressA,
    ]);
    const traverseAfterBravo =
      sequence[
        sequence.findIndex(
          (item) => item.type === "station" && item.uuid === mission.ids.stationB
        ) + 1
      ].uuid;
    const ownedTraverseActionUuid = randomUUID();
    await mission.change((doc) => {
      doc.traverses[traverseAfterBravo].actionOrderUuids = [ownedTraverseActionUuid];
      doc.actions[ownedTraverseActionUuid] = seedAction({
        uuid: ownedTraverseActionUuid,
        refUuid: randomUUID(),
        name: "Owned traverse action",
        traverseUuid: traverseAfterBravo,
        enabled: true,
      });
    });

    const remove = async (uuid: string) => {
      const current = await evaSequence(mission, mission.ids.evaA);
      const stationPosition = stationIds(current).indexOf(uuid);
      const sequenceIndex = current.findIndex(
        (item) => item.type === "station" && item.uuid === uuid
      );
      const traverseToDelete = current[sequenceIndex + 1].uuid;
      await (
        await evaStationRow(page, "Survey Alpha", stationPosition)
      )
        .locator('[data-icon="trash"]')
        .click();
      const expected = stationIds(current).filter((id) => id !== uuid);
      await expect
        .poll(async () => stationIds(await evaSequence(mission, mission.ids.evaA)))
        .toEqual(expected);
      const after = await mission.read();
      expect(after.traverses[traverseToDelete]).toBeUndefined();
      expect(after.actions[ownedTraverseActionUuid]).toBeUndefined();
      await assertSequenceShape(mission, request, mission.ids.evaA);
      return after;
    };

    // Selected shared Bravo is removed from this itinerary, while its station,
    // enabled action and Survey Bravo membership remain intact.
    await (await evaStationRow(page, "Survey Alpha", 1)).locator('[class*="iconCustom"]').click();
    await expect(page.getByText("Station Information", { exact: true })).toBeVisible();
    const afterFirstRemoval = await remove(mission.ids.stationB);
    expect(afterFirstRemoval.stations[mission.ids.stationB]).toEqual(originalBravo);
    expect(afterFirstRemoval.actions[sharedStationActionUuid]).toEqual(
      before.actions[sharedStationActionUuid]
    );
    expect(afterFirstRemoval.actions[sharedStationActionUuid].enabled).toBe(true);
    expect(afterFirstRemoval.evas[mission.ids.evaB]).toEqual(originalEvaBravo);

    const afterInteriorRemoval = await remove(extras[1].uuid);
    expect(afterInteriorRemoval.stations[extras[1].uuid]).toBeDefined();
    expect(afterInteriorRemoval.actions[deltaActionUuid].enabled).toBe(true);
    const afterLastRemoval = await remove(mission.ids.stationA);
    expect(afterLastRemoval.stations[mission.ids.stationA]).toEqual(
      before.stations[mission.ids.stationA]
    );
    expect(afterLastRemoval.actions[mission.ids.actionA]).toEqual(actionA);
    expect(afterLastRemoval.actions[mission.ids.actionA].enabled).toBe(true);

    sequence = await evaSequence(mission, mission.ids.evaA);
    expect(stationIds(sequence)).toEqual([
      mission.ids.egressA,
      extras[0].uuid,
      mission.ids.ingressA,
    ]);
    const remainingTraverseIds = traverseIds(sequence);
    expect(
      Object.keys((await mission.read()).traverses).filter((uuid) =>
        initialAddedTraverses.includes(uuid)
      )
    ).toEqual(initialAddedTraverses.filter((uuid) => remainingTraverseIds.includes(uuid)));
    const peer = await context.newPage();
    await mission.open(peer);
    await expectPeerSequence(peer, "Survey Alpha", await mission.read(), sequence);
    await mission.open(page);
    await openPlanningSection(page, "evas");
    await enablePlanningEditMode(page);
    const reloadedMission = await mission.read();
    await expectPeerSequence(page, "Survey Alpha", reloadedMission, sequence);
    await expectPeerSequence(peer, "Survey Alpha", reloadedMission, sequence);
    expect(reloadedMission.evas[mission.ids.evaB]).toEqual(originalEvaBravo);
  });
});
