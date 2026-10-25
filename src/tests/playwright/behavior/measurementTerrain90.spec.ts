import type { Page, Route } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test, expect } from "../fixtures/behavioralTest";

type MeasurementState = {
  id: string;
  coordinates: number[][];
  segmentDistances: number[];
  segmentBearings: number[];
};

async function openMeasurements(page: Page) {
  await page.locator('[data-tooltip-content="Measurements"]').click();
  await expect(page.locator('[data-tooltip-content="Add Temporary Measurement"]')).toBeVisible();
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
            segmentDistances: (feature.get("segmentDistances") as number[]) ?? [],
            segmentBearings: (feature.get("segmentBearings") as number[]) ?? [],
          }));
      });
  });
}

async function featurePixel(page: Page, id: string, vertexIndex?: number) {
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
        const geometry = feature.getGeometry() as LineString;
        const coordinates = geometry.getCoordinates();
        const coordinate =
          vertexIndex == null
            ? [
                (coordinates[0][0] + coordinates[1][0]) / 2,
                (coordinates[0][1] + coordinates[1][1]) / 2,
              ]
            : coordinates[vertexIndex];
        const pixel = map.getPixelFromCoordinate(coordinate);
        const bounds = map.getTargetElement().getBoundingClientRect();
        return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
      }
      throw new Error(`Measurement ${id} is absent`);
    },
    { id, vertexIndex }
  );
}

async function editMeasurement(page: Page) {
  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  await expect(page.getByLabel("Finished", { exact: true })).toBeVisible();
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

async function installDeterministicTerrain(page: Page) {
  await page.route("**/api/v1/terrain-profile?**", async (route: Route) => {
    const input = route.request().postDataJSON() as TerrainProfilePostData;
    const count = input.path.length - 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        message: "",
        data: {
          elevationsMeters: Array.from({ length: count }, () => [
            100, 110, 120, 130, 140, 130, 120, 110, 100,
          ]),
          terrainSlopesDegrees: Array.from({ length: count }, () => [
            12,
            10,
            8,
            6,
            null,
            6,
            8,
            10,
            12,
          ]),
        },
      }),
    });
  });
}

async function installSlopeBoundaryTerrain(page: Page) {
  const slopes = [
    2, 2, 2.001, 2.001, 4, 4, 4.001, 4.001, 8, 8, 8.001, 8.001, 12, 12, 12.001, 12.001, 16, 16,
    16.001, 16.001, 20, 20, 20.001, 20.001, 2, 2,
  ];
  await page.route("**/api/v1/terrain-profile?**", async (route: Route) => {
    const input = route.request().postDataJSON() as TerrainProfilePostData;
    const segmentCount = input.path.length - 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
      }),
    });
  });
}

