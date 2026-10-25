import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test, expect } from "../fixtures/behavioralTest";
import { selectPlanningEva } from "./planningHelpers";

type MeasurementState = {
  id: string;
  coordinates: number[][];
  distances: number[];
  bearings: number[];
};

const knownPolarPath = [
  { lat: 89.9, lng: 0 },
  { lat: 89.90001, lng: 0.00001 },
];
const earthRadiusMeters = 6_378_137;
const disconnectedElevations = [
  [0, 10],
  [100, 90],
  [20, 25],
];

function independentAscentDescent(segments: number[][]) {
  let ascent = 0;
  let descent = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index++) {
      const change = segment[index] - segment[index - 1];
      ascent += Math.max(0, change);
      descent += Math.max(0, -change);
    }
  }
  return { ascent, descent };
}

function total(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("../..")
    .locator('[class*="displayFieldValue"]');
}

async function measurements(page: Page): Promise<MeasurementState[]> {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return [];
    return map
      .getLayers()
      .getArray()
      .flatMap((layer) => {
        const source = (layer as VectorLayer).getSource?.();
        if (!source || !("getFeatures" in source)) return [];
        return source
          .getFeatures()
          .filter((feature) => feature.get("mapItemType") === "measurement")
          .map((feature) => ({
            id: String(feature.getId()),
            coordinates: (feature.getGeometry() as LineString).getCoordinates(),
            distances: (feature.get("segmentDistances") as number[]) ?? [],
            bearings: (feature.get("segmentBearings") as number[]) ?? [],
          }));
      });
  });
}

async function vertexPixel(page: Page, id: string, vertexIndex: number) {
  return page.evaluate(
    ({ id, vertexIndex }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) throw new Error("Editor map is unavailable");
      for (const layer of map.getLayers().getArray()) {
        const source = (layer as VectorLayer).getSource?.();
        const feature = source && "getFeatureById" in source ? source.getFeatureById(id) : null;
        if (!feature) continue;
        const coordinates = (feature.getGeometry() as LineString).getCoordinates();
        const pixel = map.getPixelFromCoordinate(coordinates[vertexIndex]);
        const bounds = map.getTargetElement().getBoundingClientRect();
        return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
      }
      throw new Error(`Measurement ${id} is absent`);
    },
    { id, vertexIndex }
  );
}

async function knownPointPixel(page: Page, { lat, lng }: AEGISPoint) {
  return page.evaluate(
    ({ lat, lng }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) throw new Error("Editor map is unavailable");
      const radius = 6_378_137;
      const radians = Math.PI / 180;
      const coordinate = [
        radius * lng * radians,
        radius * Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)),
      ];
      const pixel = map.getPixelFromCoordinate(coordinate);
      const bounds = map.getTargetElement().getBoundingClientRect();
      return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
    },
    { lat, lng }
  );
}

function projectedToGeographic([x, y]: number[]) {
  const radiansToDegrees = 180 / Math.PI;
  return {
    lng: (x / earthRadiusMeters) * radiansToDegrees,
    lat: ((2 * Math.atan(Math.exp(y / earthRadiusMeters)) - Math.PI / 2) * 180) / Math.PI,
  };
}

function independentDistanceAndBearing(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  radius: number
) {
  const radians = Math.PI / 180;
  const startLat = start.lat * radians;
  const endLat = end.lat * radians;
  const deltaLat = endLat - startLat;
  const deltaLng = (end.lng - start.lng) * radians;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  const distance = radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const bearingY = Math.sin(deltaLng) * Math.cos(endLat);
  const bearingX =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  return { distance, bearing: (Math.atan2(bearingY, bearingX) * 180) / Math.PI };
}

async function dragVertex(page: Page, id: string, index: number, target: { x: number; y: number }) {
  const start = await vertexPixel(page, id, index);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
}

