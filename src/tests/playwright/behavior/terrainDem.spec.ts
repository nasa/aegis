import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeArrayBuffer } from "geotiff";
import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test, expect } from "../fixtures/behavioralTest";

const demFile = "coverage90-measurement-synthetic.tif";
const raster = {
  width: 64,
  height: 32,
  originX: -320,
  originY: 160,
  pixelSize: 10,
  noData: 0,
};
const knownSamples = [
  { column: 27, elevation: 120, slope: 0 },
  { column: 30, elevation: 130, slope: 45 },
  { column: 34, elevation: 170, slope: 45 },
  { column: 42, elevation: 230, slope: 0 },
];

function cellCenter(column: number, row: number) {
  const radius = 6_378_137;
  const radiansToDegrees = 180 / Math.PI;
  const x = raster.originX + (column + 0.5) * raster.pixelSize;
  const y = raster.originY - (row + 0.5) * raster.pixelSize;
  return {
    lng: (x / radius) * radiansToDegrees,
    lat: ((2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180) / Math.PI,
  };
}

async function createSyntheticDem(directory: string) {
  await mkdir(directory, { recursive: true });
  const pixels = new Uint8Array(raster.width * raster.height);
  for (let row = 0; row < raster.height; row++) {
    for (let column = 0; column < raster.width; column++) {
      const value =
        column === 32
          ? raster.noData
          : column < 30
            ? 120
            : column <= 31
              ? 120 + (column - 29) * 10
              : column <= 40
                ? 160 + (column - 33) * 10
                : 230;
      pixels[row * raster.width + column] = value;
    }
  }

  const bytes = await writeArrayBuffer(pixels, {
    width: raster.width,
    height: raster.height,
    BitsPerSample: [8],
    SampleFormat: [1],
    GDAL_NODATA: String(raster.noData),
    ProjectedCSTypeGeoKey: 3857,
    GeographicTypeGeoKey: 4326,
    ModelPixelScale: [raster.pixelSize, raster.pixelSize, 0],
    ModelTiepoint: [0, 0, 0, raster.originX, raster.originY, 0],
  });
  const destination = path.join(directory, demFile);
  await writeFile(destination, Buffer.from(bytes));
  return destination;
}

async function measurements(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps
      .filter((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
      .at(-1)?.map;
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
          }));
      });
  });
}