async function canvasBandPixel(page: Page, fractionOfPath: number, band: "path" | "terrain") {
  return page.locator('[class*="measureCanvasContainer"] canvas').evaluate(
    (element, { fractionOfPath, band }) => {
      if (!(element instanceof HTMLCanvasElement))
        throw new Error("Measurement graph element is not a canvas");
      const canvas = element;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Measurement canvas has no 2D context");
      const drawingWidth = canvas.clientWidth - 85;
      const x = 10 + drawingWidth * fractionOfPath;
      const y = canvas.clientHeight - (band === "path" ? 45 : 35);
      const pixel = context.getImageData(
        Math.round((x * canvas.width) / canvas.clientWidth),
        Math.round((y * canvas.height) / canvas.clientHeight),
        1,
        1
      ).data;
      return `#${[...pixel.slice(0, 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    },
    { fractionOfPath, band }
  );
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
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-measurement.dem";
    doc.description = "measurement isolation baseline";
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.usingLGRSCoordinates = false;
  });
  await installDeterministicTerrain(page);
  const before = await mission.read();
  await mission.open(page);
  await openMeasurements(page);
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements(page)).toHaveLength(1);

  const original = (await measurements(page))[0];
  await editMeasurement(page);
  const insertAt = await featurePixel(page, original.id);
  await page.mouse.click(insertAt.x, insertAt.y);
  await expect.poll(async () => (await measurements(page))[0].coordinates).toHaveLength(3);

  const afterInsert = (await measurements(page))[0];
  const insertedIndex = 1;
  const vertex = await featurePixel(page, original.id, insertedIndex);
  await page.mouse.move(vertex.x, vertex.y);
  await page.mouse.down();
  await page.mouse.move(vertex.x + 70, vertex.y + 35, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await measurements(page))[0].coordinates[insertedIndex])
    .not.toEqual(afterInsert.coordinates[insertedIndex]);

  const moved = (await measurements(page))[0];
  const movedVertex = await featurePixel(page, moved.id, 2);
  await page.mouse.move(movedVertex.x, movedVertex.y);
  await page.mouse.dblclick(movedVertex.x, movedVertex.y);
  await expect.poll(async () => (await measurements(page))[0].coordinates).toHaveLength(2);
  await expect(page.locator('[data-tooltip-content="Add Temporary Measurement"]')).toBeVisible();
  const finishedPath = (await measurements(page))[0].coordinates;
  await page.getByLabel("Finished", { exact: true }).click();
  await expect
    .poll(async () => (await measurements(page))[0].coordinates.length)
    .toBe(finishedPath.length);
  expectCoordinatesClose((await measurements(page))[0].coordinates, finishedPath);
  const finalizedMeasurement = (await measurements(page))[0];
  expect(finalizedMeasurement.segmentDistances).toHaveLength(1);
  expect(finalizedMeasurement.segmentBearings).toHaveLength(1);
  const known = independentDistanceAndBearing(finishedPath, before.planetRadius);
  await expect
    .poll(async () => (await measurements(page))[0].segmentDistances[0])
    .toBeCloseTo(known.distance, 2);
  await expect
    .poll(async () => (await measurements(page))[0].segmentBearings[0])
    .toBeCloseTo(known.bearing, 2);
  const totalDistanceValue = page
    .locator('[class*="timelineHoverValueItem"]')
    .nth(0)
    .locator('[class*="timelineHoverValue"]')
    .last();
  await expect(totalDistanceValue).toHaveText(known.distance.toFixed(0));

  const beforeCanceledEdit = (await measurements(page))[0];
  await editMeasurement(page);
  const endpoint = await featurePixel(page, beforeCanceledEdit.id, 0);
  await page.mouse.move(endpoint.x, endpoint.y);
  await page.mouse.down();
  await page.mouse.move(endpoint.x + 55, endpoint.y - 30, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await measurements(page))[0].coordinates[0])
    .not.toEqual(beforeCanceledEdit.coordinates[0]);
  const editToggle = page.getByLabel("globalEditToggle", { exact: true });
  if ((await editToggle.getAttribute("aria-pressed")) !== "true") await editToggle.click();
  await editToggle.click();
  await expect
    .poll(async () => (await measurements(page))[0].coordinates.length)
    .toBe(beforeCanceledEdit.coordinates.length);
  expectCoordinatesClose((await measurements(page))[0].coordinates, beforeCanceledEdit.coordinates);
  expect(await mission.read()).toEqual(before);
  await page.locator('[data-tooltip-content="Remove Measurement"]').click();
  await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(0);
  await expect.poll(() => measurements(page)).toHaveLength(0);
});

test("known segmented terrain profile drives distance and slope display without changing the mission", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-golden-profile.dem";
    doc.description = "profile isolation baseline";
  });
  await installDeterministicTerrain(page);
  const before = await mission.read();
  await mission.open(page);
  await openMeasurements(page);
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements(page)).toHaveLength(1);

  const first = (await measurements(page))[0];
  await editMeasurement(page);
  const midpoint = await featurePixel(page, first.id);
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect.poll(async () => (await measurements(page))[0].coordinates).toHaveLength(3);
  await page.getByLabel("Finished", { exact: true }).click();
  await expect(page.locator('[class*="measureCanvasContainer"] canvas')).toBeVisible();
  await expect.poll(async () => (await measurements(page))[0].segmentDistances.length).toBe(2);
  await expect(page.getByText("Tot Distance (m)", { exact: true })).toBeVisible();
  await expect(page.getByText("Path Grade (°)", { exact: true })).toBeVisible();
  await expect(page.getByText("Terrain Slope (°)", { exact: true })).toBeVisible();
  const profileGraph = page.locator('[class*="measureCanvasContainer"] canvas');
  expect((await profileGraph.screenshot()).byteLength).toBeGreaterThan(1000);
  const distances = (await measurements(page))[0].segmentDistances;
  expect(distances).toHaveLength(2);
  const graphBounds = await profileGraph.boundingBox();
  expect(graphBounds).not.toBeNull();
  const hoverValues = page.locator('[class*="timelineHoverValueItem"]');
  const displayedValue = (index: number) =>
    hoverValues.nth(index).locator('[class*="timelineHoverValue"]').last();
  const hoverSample = async (fractionAlongFirstSegment: number) => {
    const bounds = graphBounds!;
    const totalDistance = distances[0] + distances[1];
    const drawingWidth = bounds.width - 85;
    const x =
      bounds.x + 10 + drawingWidth * ((distances[0] * fractionAlongFirstSegment) / totalDistance);
    await page.mouse.move(x, bounds.y + 50);
  };

  await hoverSample(0.25);
  await expect(displayedValue(0)).toHaveText((distances[0] + distances[1]).toFixed(0));
  await expect(displayedValue(1)).toHaveText((distances[0] * 0.25).toFixed(0));
  await expect(displayedValue(2)).toHaveText("20");
  await expect(displayedValue(4)).toHaveText("8.0");
  const uphillGrade = Number(await displayedValue(3).innerText());
  const expectedGrade = (Math.atan(10 / (distances[0] / 8)) * 180) / Math.PI;
  expect(uphillGrade).toBeCloseTo(expectedGrade, 1);

  await hoverSample(0.5);
  await expect(displayedValue(2)).toHaveText("40");
  await expect(displayedValue(4)).toHaveText("—");
  await hoverSample(0.75);
  await expect(displayedValue(2)).toHaveText("20");
  expect(Number(await displayedValue(4).innerText())).toBeCloseTo(8, 0);
  const downhillGrade = Number(await displayedValue(3).innerText());
  expect(downhillGrade).toBeCloseTo(-expectedGrade, 1);
  expect(await mission.read()).toEqual(before);
});

test("signed path grades stay distinct from terrain slope at inclusive color boundaries", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "playwright-slope-boundaries.dem";
  });
  await installSlopeBoundaryTerrain(page);
  await mission.open(page);
  await openMeasurements(page);
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements(page)).toHaveLength(1);
  const initial = (await measurements(page))[0];
  await editMeasurement(page);
  const midpoint = await featurePixel(page, initial.id);
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect.poll(async () => (await measurements(page))[0].coordinates).toHaveLength(3);
  await page.getByLabel("Finished", { exact: true }).click();
  await expect.poll(async () => (await measurements(page))[0].segmentDistances.length).toBe(2);

  const graph = page.locator('[class*="measureCanvasContainer"] canvas');
  const bounds = await graph.boundingBox();
  expect(bounds).not.toBeNull();
  const segmentDistances = (await measurements(page))[0].segmentDistances;
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

  const hoverValues = page.locator('[class*="timelineHoverValueItem"]');
  const displayedValue = (index: number) =>
    hoverValues.nth(index).locator('[class*="timelineHoverValue"]').last();
  await page.mouse.move(bounds!.x + 10 + (bounds!.width - 85) * midClassFraction, bounds!.y + 50);
  await expect(displayedValue(4)).toHaveText("8.0");
  const uphillPathGrade = Number(await displayedValue(3).innerText());
  expect(uphillPathGrade).toBeGreaterThan(20);
  await page.mouse.move(bounds!.x + 10 + (bounds!.width - 85) * downClassFraction, bounds!.y + 50);
  await expect(displayedValue(4)).toHaveText("8.0");
  const downhillPathGrade = Number(await displayedValue(3).innerText());
  expect(downhillPathGrade).toBeLessThan(-20);
});

test("older terrain responses cannot replace a newer edited profile or cross a mission switch", async ({
  page,
  request,
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
  await page.route("**/api/v1/terrain-profile?**", async (route) => {
    const input = route.request().postDataJSON() as TerrainProfilePostData;
    const pathSignature = JSON.stringify(input.path);
    const count = input.path.length - 1;
    const respond = async (elevation: number) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          message: "",
          data: {
            elevationsMeters: Array.from({ length: count }, () => [elevation, elevation + 5]),
            terrainSlopesDegrees: Array.from({ length: count }, () => [4, 4]),
          },
        }),
      });
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
  });

  await mission.open(page);
  await openMeasurements(page);
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect.poll(() => measurements(page)).toHaveLength(1);
  const original = (await measurements(page))[0];
  await editMeasurement(page);
  const endpoint = await featurePixel(page, original.id, 0);
  await page.mouse.move(endpoint.x, endpoint.y);
  await page.mouse.down();
  await page.mouse.move(endpoint.x + 45, endpoint.y + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => releaseOutOfOrder).toBeDefined();

  const secondEndpoint = await featurePixel(page, original.id, 1);
  await page.mouse.move(secondEndpoint.x, secondEndpoint.y);
  await page.mouse.down();
  await page.mouse.move(secondEndpoint.x - 35, secondEndpoint.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => newerResponses).toBeGreaterThan(0);
  const graph = page.locator('[class*="measureCanvasContainer"] canvas');
  const newestProfile = await graph.screenshot();
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/terrain-profile?") && response.request().method() === "POST"
  );
  releaseOutOfOrder?.();
  await staleResponse;
  await expect.poll(async () => (await graph.screenshot()).equals(newestProfile)).toBe(true);

  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(2);
  await editMeasurement(page);
  holdMeasurementDelete = true;
  const deletable = (await measurements(page))[0];
  const deleteEndpoint = await featurePixel(page, deletable.id, 0);
  await page.mouse.move(deleteEndpoint.x, deleteEndpoint.y);
  await page.mouse.down();
  await page.mouse.move(deleteEndpoint.x + 25, deleteEndpoint.y + 15, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => releaseMeasurementDelete).toBeDefined();
  await page.locator('[data-tooltip-content="Remove Measurement"]').last().click();
  await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(1);
  const deletedMeasurementResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/terrain-profile?") && response.request().method() === "POST"
  );
  releaseMeasurementDelete?.();
  await deletedMeasurementResponse;
  await expect.poll(() => measurements(page)).toHaveLength(0);
  await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(1);

  const create = await request.post("/api/v1/missionAutomerge", { data: {} });
  expect(create.ok()).toBe(true);
  const extraId = (await create.json()).data.missionId as number;
  const name = `Measure stale switch ${extraId}`;
  try {
    expect(
      (
        await request.post("/api/v1/missionAutomerge/fields", {
          data: { missionId: extraId, fields: { name } },
        })
      ).ok()
    ).toBe(true);
    holdMissionSwitch = true;
    await page
      .locator('[class*="measureTabContainer"]')
      .first()
      .locator('svg[data-icon="ruler"]')
      .click();
    await editMeasurement(page);
    const switchEndpoint = await featurePixel(page, original.id, 0);
    await page.mouse.move(switchEndpoint.x, switchEndpoint.y);
    await page.mouse.down();
    await page.mouse.move(switchEndpoint.x + 30, switchEndpoint.y - 20, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => releaseMissionSwitch).toBeDefined();
    await page.locator('svg[data-icon="bars"]').click();
    await page
      .locator("tr")
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(name);
    await openMeasurements(page);
    await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(0);
    expect(releaseMissionSwitch).toBeDefined();
    const switchResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/terrain-profile?") &&
        response.request().method() === "POST"
    );
    releaseMissionSwitch?.();
    await switchResponse;
    await expect(page.locator('[class*="measureTabContainer"]')).toHaveCount(0);
  } finally {
    expect(
      (await request.delete("/api/v1/missionAutomerge", { data: { missionIds: [extraId] } })).ok()
    ).toBe(true);
  }
});