async function screenPixelForVertex(page: Page, id: string, vertexIndex: number) {
  return page.evaluate(
    ({ id, vertexIndex }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) throw new Error("Editor map is unavailable");
      for (const layer of map.getLayers().getArray()) {
        const source = (layer as VectorLayer).getSource?.();
        const feature = source && "getFeatureById" in source ? source.getFeatureById(id) : null;
        if (!feature) continue;
        const coordinates = (feature.getGeometry() as LineString).getCoordinates();
        const pixel = map.getPixelFromCoordinate(coordinates[vertexIndex]);
        const bounds = map.getTargetElement().getBoundingClientRect();
        return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
      }
      throw new Error(`Measurement ${id} is absent`);
    },
    { id, vertexIndex }
  );
}

for (const { name, radius } of [
  { name: "Earth", radius: earthRadiusMeters },
  { name: "Moon", radius: 1_737_400 },
]) {
  test(`${name} measurement geodesy matches a known pair near the pole`, async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.planetRadius = radius;
      doc.landerLocation = knownPolarPath[0];
      doc.initialZoom = 17;
      doc.projIsCustom = false;
      doc.projEpsg = "EPSG:3857";
      doc.usingLGRSCoordinates = false;
      doc.demFilePath = "";
      const traverse = doc.traverses[mission.ids.traverseA];
      traverse.path = [
        knownPolarPath[0],
        knownPolarPath[1],
        { lat: 89.90002, lng: 0.00002 },
        { lat: 89.90003, lng: 0.00003 },
      ];
      traverse.pathSegmentDistances = [100, 100, 100];
      traverse.pathSegmentElevations = disconnectedElevations;
    });
    const missionDocument = await mission.read();
    await mission.open(page);
    await page.locator('[data-tooltip-content="Measurements"]').click();
    await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => measurements(page)).toHaveLength(1);
    const id = (await measurements(page))[0].id;

    await page.getByLabel("Edit Path on Map", { exact: true }).click();
    await dragVertex(page, id, 0, await knownPointPixel(page, knownPolarPath[0]));
    await dragVertex(page, id, 1, await knownPointPixel(page, knownPolarPath[1]));
    await page.getByLabel("Finished", { exact: true }).click();

    await expect.poll(async () => (await measurements(page))[0].distances).toHaveLength(1);
    const measurement = (await measurements(page))[0];
    expect(measurement.coordinates).toHaveLength(2);
    const actualGeographic = measurement.coordinates.map(projectedToGeographic);
    for (const [index, point] of actualGeographic.entries()) {
      expect(point.lat).toBeCloseTo(knownPolarPath[index].lat, 6);
      expect(point.lng).toBeCloseTo(knownPolarPath[index].lng, 6);
    }
    const expected = independentDistanceAndBearing(knownPolarPath[0], knownPolarPath[1], radius);
    await expect
      .poll(async () => (await measurements(page))[0].distances[0])
      .toBeCloseTo(expected.distance, 2);
    await expect
      .poll(async () => (await measurements(page))[0].bearings[0])
      .toBeCloseTo(expected.bearing, 1);
    await expect(
      page
        .locator('[class*="timelineHoverValueItem"]')
        .nth(0)
        .locator('[class*="timelineHoverValue"]')
        .last()
    ).toHaveText(expected.distance.toFixed(0));
    await selectPlanningEva(page, "Survey Alpha");
    await page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await page.getByLabel("info_panel", { exact: true }).click();
    const { ascent, descent } = independentAscentDescent(disconnectedElevations);
    expect({ ascent, descent }).toEqual({ ascent: 15, descent: 10 });
    await expect(total(page, "Ascent (m):")).toHaveText(String(ascent));
    await expect(total(page, "Descent (m):")).toHaveText(String(descent));
    expect(await mission.read()).toEqual(missionDocument);
  });
}

