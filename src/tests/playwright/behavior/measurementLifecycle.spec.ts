import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

async function openMeasurements(page: Page) {
  await page.locator('[data-tooltip-content="Measurements"]').click();
  await expect(page.locator('[data-tooltip-content="Add Temporary Measurement"]')).toBeVisible();
}

const tabs = (page: Page) => page.locator('[class*="measureTabContainer"]');

test("measurement graph receives sampled elevations from the mission DEM", async ({
  page,
  request,
  mission,
}) => {
  const lander = { lat: -3.4256273976012914, lng: -17.462978266484328 };
  expect(process.env.STATIC_DIR).toBeTruthy();
  const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
  await mkdir(directory, { recursive: true });
  await copyFile(
    fileURLToPath(
      new URL("../../vitest/fixtures/raster/apollo14-golden-striped.tif", import.meta.url)
    ),
    path.join(directory, "measure-dem.tif")
  );
  await mission.change((doc) => {
    doc.demFilePath = "measure-dem.tif";
    doc.demResolution = 2;
    doc.landerLocation = lander;
    doc.landerElevationMeters = -1049.260009765625;
    doc.initialZoom = 22;
  });
  const before = await mission.read();
  const terrain = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: [lander, lander], pathSegmentDistances: [0], getElevationOnly: true },
  });
  expect(terrain.ok()).toBe(true);
  expect((await terrain.json()).data.elevationsMeters).toEqual([
    [-1049.260009765625, -1049.260009765625],
  ]);
  await mission.open(page);
  await openMeasurements(page);
  const profileResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/terrain-profile?") && response.request().method() === "POST"
  );
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  const response = await profileResponse;
  expect(response.ok()).toBe(true);
  const profile = (await response.json()).data as TerrainProfile;
  expect(profile.elevationsMeters[0].length).toBeGreaterThanOrEqual(2);
  expect(profile.elevationsMeters[0].every(Number.isFinite)).toBe(true);
  await expect(tabs(page)).toHaveCount(1);
  const graph = page.locator('[class*="measureCanvasContainer"] canvas');
  const standardGraph = await graph.screenshot();
  expect(standardGraph.byteLength).toBeGreaterThan(1000);
  expect(await mission.read()).toEqual(before);
});
