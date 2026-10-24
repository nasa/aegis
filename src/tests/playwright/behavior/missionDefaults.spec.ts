import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

async function openPreferences(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabel("prefs_panel", { exact: true }).click();
}

function displayedValue(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("../..")
    .locator('[class*="displayFieldValue"]');
}

test("mission walkback defaults update inherited times while station overrides and existing EVA durations stay independent", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    doc.walkbackRate = 3;
    doc.defaultEvaDuration = 240;
    doc.stations[mission.ids.stationA].walkbackTraverseRate = null;
    doc.stations[mission.ids.stationB].walkbackTraverseRate = 6;
    for (const uuid of [mission.ids.stationA, mission.ids.stationB]) {
      doc.stations[uuid].walkbackPathSegmentDistances = [500];
    }
  });
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  const peer = await context.newPage();
  await mission.open(peer);
  await selectPlanningStation(peer, "Alpha station");
  await peer.getByLabel("info_panel", { exact: true }).click();
  await expect(displayedValue(peer, "Time (mins):")).toHaveText("10");

  await openPreferences(page);
  await savePlanningField(page, "Default walkback rate", "2");
  await savePlanningField(page, "Default EVA Duration", "300");
  await expect(displayedValue(peer, "Time (mins):")).toHaveText("15");
  await selectPlanningStation(page, "Bravo station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(planningField(page, "Average Walkback Traverse Rate")).toHaveText("6");
  await expect(displayedValue(page, "Time (mins):")).toHaveText("5");
  const clear = await openPlanningField(page, "Average Walkback Traverse Rate");
  await clear.getByLabel("Average Walkback Traverse Rate", { exact: true }).fill("");
  await clear.getByText("Save", { exact: true }).click();
  await expect(clear).toHaveCount(0);
  await expect(displayedValue(page, "Time (mins):")).toHaveText("15");

  await selectPlanningStation(page, "Alpha station");
  await savePlanningField(page, "Average Walkback Traverse Rate", "1.5");
  await expect(displayedValue(page, "Time (mins):")).toHaveText("20");
  await expect(displayedValue(peer, "Time (mins):")).toHaveText("20");
  await openPreferences(page);
  await savePlanningField(page, "Default walkback rate", "6");
  await expect(displayedValue(peer, "Time (mins):")).toHaveText("20");
  await selectPlanningStation(page, "Bravo station");
  await expect(displayedValue(page, "Time (mins):")).toHaveText("5");
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationB].walkbackTraverseRate)
    .toBeNull();
  const after = await mission.read();
  expect(after.evas).toEqual(before.evas);
  expect(after.actions).toEqual(before.actions);
  expect(after.traverses).toEqual(before.traverses);

  // The EVA duration default is copied at creation, unlike inherited walkback rates.
  await openPlanningSection(page, "evas");
  await page.getByLabel("addEva", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).evas).length).toBe(3);
  const created = Object.values((await mission.read()).evas).find((eva) => !before.evas[eva.uuid]);
  expect(created.duration).toBe(300);
  for (const uuid of [mission.ids.evaA, mission.ids.evaB]) {
    expect((await mission.read()).evas[uuid]).toEqual(before.evas[uuid]);
  }
  await mission.open(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(displayedValue(page, "Time (mins):")).toHaveText("20");
  await selectPlanningStation(page, "Bravo station");
  await expect(displayedValue(page, "Time (mins):")).toHaveText("5");
});