async function lineMidpointPixel(page: Page, id: string) {
  return page.evaluate(
    ({ id }) => {
      const map = window.__aegisMaps
        .filter((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
        .at(-1)?.map;
      if (!map) throw new Error("Editor map is unavailable");
      for (const layer of map.getLayers().getArray()) {
        const source = (layer as VectorLayer).getSource?.();
        const feature = source && "getFeatureById" in source ? source.getFeatureById(id) : null;
        if (!feature) continue;
        const coordinates = (feature.getGeometry() as LineString).getCoordinates();
        const coordinate = [
          (coordinates[0][0] + coordinates[1][0]) / 2,
          (coordinates[0][1] + coordinates[1][1]) / 2,
        ];
        const size = map.getSize();
        const center = map.getView().getCenter();
        const resolution = map.getView().getResolution();
        if (!size || !center || !resolution) throw new Error("Editor map view is unavailable");
        const pixel = [
          size[0] / 2 + (coordinate[0] - center[0]) / resolution,
          size[1] / 2 - (coordinate[1] - center[1]) / resolution,
        ];
        const bounds = map.getTargetElement().getBoundingClientRect();
        return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
      }
      throw new Error(`Measurement ${id} is absent`);
    },
    { id }
  );
}

function independentDistance(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
) {
  const radius = 6_378_137;
  const radians = Math.PI / 180;
  const startLat = start.lat * radians;
  const endLat = end.lat * radians;
  const deltaLat = endLat - startLat;
  const deltaLng = (end.lng - start.lng) * radians;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function canvasPixel(
  page: Page,
  fraction: number,
  yOffset = 35
): Promise<{ color: string; alpha: number }> {
  return page.locator('[class*="measureCanvasContainer"] canvas').evaluate(
    (element, { fraction, yOffset }) => {
      if (!(element instanceof HTMLCanvasElement))
        throw new Error("Measurement graph is not a canvas");
      const context = element.getContext("2d");
      if (!context) throw new Error("Measurement canvas has no 2D context");
      const width = element.clientWidth - 85;
      const x = 10 + width * fraction;
      const y = element.clientHeight - yOffset;
      const pixel = context.getImageData(
        Math.round((x * element.width) / element.clientWidth),
        Math.round((y * element.height) / element.clientHeight),
        1,
        1
      ).data;
      const color = `#${[...pixel.slice(0, 3)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`;
      return { color, alpha: pixel[3] };
    },
    { fraction, yOffset }
  );
}

test.afterEach(async ({ mission }) => {
  if (!process.env.STATIC_DIR) return;
  await rm(path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id), demFile), {
    force: true,
  });
});

test("golden terrain samples and a no-data break match the displayed segmented profile", async ({
  page,
  request,
  mission,
}) => {
  const missionDirectory = path.resolve(
    process.env.STATIC_DIR ?? "",
    "missionFiles",
    String(mission.id)
  );
  await createSyntheticDem(missionDirectory);
  await mission.change((doc) => {
    doc.demFilePath = demFile;
    doc.demResolution = raster.pixelSize;
    doc.planetRadius = 6_378_137;
    doc.landerLocation = { lat: 0, lng: 0 };
    doc.landerElevationMeters = 120;
    doc.initialZoom = 17;
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
  });
  const before = await mission.read();

  const goldenPath = knownSamples.map(({ column }) => cellCenter(column, 16));
  const goldenDistances = goldenPath
    .slice(1)
    .map((point, index) => independentDistance(goldenPath[index], point));
  const goldenResponse = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
    data: { path: goldenPath, pathSegmentDistances: goldenDistances },
  });
  expect(goldenResponse.ok(), await goldenResponse.text()).toBe(true);
  const golden = (await goldenResponse.json()).data as TerrainProfile;
  expect(golden.elevationsMeters).toHaveLength(knownSamples.length - 1);
  expect(golden.elevationsMeters.map((segment) => [segment[0], segment.at(-1)])).toEqual([
    [120, 130],
    [130, 170],
    [170, 230],
  ]);
  expect(golden.terrainSlopesDegrees.map((segment) => [segment[0], segment.at(-1)])).toEqual([
    [0, 45],
    [45, 45],
    [45, 0],
  ]);
  expect(golden.elevationsMeters[1]).toContain(-1_100_101);
  expect(golden.terrainSlopesDegrees[1]).toContain(null);
  let expectedAscent = 0;
  let expectedDescent = 0;
  for (const segment of golden.elevationsMeters) {
    for (let index = 1; index < segment.length; index++) {
      if (segment[index - 1] === -1_100_101 || segment[index] === -1_100_101) continue;
      const delta = segment[index] - segment[index - 1];
      expectedAscent += Math.max(0, delta);
      expectedDescent += Math.max(0, -delta);
    }
  }
  const ascentFromKnownCells = 130 - 120 + (140 - 130) + (170 - 160) + (230 - 170);
  expect(ascentFromKnownCells).toBe(90);
  expect(expectedAscent).toBe(ascentFromKnownCells);
  expect(expectedDescent).toBe(0);

  await mission.open(page);
  await page.locator('[data-tooltip-content="Measurements"]').click();
  await expect(page.locator('[data-tooltip-content="Add Temporary Measurement"]')).toBeVisible();
  const initialProfileRequest = page.waitForRequest(
    (request) => request.url().includes("/api/v1/terrain-profile?") && request.method() === "POST"
  );
  await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
  const initialRequest = await initialProfileRequest;
  await expect.poll(() => measurements(page)).toHaveLength(1);
  const id = (await measurements(page))[0].id;
  const initialProfile = await initialRequest.response();
  expect(initialProfile.ok()).toBe(true);

  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  const midpoint = await lineMidpointPixel(page, id);
  const splitProfile = page.waitForResponse((response) => {
    if (
      !response.url().includes("/api/v1/terrain-profile?") ||
      response.request().method() !== "POST"
    )
      return false;
    const body = response.request().postDataJSON() as TerrainProfilePostData;
    return body.path.length === 3;
  });
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect.poll(async () => (await measurements(page))[0].coordinates).toHaveLength(3);
  await page.getByLabel("Finished", { exact: true }).click();
  const uiResponse = await splitProfile;
  expect(uiResponse.ok()).toBe(true);
  const uiProfile = (await uiResponse.json()).data as TerrainProfile;
  expect(uiProfile.elevationsMeters).toHaveLength(2);
  expect(uiProfile.terrainSlopesDegrees).toHaveLength(2);
  expect(uiProfile.elevationsMeters).toEqual([
    [120, 120, 120, 120, 120, 120, 130, 140, -1_100_101],
    [-1_100_101, -1_100_101, 160, 170, 180, 190, 200, 210, 220],
  ]);
  expect(uiProfile.elevationsMeters.flat()).toContain(-1_100_101);
  expect(uiProfile.elevationsMeters.flat().some((elevation) => elevation !== -1_100_101)).toBe(
    true
  );
  expect(uiProfile.terrainSlopesDegrees.flat()).toContain(null);
  expect(uiProfile.terrainSlopesDegrees.flat().some((slope) => slope === 0)).toBe(true);
  expect(uiProfile.terrainSlopesDegrees.flat().some((slope) => (slope ?? 0) > 20)).toBe(true);

  await expect.poll(async () => (await measurements(page))[0].distances).toHaveLength(2);
  const displayedMeasurement = (await measurements(page))[0];
  const segmentDistances = displayedMeasurement.distances;
  expect(displayedMeasurement.coordinates).toHaveLength(3);
  expect(segmentDistances[0]).toBeCloseTo(
    Math.hypot(
      displayedMeasurement.coordinates[1][0] - displayedMeasurement.coordinates[0][0],
      displayedMeasurement.coordinates[1][1] - displayedMeasurement.coordinates[0][1]
    ),
    1
  );
  expect(segmentDistances[1]).toBeCloseTo(
    Math.hypot(
      displayedMeasurement.coordinates[2][0] - displayedMeasurement.coordinates[1][0],
      displayedMeasurement.coordinates[2][1] - displayedMeasurement.coordinates[1][1]
    ),
    1
  );
  const graph = page.locator('[class*="measureCanvasContainer"] canvas');
  await expect(graph).toBeVisible();
  await expect(page.getByText("Tot Distance (m)", { exact: true })).toBeVisible();
  await expect(page.getByText("Terrain Slope (°)", { exact: true })).toBeVisible();
  const total = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  const graphBounds = await graph.boundingBox();
  expect(graphBounds).not.toBeNull();
  await expect(
    page
      .locator('[class*="timelineHoverValueItem"]')
      .nth(0)
      .locator('[class*="timelineHoverValue"]')
      .last()
  ).toHaveText(total.toFixed(0));
  const hoverValues = page.locator('[class*="timelineHoverValueItem"]');
  const displayedValue = (index: number) =>
    hoverValues.nth(index).locator('[class*="timelineHoverValue"]').last();
  const drawingWidth = graphBounds!.width - 85;
  await page.mouse.move(graphBounds!.x + 10, graphBounds!.y + 50);
  await expect(displayedValue(2)).toHaveText("0");
  await expect(displayedValue(4)).toHaveText("0.0");
  const steepHoverX = graphBounds!.x + 10 + drawingWidth * 0.375;
  await page.mouse.move(steepHoverX - 1, graphBounds!.y + 50);
  await page.waitForTimeout(100);
  await page.mouse.move(steepHoverX, graphBounds!.y + 50);
  await expect(displayedValue(2)).toHaveText("10");
  const steepTerrainSlope = Number(await displayedValue(4).innerText());
  expect(steepTerrainSlope).toBeGreaterThan(44);
  expect(steepTerrainSlope).toBeLessThan(46);

  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  const locateSlopePair = (predicate: (a: number, b: number) => boolean) => {
    let start = 0;
    for (const [segmentIndex, segment] of uiProfile.terrainSlopesDegrees.entries()) {
      const distance = segmentDistances[segmentIndex];
      for (let index = 0; index < segment.length - 1; index++) {
        const first = segment[index];
        const second = segment[index + 1];
        if (first !== null && second !== null && predicate(first, second))
          return (start + (distance * (index + 0.5)) / (segment.length - 1)) / totalDistance;
      }
      start += distance;
    }
    throw new Error("The sampled profile does not contain the requested slope class");
  };
  const shallowFraction = locateSlopePair((a, b) => a <= 2 && b <= 2);
  const hazardFraction = locateSlopePair((a, b) => a > 20 && b > 20);
  const gapFraction = segmentDistances[0] / totalDistance;
  const gapX = graphBounds!.x + 10 + drawingWidth * gapFraction;
  await page.mouse.move(gapX - 1, graphBounds!.y + 50);
  await page.waitForTimeout(100);
  await page.mouse.move(gapX, graphBounds!.y + 50);
  await expect(displayedValue(2)).toHaveText("");
  await expect(displayedValue(3)).toHaveText("—");
  await expect(displayedValue(4)).toHaveText("—");
  const standardCanvas = await graph.screenshot();
  const standardShallow = await canvasPixel(page, shallowFraction);
  const standardHazard = await canvasPixel(page, hazardFraction);
  expect(standardShallow.color).toBe("#313695");
  expect(standardHazard.color).toBe("#301f42");
  await page.mouse.move(graphBounds!.x + 10, graphBounds!.y + 50);
  const standardGap = await canvasPixel(page, gapFraction);
  expect(standardGap.color).toBe("#d3d3d3");

  const colorblind = page.getByRole("button", { name: "Colorblind", exact: true });
  await colorblind.click();
  await expect(colorblind).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await graph.screenshot()).equals(standardCanvas)).toBe(false);
  expect((await canvasPixel(page, shallowFraction)).color).toBe("#ffffcc");
  expect((await canvasPixel(page, hazardFraction)).color).toBe("#301f42");
  expect(await canvasPixel(page, gapFraction)).toEqual(standardGap);
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const legend = page.getByRole("dialog", {
    name: "Slope color = absolute degrees",
    exact: true,
  });
  await expect(legend).toBeVisible();
  for (const range of ["0–2°", ">2–4°", ">4–8°", ">8–12°", ">12–16°", ">16–20°", ">20°"])
    await expect(legend.getByText(range, { exact: true })).toBeVisible();
  await expect(legend.locator('[class*="swatch"]')).toHaveCount(7);
  expect(await mission.read()).toEqual(before);
});
