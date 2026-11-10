import { exactText } from "./browserAssertions";
import { commands } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { selectPlanningEva } from "./planningHelpers";
import { measurements, featurePixel, openMeasurements } from "./measurementHelpers";

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
    .getBySelector("../..")
    .getBySelector('[class*="displayFieldValue"]');
}

function projectedToGeographic([x, y]: number[]) {
  const radiansToDegrees = 180 / Math.PI;
  return {
    lng: (x / earthRadiusMeters) * radiansToDegrees,
    lat: ((2 * Math.atan(Math.exp(y / earthRadiusMeters)) - Math.PI / 2) * 180) / Math.PI,
  };
}

function independentDistanceAndBearing(
  start: GeographicPoint,
  end: GeographicPoint,
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

function knownPointPixel({ lat, lng }: AEGISPoint) {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  if (!map) throw new Error("Editor map unavailable");
  const radius = 6378137;
  const radians = Math.PI / 180;
  const pixel = map.getPixelFromCoordinate([
    radius * lng * radians,
    radius * Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2)),
  ]);
  const bounds = map.getTargetElement().getBoundingClientRect();
  return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
}
async function dragVertex(id: string, index: number, target: BrowserScreenPoint) {
  const start = featurePixel(id, index);
  await commands.mapPointer("move", start.x, start.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", target.x, target.y, 8);
  await commands.mapPointer("up");
}

for (const { name, radius } of [
  { name: "Earth", radius: earthRadiusMeters },
  { name: "Moon", radius: 1_737_400 },
]) {
  test(`${name} measurement geodesy matches a known pair near the pole`, async ({
    page,
    mission,
    requestHandlers,
  }) => {
    await mission.change((doc) => {
      doc.planetRadius = radius;
      doc.landerLocation = knownPolarPath[0];
      doc.initialZoom = 17;
      doc.projIsCustom = false;
      doc.projEpsg = "EPSG:3857";
      doc.usingLGRSCoordinates = false;
      doc.demFilePath = "synthetic-profile.tif";
      const traverse = doc.traverses[mission.ids.traverseA];
      traverse.path = [
        knownPolarPath[0],
        knownPolarPath[1],
        { lat: 89.90002, lng: 0.00002 },
        { lat: 89.90003, lng: 0.00003 },
      ];
      traverse.pathSegmentDistances = [100, 100, 100];
    });
    requestHandlers["/api/v1/terrain-profile/batch"] = (_url, init) => {
      const profiles = JSON.parse(String(init.body)).profiles as TerrainProfilePostData[];
      return Response.json({
        status: "success",
        data: profiles.map((profile) => ({
          status: "success",
          data: {
            elevationsMeters:
              profile.entityUuid === mission.ids.traverseA
                ? disconnectedElevations
                : profile.pathSegmentDistances.map(() => [0, 0]),
            terrainSlopesDegrees: profile.pathSegmentDistances.map(() => [0, 0]),
          },
        })),
      });
    };
    const missionDocument = await mission.read();
    await mission.open();
    await openMeasurements(page);
    await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => measurements()).toHaveLength(1);
    const id = (await measurements())[0].id;

    await page.getByLabelText("Edit Path on Map", { exact: true }).click();
    await dragVertex(id, 0, await knownPointPixel(knownPolarPath[0]));
    await dragVertex(id, 1, await knownPointPixel(knownPolarPath[1]));
    await page.getByLabelText("Finished", { exact: true }).click();

    await expect.poll(async () => (await measurements())[0].segmentDistances).toHaveLength(1);
    const measurement = (await measurements())[0];
    expect(measurement.coordinates).toHaveLength(2);
    const actualGeographic = measurement.coordinates.map(projectedToGeographic);
    for (const [index, point] of actualGeographic.entries()) {
      expect(point.lat).toBeCloseTo(knownPolarPath[index].lat, 6);
      expect(point.lng).toBeCloseTo(knownPolarPath[index].lng, 6);
    }
    const expected = independentDistanceAndBearing(knownPolarPath[0], knownPolarPath[1], radius);
    await expect
      .poll(async () => (await measurements())[0].segmentDistances[0])
      .toBeCloseTo(expected.distance, 2);
    await expect
      .poll(async () => (await measurements())[0].segmentBearings[0])
      .toBeCloseTo(expected.bearing, 1);
    await expect
      .element(
        page
          .getBySelector('[class*="timelineHoverValueItem"]')
          .nth(0)
          .getBySelector('[class*="timelineHoverValue"]')
          .last()
      )
      .toMatchTextContent(exactText(expected.distance.toFixed(0)));
    await selectPlanningEva(page, "Survey Alpha");
    await page
      .getByLabelText("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await page.getByLabelText("info_panel", { exact: true }).click();
    const { ascent, descent } = independentAscentDescent(disconnectedElevations);
    expect({ ascent, descent }).toEqual({ ascent: 15, descent: 10 });
    await expect.element(total(page, "Ascent (m):")).toMatchTextContent(exactText(String(ascent)));
    await expect
      .element(total(page, "Descent (m):"))
      .toMatchTextContent(exactText(String(descent)));
    expect(await mission.read()).toEqual(missionDocument);
  });
}

test("terrain profile errors retain a usable measurement and recover after the worker responds", async ({
  page,
  requestHandlers,
  mission,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "worker-unavailable-test.tif";
    doc.demResolution = 10;
  });
  let profileRequestCount = 0;
  requestHandlers["/api/v1/terrain-profile"] = (_url, init) => {
    profileRequestCount += 1;
    if (profileRequestCount === 1)
      return Response.json(
        { status: "error", message: "Terrain sampling workers unavailable" },
        { status: 503 }
      );
    const profileRequest = JSON.parse(String(init.body)) as TerrainProfilePostData;
    const segmentCount = profileRequest.path.length - 1;
    return Response.json({
      status: "success",
      data: {
        elevationsMeters: Array.from({ length: segmentCount }, () => [100, 110]),
        terrainSlopesDegrees: Array.from({ length: segmentCount }, () => [1, 1]),
      },
    });
  };
  const missionDocument = await mission.read();
  await mission.open();
  await openMeasurements(page);
  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements()).toHaveLength(1);
  const id = (await measurements())[0].id;
  expect(profileRequestCount).toBe(1);
  await expect
    .element(page.getBySelector('[class*="measureCanvasContainer"] canvas'))
    .toBeVisible();
  const profileUnavailable = page.getBySelector('[class*="terrainProfileUnavailable"]');
  await expect
    .element(profileUnavailable)
    .toMatchTextContent(exactText("Terrain profile unavailable. Check the DEM or try again."));
  const initialGeometry = (await measurements())[0];
  expect(initialGeometry.segmentDistances).toHaveLength(1);
  expect(initialGeometry.segmentDistances[0]).toBeGreaterThan(0);
  expect(Number.isFinite(initialGeometry.segmentBearings[0])).toBe(true);

  await page.getByLabelText("Edit Path on Map", { exact: true }).click();
  const firstVertex = await featurePixel(id, 1);
  await commands.mapPointer("move", firstVertex.x, firstVertex.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", firstVertex.x + 12, firstVertex.y + 8, 3);
  await commands.mapPointer("up");
  await expect
    .poll(async () => (await measurements())[0].coordinates[1])
    .not.toEqual(initialGeometry.coordinates[1]);
  await page.getByLabelText("Finished", { exact: true }).click();
  expect(profileRequestCount).toBeGreaterThan(1);
  const recoveredGeometry = (await measurements())[0];
  expect(recoveredGeometry.coordinates[1]).not.toEqual(initialGeometry.coordinates[1]);
  expect(recoveredGeometry.segmentDistances[0]).toBeGreaterThan(0);
  await expect
    .element(page.getBySelector('[class*="measureCanvasContainer"] canvas'))
    .toBeVisible();
  await expect.element(page.getByText("Tot Distance (m)", { exact: true })).toBeVisible();
  await expect.poll(() => profileUnavailable.length).toBe(0);
  expect(await mission.read()).toEqual(missionDocument);
});