test("lander relocation updates every EVA boundary and walkback with real DEM elevation on a peer and after reload", async ({
  page,
  context,
  request,
  mission,
}) => {
  // GDAL-sampled points from the checked-in Apollo 14 production extract.
  const oldLander = { lat: -3.425034, lng: -17.463573 };
  const nextLander = { lat: -3.4251, lng: -17.463573 };
  const alpha = { lat: -3.425627, lng: -17.462978 };
  const bravo = { lat: -3.426287, lng: -17.462318 };
  const interior = { lat: -3.425627, lng: -17.462912 };
  expect(
    process.env.STATIC_DIR,
    "The local API's static directory must be configured"
  ).toBeTruthy();
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await mkdir(directory, { recursive: true });
  await copyFile(
    fileURLToPath(
      new URL("../../vitest/fixtures/raster/apollo14-golden-striped.tif", import.meta.url)
    ),
    path.join(directory, "behavior-dem.tif")
  );
  await mission.change((doc) => {
    doc.demFilePath = "behavior-dem.tif";
    doc.demResolution = 2;
    doc.projBoundsMinX = -180;
    doc.projBoundsMaxX = 180;
    doc.projBoundsMinY = -90;
    doc.projBoundsMaxY = 90;
    doc.landerLocation = oldLander;
    doc.landerElevationMeters = -1050.947509765625;
    for (const station of Object.values(doc.stations)) {
      station.location = station.isLanderXgress
        ? oldLander
        : station.uuid === mission.ids.stationA
          ? alpha
          : bravo;
      if (!station.isLanderXgress)
        station.walkbackPath = [{ ...station.location }, interior, oldLander];
    }
    for (const traverse of Object.values(doc.traverses)) {
      traverse.path = traverse.path.map((point) =>
        point.lat === 0
          ? oldLander
          : point.lng === 0.001
            ? alpha
            : point.lng === 0.003
              ? bravo
              : interior
      );
    }
  });
  // Establish the real API/worker/raster prerequisite, with an independent golden value.
  const terrain = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: [nextLander, nextLander], pathSegmentDistances: [0], getElevationOnly: true },
  });
  expect(terrain.ok()).toBe(true);
  expect((await terrain.json()).data.elevationsMeters).toEqual([
    [-1050.83740234375, -1050.83740234375],
  ]);
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPreferences(page);
  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await openPreferences(peer);
  const draft = await openPlanningField(page, "LatitudePref");
  await draft.getByLabel("LatitudePref", { exact: true }).fill(String(nextLander.lat));
  await draft.getByText("Cancel", { exact: true }).click();
  expect(await mission.read()).toEqual(before);
  await expect(planningField(peer, "LatitudePref")).toHaveText(String(oldLander.lat));

  const edit = await openPlanningField(page, "LatitudePref");
  await edit.getByLabel("LatitudePref", { exact: true }).fill(String(nextLander.lat));
  await edit.getByLabel("LongitudePref", { exact: true }).fill(String(nextLander.lng));
  await edit.getByText("Save", { exact: true }).click();
  await expect
    .poll(mission.read)
    .toMatchObject({ landerLocation: nextLander, landerElevationMeters: -1050.83740234375 });
  await expect(planningField(peer, "LatitudePref")).toHaveText(String(nextLander.lat));
  await expect(displayedValue(peer, "Absolute Elevation (m):")).toHaveText("-1051");

  const after = await mission.read();
  for (const station of Object.values(after.stations)) {
    const original = before.stations[station.uuid];
    if (station.isLanderXgress) {
      expect(station.location).toEqual(nextLander);
      expect(station.elevation).toBe(-1050.83740234375);
    } else {
      expect(station.location).toEqual(original.location);
      expect(station.walkbackPath).toEqual([original.location, interior, nextLander]);
      expect(station.walkbackPathSegmentDistances).toHaveLength(2);
      expect(
        station.walkbackPathSegmentDistances.every(
          (distance) => distance > 0 && Number.isFinite(distance)
        )
      ).toBe(true);
      expect(station.walkbackPathSegmentElevations.at(-1).at(-1)).toBe(-1050.83740234375);
    }
  }
  for (const [uuid, boundary] of [
    [mission.ids.traverseOutbound, "start"],
    [mission.ids.traverseReturn, "end"],
    [mission.ids.traverseB, "start"],
    [mission.ids.traverseBReturn, "end"],
  ] as const) {
    const original = before.traverses[uuid].path;
    expect(after.traverses[uuid].path).toEqual(
      boundary === "start"
        ? [nextLander, ...original.slice(1)]
        : [...original.slice(0, -1), nextLander]
    );
    expect(
      after.traverses[uuid].pathSegmentElevations[0][
        boundary === "start" ? 0 : after.traverses[uuid].pathSegmentElevations[0].length - 1
      ]
    ).toBe(-1050.83740234375);
  }
  expect(after.traverses[mission.ids.traverseA]).toEqual(before.traverses[mission.ids.traverseA]);
  expect(after.evas).toEqual(before.evas);
  expect(after.actions).toEqual(before.actions);
  expect(after.pois).toEqual(before.pois);
  for (const client of [page, peer]) {
    const landerCoordinates = async () =>
      (await readMapFeatures(client)).find((feature) => feature.layerZIndex === 11)?.coordinates;
    await expect
      .poll(landerCoordinates)
      .toEqual([
        expect.closeTo((nextLander.lng * Math.PI * 6378137) / 180, 5),
        expect.closeTo(
          Math.log(Math.tan(Math.PI / 4 + (nextLander.lat * Math.PI) / 360)) * 6378137,
          5
        ),
      ]);
  }
  await mission.open(page);
  await openPreferences(page);
  await expect(planningField(page, "LatitudePref")).toHaveText(String(nextLander.lat));
  expect(await mission.read()).toEqual(after);
});
