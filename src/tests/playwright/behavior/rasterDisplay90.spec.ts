import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { writeArrayBuffer } from "geotiff";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: {
    sync: {
      read(data: Buffer): { width: number; height: number; data: Buffer };
      write(image: { width: number; height: number; data: Buffer }): Buffer;
    };
  };
};

const ids = {
  redLayer: "30000000-0000-4000-8000-000000009201",
  redSublayer: "30000000-0000-4000-8000-000000009202",
  greenLayer: "30000000-0000-4000-8000-000000009203",
  greenSublayer: "30000000-0000-4000-8000-000000009204",
  slopeLayer: "30000000-0000-4000-8000-000000009205",
  slopeSublayer: "30000000-0000-4000-8000-000000009206",
};

const initialStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#ffffff",
  weight: 2,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#ffffff",
  altOpacity: 1,
  showLabels: true,
};

function pngTile(color: [number, number, number, number]): Buffer {
  const pixels = Buffer.alloc(256 * 256 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
  return PNG.sync.write({ width: 256, height: 256, data: pixels });
}

async function renderedMapPixel(page: Page): Promise<string> {
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  const png = PNG.sync.read(await viewport.screenshot());
  const x = Math.floor(png.width / 2 + 90);
  const y = Math.floor(png.height / 2 + 90);
  const offset = (y * png.width + x) * 4;
  return `#${[...png.data.subarray(offset, offset + 3)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function selectPreset(page: Page, name: string): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText(name);
}

function layerRow(page: Page, name: string) {
  return page
    .locator('[class*="layerGroup"]')
    .filter({ hasText: name })
    .locator('[class*="sublayerItemContainer"]')
    .filter({ hasText: name });
}

test("overlapping preset rasters render the saved UI order, opacity and blend pixel after reload", async ({
  page,
  mission,
}) => {
  const redTile = pngTile([255, 0, 0, 255]);
  const greenTile = pngTile([0, 255, 0, 255]);
  await page.route("**/raster-fixture-red/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: redTile })
  );
  await page.route("**/raster-fixture-green/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: greenTile })
  );
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.layers[ids.redLayer] = {
      uuid: ids.redLayer,
      name: "Red raster",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.layers[ids.greenLayer] = {
      uuid: ids.greenLayer,
      name: "Green raster",
      createdAt: 1,
      updatedAt: 1,
    };
    for (const [uuid, layerUuid, name, path] of [
      [ids.redSublayer, ids.redLayer, "Red surface", "http://localhost:4000/raster-fixture-red"],
      [
        ids.greenSublayer,
        ids.greenLayer,
        "Green surface",
        "http://localhost:4000/raster-fixture-green",
      ],
    ]) {
      doc.sublayers[uuid] = {
        uuid,
        layerUuid,
        type: "tile",
        name,
        description: "Known-color overlap fixture",
        legend: null,
        path,
        tilePattern: "{z}/{x}/{y}.png",
        boundingBox: null,
        tileFormat: "xyz",
        minNativeZoom: 0,
        maxNativeZoom: 18,
        maxZoom: 22,
        isTimeBased: false,
        timeLayerManifest: [],
        createdAt: 1,
        updatedAt: 1,
      };
    }
    const redEntry = { layerUuid: ids.redLayer, sublayerUuids: [ids.redSublayer] };
    const greenEntry = { layerUuid: ids.greenLayer, sublayerUuids: [ids.greenSublayer] };
    for (const presetUuid of [mission.ids.presetA, mission.ids.presetB]) {
      const preset = doc.presets[presetUuid];
      preset.layerOrder =
        presetUuid === mission.ids.presetA ? [greenEntry, redEntry] : [redEntry, greenEntry];
      preset.mapSublayerControls[ids.redSublayer] = {
        name: "Red surface",
        sublayerUuid: ids.redSublayer,
        visible: true,
        style: { ...initialStyle },
      };
      preset.mapSublayerControls[ids.greenSublayer] = {
        name: "Green surface",
        sublayerUuid: ids.greenSublayer,
        visible: true,
        style: { ...initialStyle },
      };
    }
  });

  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPreset(page, "Overview");
  await expect.poll(() => renderedMapPixel(page)).toBe("#00ff00");

  await page.getByLabel("layers_panel", { exact: true }).click();
  const greenRow = layerRow(page, "Green surface");
  await greenRow.locator('svg[data-icon="sliders"]').click();
  await greenRow.getByLabel("opacity", { exact: true }).fill("50");
  await expect
    .poll(
      async () =>
        (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[ids.greenSublayer]
          .style.opacity
    )
    .toBe(0.5);
  await greenRow.getByLabel("dropdown", { exact: true }).selectOption("difference");
  await expect
    .poll(
      async () =>
        (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[ids.greenSublayer]
          .style.blendMode
    )
    .toBe("difference");
  await expect.poll(() => renderedMapPixel(page)).toBe("#ff8000");

  const redGroup = page.locator('[class*="layerGroup"]').filter({ hasText: "Red raster" });
  const greenGroup = page.locator('[class*="layerGroup"]').filter({ hasText: "Green raster" });
  await redGroup.locator("a.headerReorder").dragTo(greenGroup, { targetPosition: { x: 20, y: 5 } });
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].layerOrder[0].layerUuid)
    .toBe(ids.redLayer);
  await expect.poll(() => renderedMapPixel(page)).toBe("#ff0000");

  const overview = await mission.read();
  expect(
    overview.presets[mission.ids.presetA].mapSublayerControls[ids.greenSublayer]
  ).toMatchObject({
    visible: true,
    style: { opacity: 0.5, blendMode: "difference" },
  });
  await page.reload();
  await expect.poll(() => renderedMapPixel(page)).toBe("#ff0000");
  const restored = await mission.read();
  expect(restored.presets[mission.ids.presetA].layerOrder[0].layerUuid).toBe(ids.redLayer);
  expect(
    restored.presets[mission.ids.presetA].mapSublayerControls[ids.greenSublayer].style
  ).toMatchObject({
    opacity: 0.5,
    blendMode: "difference",
  });

  await selectPreset(page, "Detail");
  await expect.poll(() => renderedMapPixel(page)).toBe("#ff0000");
  expect((await mission.read()).presets[mission.ids.presetB].layerOrder[0].layerUuid).toBe(
    ids.redLayer
  );
  expect(
    (await mission.read()).presets[mission.ids.presetB].mapSublayerControls[ids.greenSublayer].style
  ).toMatchObject({ opacity: 1, blendMode: "normal" });
});

const slopeRasterName = "coverage90-slope-classes.tif";
const slopeRaster = { width: 64, height: 32, originX: -96, originY: 48, pixelSize: 3 };

function rasterBand(value: number): number[][] {
  return Array.from({ length: slopeRaster.height }, () =>
    Array.from({ length: slopeRaster.width }, () => value)
  );
}

async function writeSlopeClassRaster(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const red = rasterBand(0);
  const green = rasterBand(0);
  const blue = rasterBand(0);
  const alpha = rasterBand(255);
  // A distinct transparent shallow class, one representative middle class, and >20° hazard.
  for (let row = 0; row < slopeRaster.height; row += 1) {
    for (let column = 0; column < slopeRaster.width; column += 1) {
      if (column < 8) {
        alpha[row][column] = 0;
      } else if (column < 20) {
        alpha[row][column] = 0;
      } else if (column < 42) {
        red[row][column] = 253;
        green[row][column] = 157;
        blue[row][column] = 67;
      } else {
        red[row][column] = 48;
        green[row][column] = 31;
        blue[row][column] = 66;
      }
    }
  }
  const bytes = await writeArrayBuffer([red, green, blue, alpha], {
    width: slopeRaster.width,
    height: slopeRaster.height,
    BitsPerSample: [8, 8, 8, 8],
    SampleFormat: [1, 1, 1, 1],
    SamplesPerPixel: [4],
    PhotometricInterpretation: 2,
    ExtraSamples: [2],
    PlanarConfiguration: 1,
    ProjectedCSTypeGeoKey: 3857,
    GeographicTypeGeoKey: 4326,
    ModelPixelScale: [slopeRaster.pixelSize, slopeRaster.pixelSize, 0],
    ModelTiepoint: [0, 0, 0, slopeRaster.originX, slopeRaster.originY, 0],
  });
  await writeFile(path.join(directory, slopeRasterName), Buffer.from(bytes));
}

async function readSlopeRasterPixel(
  page: Page,
  column: number,
  row: number
): Promise<{ color: string; alpha: number }> {
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  const screenshot = PNG.sync.read(await viewport.screenshot());
  const pixel = await page.evaluate(
    ({ originX, originY, pixelSize, column, row }) => {
      const map = window.__aegisMaps
        .filter((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
        .at(-1)?.map;
      if (!map) throw new Error("Editor map is unavailable");
      const coordinate = [originX + (column + 0.5) * pixelSize, originY - (row + 0.5) * pixelSize];
      const mapPixel = map.getPixelFromCoordinate(coordinate);
      const bounds = map.getTargetElement().getBoundingClientRect();
      const viewportBounds = document
        .querySelector('[data-map-mode="editor"] .ol-viewport')
        ?.getBoundingClientRect();
      if (!viewportBounds) throw new Error("Editor map viewport is unavailable");
      return {
        x: Math.round(bounds.left + mapPixel[0] - viewportBounds.left),
        y: Math.round(bounds.top + mapPixel[1] - viewportBounds.top),
      };
    },
    { ...slopeRaster, column, row }
  );
  const offset = (pixel.y * screenshot.width + pixel.x) * 4;
  const rgba = screenshot.data.subarray(offset, offset + 4);
  return {
    color: `#${[...rgba.subarray(0, 3)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`,
    alpha: rgba[3],
  };
}

