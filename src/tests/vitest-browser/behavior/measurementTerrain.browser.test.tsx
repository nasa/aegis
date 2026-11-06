import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { commands } from "vitest/browser";
import { test, expect } from "./missionHarness";
import {
  openMeasurements,
  measurements,
  featurePixel,
  editMeasurement,
} from "./measurementHelpers";

async function hoverGraphAtDistance(
  page: Page,
  pathFraction: number,
  distanceMeters: number
): Promise<void> {
  const graph = page.getBySelector('[class*="measureCanvasContainer"] canvas');
  const distance = page
    .getBySelector('[class*="timelineHoverValueItem"]')
    .nth(1)
    .getBySelector('[class*="timelineHoverValue"]')
    .last();
  let pointerMoves = 0;
  // The canvas drops trailing hover events; retry a native movement until this sample is displayed.
  await expect
    .poll(async () => {
      const bounds = graph.element().getBoundingClientRect();
      await commands.mapPointer(
        "move",
        bounds.x + 10 + (bounds.width - 85) * pathFraction,
        bounds.y + 50 + (pointerMoves++ % 2)
      );
      return distance.element().textContent;
    })
    .toBe(distanceMeters.toFixed(0));
}

function expectCoordinatesClose(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  for (const [pointIndex, point] of actual.entries()) {
    expect(point).toHaveLength(expected[pointIndex].length);
    for (const [axisIndex, coordinate] of point.entries())
      expect(coordinate).toBeCloseTo(expected[pointIndex][axisIndex], 7);
  }
}