test("terrain profile errors retain a usable measurement and recover after the worker responds", async ({
  page,
  request,
  mission,
}) => {
  const profilePath = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
  ];
  await mission.change((doc) => {
    doc.demResolution = 10;
    doc.demFilePath = "";
  });
  const missingDem = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: profilePath, pathSegmentDistances: [100] },
  });
  const missingBody = await missingDem.json();
  expect(missingDem.status(), JSON.stringify(missingBody)).toBe(400);
  expect(missingBody.message).toBe("Mission does not have a DEM configured");

  const invalidCoordinates = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: [{ lat: 91, lng: 0 }, profilePath[1]], pathSegmentDistances: [100] },
  });
  expect(invalidCoordinates.status()).toBe(400);
  expect((await invalidCoordinates.json()).message).toContain("invalid coordinates");

  const overLimit = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: profilePath, pathSegmentDistances: [1_000_000] },
  });
  expect(overLimit.status()).toBe(400);
  expect((await overLimit.json()).message).toContain("sample limit");

  await mission.change((doc) => {
    doc.demFilePath = "worker-unavailable-test.tif";
    doc.demResolution = 10;
  });
  let profileRequestCount = 0;
  await page.route("**/api/v1/terrain-profile?**", async (route) => {
    profileRequestCount += 1;
    if (profileRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "Terrain sampling workers unavailable" }),
      });
      return;
    }
    const profileRequest = route.request().postDataJSON() as TerrainProfilePostData;
    const segmentCount = profileRequest.path.length - 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "Terrain profile sampled",
        data: {
          elevationsMeters: Array.from({ length: segmentCount }, () => [100, 110]),
          terrainSlopesDegrees: Array.from({ length: segmentCount }, () => [1, 1]),
        },
      }),
    });
  });
  const missionDocument = await mission.read();
  await mission.open(page);
  await page.locator('[data-tooltip-content="Measurements"]').click();
  const initialFailure = page.waitForResponse(
    (response) => response.url().includes("/api/v1/terrain-profile?") && response.status() === 503
  );
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements(page)).toHaveLength(1);
  const id = (await measurements(page))[0].id;
  const unavailable = await initialFailure;
  expect((await unavailable.json()).message).toBe("Terrain sampling workers unavailable");
  await expect(page.locator('[class*="measureCanvasContainer"] canvas')).toBeVisible();
  const profileUnavailable = page.locator('[class*="terrainProfileUnavailable"]');
  await expect(profileUnavailable).toHaveText(
    "Terrain profile unavailable. Check the DEM or try again."
  );
  const initialGeometry = (await measurements(page))[0];
  expect(initialGeometry.distances).toHaveLength(1);
  expect(initialGeometry.distances[0]).toBeGreaterThan(0);
  expect(Number.isFinite(initialGeometry.bearings[0])).toBe(true);

  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  const recoveredResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/terrain-profile?") && response.status() === 200
  );
  const firstVertex = await screenPixelForVertex(page, id, 1);
  await page.mouse.move(firstVertex.x, firstVertex.y);
  await page.mouse.down();
  await page.mouse.move(firstVertex.x + 12, firstVertex.y + 8, { steps: 3 });
  await page.mouse.up();
  await expect
    .poll(async () => (await measurements(page))[0].coordinates[1])
    .not.toEqual(initialGeometry.coordinates[1]);
  await page.getByLabel("Finished", { exact: true }).click();
  expect((await recoveredResponse).ok()).toBe(true);
  const recoveredGeometry = (await measurements(page))[0];
  expect(recoveredGeometry.coordinates[1]).not.toEqual(initialGeometry.coordinates[1]);
  expect(recoveredGeometry.distances[0]).toBeGreaterThan(0);
  await expect(page.locator('[class*="measureCanvasContainer"] canvas')).toBeVisible();
  await expect(page.getByText("Tot Distance (m)", { exact: true })).toBeVisible();
  await expect(profileUnavailable).toHaveCount(0);
  expect(await mission.read()).toEqual(missionDocument);
});