test("slope GeoTIFF preserves transparent shallow/no-data cells and the shared >20° hazard color", async ({
  page,
  mission,
}) => {
  const directory = path.resolve(
    process.env.STATIC_DIR ?? "",
    "missionFiles",
    String(mission.id),
    "Layers"
  );
  await writeSlopeClassRaster(directory);
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.planetRadius = 6_378_137;
    doc.demFilePath = "";
    doc.layers[ids.slopeLayer] = {
      uuid: ids.slopeLayer,
      name: "Classified slope",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.sublayers[ids.slopeSublayer] = {
      uuid: ids.slopeSublayer,
      layerUuid: ids.slopeLayer,
      type: "tile",
      name: "Slope classes",
      description: "Synthetic alpha slope raster",
      legend: null,
      path: slopeRasterName,
      tilePattern: null,
      boundingBox: null,
      tileFormat: null,
      minNativeZoom: null,
      maxNativeZoom: null,
      maxZoom: null,
      isTimeBased: false,
      timeLayerManifest: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const preset = doc.presets[mission.ids.presetA];
    preset.layerOrder = [{ layerUuid: ids.slopeLayer, sublayerUuids: [ids.slopeSublayer] }];
    preset.mapSublayerControls[ids.slopeSublayer] = {
      name: "Slope classes",
      sublayerUuid: ids.slopeSublayer,
      visible: true,
      style: { ...initialStyle },
    };
  });

  try {
    await mission.open(page);
    const shallow = () => readSlopeRasterPixel(page, 10, 5);
    const noData = () => readSlopeRasterPixel(page, 3, 5);
    const middle = () => readSlopeRasterPixel(page, 30, 5);
    const hazard = () => readSlopeRasterPixel(page, 50, 5);
    await expect.poll(async () => (await middle()).color).toBe("#fd9d43");
    await expect.poll(async () => (await hazard()).color).toBe("#301f42");
    const shallowUnderlay = await shallow();
    const noDataUnderlay = await noData();
    expect(shallowUnderlay.alpha).toBe(255);
    expect(shallowUnderlay.color).not.toBe("#ffffcc");
    await enablePlanningEditMode(page);
    await page.getByLabel("layers_panel", { exact: true }).click();
    const shallowLayer = page.getByText("Slope classes (tile)", { exact: true }).locator("..");
    await shallowLayer.locator('svg[data-icon="eye"]').click();
    await expect.poll(async () => (await shallow()).color).toBe(shallowUnderlay.color);
    await expect.poll(async () => (await noData()).color).toBe(noDataUnderlay.color);
    expect((await mission.read()).sublayers[ids.slopeSublayer].path).toBe(slopeRasterName);
  } finally {
    await rm(path.join(directory, slopeRasterName), { force: true });
  }
});