function projectedToAegisPoint([x, y]: number[]): AEGISPoint {
  const radius = 6_378_137;
  return {
    lat: ((2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180) / Math.PI,
    lng: (x / radius) * (180 / Math.PI),
  };
}

function independentDistanceAndBearing(projectedPath: number[][], planetRadius: number) {
  const [start, end] = projectedPath.map(projectedToAegisPoint);
  const radians = Math.PI / 180;
  const startLat = start.lat * radians;
  const endLat = end.lat * radians;
  const deltaLat = (end.lat - start.lat) * radians;
  const deltaLng = (end.lng - start.lng) * radians;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  const distance = planetRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { distance, bearing };
}

const deterministicTerrain: BrowserRequestHandler = (_url, init) => {
  const input = JSON.parse(String(init.body)) as TerrainProfilePostData;
  const count = input.path.length - 1;
  return Response.json({
    status: "success",
    message: "",
    data: {
      elevationsMeters: Array.from({ length: count }, () => [
        100, 110, 120, 130, 140, 130, 120, 110, 100,
      ]),
      terrainSlopesDegrees: Array.from({ length: count }, () => [12, 10, 8, 6, null, 6, 8, 10, 12]),
    },
  });
};

const slopeBoundaryTerrain: BrowserRequestHandler = (_url, init) => {
  const slopes = [
    2, 2, 2.001, 2.001, 4, 4, 4.001, 4.001, 8, 8, 8.001, 8.001, 12, 12, 12.001, 12.001, 16, 16,
    16.001, 16.001, 20, 20, 20.001, 20.001, 2, 2,
  ];
  const input = JSON.parse(String(init.body)) as TerrainProfilePostData;
  const segmentCount = input.path.length - 1;
  return Response.json({
    status: "success",
    message: "",
    data: {
      elevationsMeters: Array.from({ length: segmentCount }, (_, segmentIndex) =>
        slopes.map((_, sampleIndex) =>
          segmentIndex === 0 ? 100 + sampleIndex * 5 : 100 + (slopes.length - sampleIndex) * 5
        )
      ),
      terrainSlopesDegrees: Array.from({ length: segmentCount }, () => slopes),
    },
  });
};

function canvasBandPixel(page: Page, fractionOfPath: number, band: "path" | "terrain") {
  const canvas = page.getBySelector('[class*="measureCanvasContainer"] canvas').element();
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected measurement canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Measurement canvas has no 2D context");
  const x = 10 + (canvas.clientWidth - 85) * fractionOfPath;
  const y = canvas.clientHeight - (band === "path" ? 45 : 35);
  const pixel = context.getImageData(
    Math.round((x * canvas.width) / canvas.clientWidth),
    Math.round((y * canvas.height) / canvas.clientHeight),
    1,
    1
  ).data;
  return `#${[...pixel.slice(0, 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function expectCanvasColorNear(actual: string, expected: string, tolerance: number) {
  const channels = (color: string) =>
    color
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16));
  const actualChannels = channels(actual);
  const expectedChannels = channels(expected);
  for (const index of [0, 1, 2])
    expect(Math.abs(actualChannels[index] - expectedChannels[index])).toBeLessThanOrEqual(
      tolerance
    );
}

test("measurement editing inserts, drags and removes vertices, and cancel restores the original local path", async ({
  page,
  mission,
  requestHandlers,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-measurement.dem";
    doc.description = "measurement isolation baseline";
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.usingLGRSCoordinates = false;
  });
  requestHandlers["/api/v1/terrain-profile"] = deterministicTerrain;
  const before = await mission.read();
  await mission.open();
  await openMeasurements(page);
  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements()).toHaveLength(1);

  const original = (await measurements())[0];
  await editMeasurement(page);
  const insertAt = await featurePixel(original.id);
  await commands.mapPointer("click", insertAt.x, insertAt.y);
  await expect.poll(async () => (await measurements())[0].coordinates).toHaveLength(3);

  const afterInsert = (await measurements())[0];
  const insertedIndex = 1;
  const vertex = await featurePixel(original.id, insertedIndex);
  await commands.mapPointer("move", vertex.x, vertex.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", vertex.x + 70, vertex.y + 35, 5);
  await commands.mapPointer("up");
  await expect
    .poll(async () => (await measurements())[0].coordinates[insertedIndex])
    .not.toEqual(afterInsert.coordinates[insertedIndex]);

  const moved = (await measurements())[0];
  const movedVertex = await featurePixel(moved.id, 2);
  await commands.mapPointer("move", movedVertex.x, movedVertex.y);
  await commands.mapPointer("dblclick", movedVertex.x, movedVertex.y);
  await expect.poll(async () => (await measurements())[0].coordinates).toHaveLength(2);
  await expect
    .element(page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]'))
    .toBeVisible();
  const finishedPath = (await measurements())[0].coordinates;
  await page.getByLabelText("Finished", { exact: true }).click();
  await expect
    .poll(async () => (await measurements())[0].coordinates.length)
    .toBe(finishedPath.length);
  expectCoordinatesClose((await measurements())[0].coordinates, finishedPath);
  const finalizedMeasurement = (await measurements())[0];
  expect(finalizedMeasurement.segmentDistances).toHaveLength(1);
  expect(finalizedMeasurement.segmentBearings).toHaveLength(1);
  const known = independentDistanceAndBearing(finishedPath, before.planetRadius);
  await expect
    .poll(async () => (await measurements())[0].segmentDistances[0])
    .toBeCloseTo(known.distance, 2);
  await expect
    .poll(async () => (await measurements())[0].segmentBearings[0])
    .toBeCloseTo(known.bearing, 2);
  const totalDistanceValue = page
    .getBySelector('[class*="timelineHoverValueItem"]')
    .nth(0)
    .getBySelector('[class*="timelineHoverValue"]')
    .last();
  await expect.element(totalDistanceValue).toHaveTextContent(exactText(known.distance.toFixed(0)));

  const beforeCanceledEdit = (await measurements())[0];
  await editMeasurement(page);
  const endpoint = await featurePixel(beforeCanceledEdit.id, 0);
  await commands.mapPointer("move", endpoint.x, endpoint.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", endpoint.x + 55, endpoint.y - 30, 5);
  await commands.mapPointer("up");
  await expect
    .poll(async () => (await measurements())[0].coordinates[0])
    .not.toEqual(beforeCanceledEdit.coordinates[0]);
  const editToggle = page.getByLabelText("globalEditToggle", { exact: true });
  if (editToggle.element().getAttribute("aria-pressed") !== "true") await editToggle.click();
  await editToggle.click();
  await expect
    .poll(async () => (await measurements())[0].coordinates.length)
    .toBe(beforeCanceledEdit.coordinates.length);
  expectCoordinatesClose((await measurements())[0].coordinates, beforeCanceledEdit.coordinates);
  expect(await mission.read()).toEqual(before);
  await page.getBySelector('[data-tooltip-content="Remove Measurement"]').click();
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(0);
  await expect.poll(() => measurements()).toHaveLength(0);
});

test("known segmented terrain profile drives distance and slope display without changing the mission", async ({
  page,
  mission,
  requestHandlers,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-golden-profile.dem";
    doc.initialZoom = 18;
    doc.description = "profile isolation baseline";
  });
  requestHandlers["/api/v1/terrain-profile"] = deterministicTerrain;
  const before = await mission.read();
  await mission.open();
  await openMeasurements(page);
  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements()).toHaveLength(1);

  const first = (await measurements())[0];
  await editMeasurement(page);
  const midpoint = await featurePixel(first.id);
  await commands.mapPointer("click", midpoint.x, midpoint.y);
  await expect.poll(async () => (await measurements())[0].coordinates).toHaveLength(3);
  await page.getByLabelText("Finished", { exact: true }).click();
  await expect
    .element(page.getBySelector('[class*="measureCanvasContainer"] canvas'))
    .toBeVisible();
  await expect.poll(async () => (await measurements())[0].segmentDistances.length).toBe(2);
  await expect.element(page.getByText("Tot Distance (m)", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Path Grade (°)", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Terrain Slope (°)", { exact: true })).toBeVisible();
  const profileGraph = page.getBySelector('[class*="measureCanvasContainer"] canvas');
  expect((await profileGraph.screenshot({ base64: true })).base64.length).toBeGreaterThan(1000);
  const distances = (await measurements())[0].segmentDistances;
  expect(distances).toHaveLength(2);
  const hoverValues = page.getBySelector('[class*="timelineHoverValueItem"]');
  const displayedValue = (index: number) =>
    hoverValues.nth(index).getBySelector('[class*="timelineHoverValue"]').last();
  const hoverSample = (fractionAlongFirstSegment: number) => {
    const distance = distances[0] * fractionAlongFirstSegment;
    return hoverGraphAtDistance(page, distance / (distances[0] + distances[1]), distance);
  };

  await hoverSample(0.25);
  await expect
    .element(displayedValue(0))
    .toHaveTextContent(exactText((distances[0] + distances[1]).toFixed(0)));
  await expect
    .element(displayedValue(1))
    .toHaveTextContent(exactText((distances[0] * 0.25).toFixed(0)));
  await expect.element(displayedValue(2)).toHaveTextContent(exactText("20"));
  await expect.element(displayedValue(4)).toHaveTextContent(exactText("8.0"));
  const sampleSpacing = distances[0] / 8;
  // The 10 m grade window includes adjacent samples on the straight ascent.
  expect(sampleSpacing).toBeGreaterThan(2.5);
  expect(sampleSpacing).toBeLessThan(5);
  const expectedGrade = (Math.atan(10 / sampleSpacing) * 180) / Math.PI;
  await expect
    .poll(() => Number(displayedValue(3).element().textContent))
    .toBeCloseTo(expectedGrade, 1);

  await hoverSample(0.5);
  await expect.element(displayedValue(2)).toHaveTextContent(exactText("40"));
  await expect.element(displayedValue(4)).toHaveTextContent(exactText("—"));
  await hoverSample(0.75);
  await expect.element(displayedValue(2)).toHaveTextContent(exactText("20"));
  await expect.poll(() => Number(displayedValue(4).element().textContent)).toBeCloseTo(8, 0);
  await expect
    .poll(() => Number(displayedValue(3).element().textContent))
    .toBeCloseTo(-expectedGrade, 1);
  expect(await mission.read()).toEqual(before);
});

test("signed path grades stay distinct from terrain slope at inclusive color boundaries", async ({
  page,
  mission,
  requestHandlers,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-slope-boundaries.dem";
  });
  requestHandlers["/api/v1/terrain-profile"] = slopeBoundaryTerrain;
  await mission.open();
  await openMeasurements(page);
  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements()).toHaveLength(1);
  const initial = (await measurements())[0];
  await editMeasurement(page);
  const midpoint = await featurePixel(initial.id);
  await commands.mapPointer("click", midpoint.x, midpoint.y);
  await expect.poll(async () => (await measurements())[0].coordinates).toHaveLength(3);
  await page.getByLabelText("Finished", { exact: true }).click();
  await expect.poll(async () => (await measurements())[0].segmentDistances.length).toBe(2);

  const segmentDistances = (await measurements())[0].segmentDistances;
  const total = segmentDistances[0] + segmentDistances[1];
  const intervalsPerSegment = 25;
  const classes = [
    "#313695",
    "#4575b4",
    "#4575b4",
    "#74add1",
    "#abd9e9",
    "#e0f3f8",
    "#ffffbf",
    "#fee090",
    "#fdae61",
    "#f46d43",
    "#d73027",
    "#301f42",
  ];
  for (const [classIndex, expectedColor] of classes.entries()) {
    const sampleInterval = classIndex * 2;
    const withinSegment = (sampleInterval + 0.5) / intervalsPerSegment;
    const pathFraction = (segmentDistances[0] / total) * withinSegment;
    expect(
      await canvasBandPixel(page, pathFraction, "terrain"),
      `terrain class ${classIndex} at sample pair ${sampleInterval}`
    ).toBe(expectedColor);
  }

  const midClassFraction = (8.5 / intervalsPerSegment) * (segmentDistances[0] / total);
  const uphillBandColor = await canvasBandPixel(page, midClassFraction, "path");
  expectCanvasColorNear(uphillBandColor, "#301f42", 20);
  expect(uphillBandColor).not.toBe(await canvasBandPixel(page, midClassFraction, "terrain"));
  const downClassFraction =
    segmentDistances[0] / total + (8.5 / intervalsPerSegment) * (segmentDistances[1] / total);
  expectCanvasColorNear(await canvasBandPixel(page, downClassFraction, "path"), "#301f42", 20);

  const hoverValues = page.getBySelector('[class*="timelineHoverValueItem"]');
  const displayedValue = (index: number) =>
    hoverValues.nth(index).getBySelector('[class*="timelineHoverValue"]').last();
  await hoverGraphAtDistance(page, midClassFraction, total * midClassFraction);
  await expect.element(displayedValue(4)).toHaveTextContent(exactText("8.0"));
  await expect.poll(() => Number(displayedValue(3).element().textContent)).toBeGreaterThan(20);
  await hoverGraphAtDistance(page, downClassFraction, total * downClassFraction);
  await expect.element(displayedValue(4)).toHaveTextContent(exactText("8.0"));
  await expect.poll(() => Number(displayedValue(3).element().textContent)).toBeLessThan(-20);
});

test("older terrain responses cannot replace a newer edited profile or cross a mission switch", async ({
  page,
  requestHandlers,
  mission,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-race-profile.dem";
  });
  let originalPath: string | undefined;
  let firstEditedPath: string | undefined;
  let releaseOutOfOrder: (() => void) | undefined;
  let releaseMeasurementDelete: (() => void) | undefined;
  let releaseMissionSwitch: (() => void) | undefined;
  let newerResponses = 0;
  let holdMeasurementDelete = false;
  let holdMissionSwitch = false;
  let responses = 0;
  requestHandlers["/api/v1/terrain-profile"] = async (_url, init) => {
    const input = JSON.parse(String(init.body)) as TerrainProfilePostData;
    const pathSignature = JSON.stringify(input.path);
    const count = input.path.length - 1;
    const respond = (elevation: number) => {
      responses += 1;
      return Response.json({
        status: "success",
        data: {
          elevationsMeters: Array.from({ length: count }, () => [elevation, elevation + 5]),
          terrainSlopesDegrees: Array.from({ length: count }, () => [4, 4]),
        },
      });
    };
    if (!originalPath) {
      originalPath = pathSignature;
      return respond(10);
    }
    if (holdMeasurementDelete) {
      holdMeasurementDelete = false;
      await new Promise<void>((resolve) => {
        releaseMeasurementDelete = () => resolve();
      });
      return respond(40);
    }
    if (holdMissionSwitch) {
      holdMissionSwitch = false;
      await new Promise<void>((resolve) => {
        releaseMissionSwitch = () => resolve();
      });
      return respond(30);
    }
    if (!firstEditedPath && pathSignature !== originalPath) {
      firstEditedPath = pathSignature;
      await new Promise<void>((resolve) => {
        releaseOutOfOrder = () => resolve();
      });
      return respond(20);
    }
    if (pathSignature !== firstEditedPath) newerResponses += 1;
    return respond(80);
  };

  await mission.open();
  await openMeasurements(page);
  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements()).toHaveLength(1);
  const original = (await measurements())[0];
  await editMeasurement(page);
  const endpoint = await featurePixel(original.id, 0);
  await commands.mapPointer("move", endpoint.x, endpoint.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", endpoint.x + 45, endpoint.y + 25, 5);
  await commands.mapPointer("up");
  await expect.poll(() => releaseOutOfOrder).toBeDefined();

  const secondEndpoint = await featurePixel(original.id, 1);
  await commands.mapPointer("move", secondEndpoint.x, secondEndpoint.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", secondEndpoint.x - 35, secondEndpoint.y + 30, 5);
  await commands.mapPointer("up");
  await expect.poll(() => newerResponses).toBeGreaterThan(0);
  const graph = page.getBySelector('[class*="measureCanvasContainer"] canvas');
  const image = () => (graph.element() as HTMLCanvasElement).toDataURL();
  const newestProfile = image();
  const beforeStale = responses;
  releaseOutOfOrder?.();
  await expect.poll(() => responses).toBeGreaterThan(beforeStale);
  await expect.poll(image).toBe(newestProfile);

  await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(2);
  await editMeasurement(page);
  holdMeasurementDelete = true;
  const deletable = (await measurements())[0];
  const deleteEndpoint = await featurePixel(deletable.id, 0);
  await commands.mapPointer("move", deleteEndpoint.x, deleteEndpoint.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", deleteEndpoint.x + 25, deleteEndpoint.y + 15, 4);
  await commands.mapPointer("up");
  await expect.poll(() => releaseMeasurementDelete).toBeDefined();
  await page.getBySelector('[data-tooltip-content="Remove Measurement"]').last().click();
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(1);
  const beforeDelete = responses;
  releaseMeasurementDelete?.();
  await expect.poll(() => responses).toBeGreaterThan(beforeDelete);
  await expect.poll(() => measurements()).toHaveLength(0);
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(1);

  const other = await mission.addMission("Measure stale switch");
  requestHandlers["/api/v1/missionHomepageItems"] = async () =>
    Response.json({
      status: "success",
      data: [
        { id: mission.id, name: mission.name, runningRex: null },
        { id: other.id, name: other.name, runningRex: null },
      ],
    });
  requestHandlers["/api/v1/version"] = () =>
    Response.json({
      version: __APP_VERSION__,
      gitCommit: __GIT_COMMIT__,
      serverEpochUuid: "browser-test-epoch",
    });
  const name = other.name;
  holdMissionSwitch = true;
  await page
    .getBySelector('[class*="measureTabContainer"]')
    .first()
    .getBySelector('svg[data-icon="ruler"]')
    .click();
  await editMeasurement(page);
  const switchEndpoint = await featurePixel(original.id, 0);
  await commands.mapPointer("move", switchEndpoint.x, switchEndpoint.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", switchEndpoint.x + 30, switchEndpoint.y - 20, 5);
  await commands.mapPointer("up");
  await expect.poll(() => releaseMissionSwitch).toBeDefined();
  await page.getBySelector('svg[data-icon="bars"]').click();
  await page
    .getBySelector("tr")
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole("button", { name: "Select", exact: true })
    .click();
  await expect
    .element(page.getByLabelText("missionNameHeader", { exact: true }))
    .toHaveTextContent(exactText(name));
  await openMeasurements(page);
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(0);
  expect(releaseMissionSwitch).toBeDefined();
  const beforeSwitch = responses;
  releaseMissionSwitch?.();
  await expect.poll(() => responses).toBeGreaterThan(beforeSwitch);
  await expect.poll(() => page.getBySelector('[class*="measureTabContainer"]').length).toBe(0);
});
