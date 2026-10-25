import { createRequire } from "node:module";
import { PbfWriter } from "pbf";
import type Point from "ol/geom/Point";
import type TileLayer from "ol/layer/Tile";
import type VectorLayer from "ol/layer/Vector";
import type VectorTileLayer from "ol/layer/VectorTile";
import type VectorSource from "ol/source/Vector";
import type XYZ from "ol/source/XYZ";
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

function xyzOracleTile(): Buffer {
  const data = Buffer.alloc(256 * 256 * 4);
  for (let y = 120; y < 136; y += 1) {
    for (let x = 120; x < 136; x += 1) {
      const offset = (y * 256 + x) * 4;
      data[offset] = 255;
      data[offset + 3] = 255;
    }
  }
  return PNG.sync.write({ width: 256, height: 256, data });
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

async function renderedMapCenterPixel(page: Page): Promise<string> {
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  const png = PNG.sync.read(await viewport.screenshot());
  const x = Math.floor(png.width / 2);
  const y = Math.floor(png.height / 2);
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

  await greenRow.locator('svg[data-icon="sliders"]').click();
  const redGroup = page.locator('[class*="layerGroup"]').filter({ hasText: "Red raster" });
  const greenGroup = page.locator('[class*="layerGroup"]').filter({ hasText: "Green raster" });
  const redHandle = redGroup.locator("a.headerReorder");
  const greenHandle = greenGroup.locator("a.headerReorder");
  await redHandle.scrollIntoViewIfNeeded();
  const source = await redHandle.boundingBox();
  const target = await greenHandle.boundingBox();
  if (!source || !target) throw new Error("Both raster reorder handles must be visible");
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height / 2;
  const targetX = target.x + target.width / 2;
  const targetY = target.y + target.height / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 8, sourceY, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 16 });
  // A second target move delivers native dragover before releasing the header.
  await page.mouse.move(targetX + 1, targetY);
  await page.mouse.up();
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

test("Earth Web Mercator TMS requests invert Y and render the declared tile at the known map location", async ({
  page,
  mission,
}) => {
  const tmsLayer = "30000000-0000-4000-8000-000000009221";
  const tmsSublayer = "30000000-0000-4000-8000-000000009222";
  const tile = pngTile([224, 48, 32, 255]);
  await page.route("**/raster-fixture-tms/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: tile })
  );
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.layers[tmsLayer] = {
      uuid: tmsLayer,
      name: "Earth TMS oracle",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.sublayers[tmsSublayer] = {
      uuid: tmsSublayer,
      layerUuid: tmsLayer,
      type: "tile",
      name: "Earth TMS tile",
      description: "Solid-color TMS orientation fixture",
      legend: null,
      path: "http://localhost:4000/raster-fixture-tms",
      tilePattern: "{z}/{x}/{y}.png",
      boundingBox: null,
      tileFormat: "tms",
      minNativeZoom: 0,
      maxNativeZoom: 18,
      maxZoom: 22,
      isTimeBased: false,
      timeLayerManifest: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const preset = doc.presets[mission.ids.presetA];
    preset.layerOrder = [{ layerUuid: tmsLayer, sublayerUuids: [tmsSublayer] }];
    preset.mapSublayerControls[tmsSublayer] = {
      name: "Earth TMS tile",
      sublayerUuid: tmsSublayer,
      visible: true,
      style: { ...initialStyle },
    };
  });

  await mission.open(page);
  const requestedTile = await page.evaluate((uuid) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const layer = map
      ?.getLayers()
      .getArray()
      .find((candidate) => candidate.get("uuid") === uuid) as TileLayer<XYZ> | undefined;
    const source = layer?.getSource();
    const grid = source?.getTileGrid();
    if (!source || !grid) throw new Error("The Earth TMS tile source did not load");
    const zoom = 10;
    const coordinate = [((Math.PI * 6378137) / 180) * 0.001, ((Math.PI * 6378137) / 180) * 0.001];
    const tileCoord = grid.getTileCoordForCoordAndZ(coordinate, zoom);
    const url = source.getTileUrlFunction()(tileCoord, 1, source.getProjection());
    return {
      url,
      expectedY: (grid.getFullTileRange(zoom)?.maxY ?? 0) - tileCoord[2],
      sourceY: tileCoord[2],
    };
  }, tmsSublayer);
  expect(requestedTile.expectedY).not.toBe(requestedTile.sourceY);
  expect(requestedTile.url).toContain(`/10/`);
  expect(requestedTile.url).toContain(`/${requestedTile.expectedY}.png`);
  expect(requestedTile.url).not.toContain(`/${requestedTile.sourceY}.png`);
  await expect.poll(() => renderedMapPixel(page)).toBe("#e03020");
});

test("Earth Web Mercator XYZ places its known tile feature at the declared coordinate and resolution", async ({
  page,
  mission,
}) => {
  const layerUuid = "30000000-0000-4000-8000-000000009241";
  const sublayerUuid = "30000000-0000-4000-8000-000000009242";
  await page.route("**/raster-fixture-xyz/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: xyzOracleTile() })
  );
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.layers[layerUuid] = {
      uuid: layerUuid,
      name: "Earth XYZ oracle",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.sublayers[sublayerUuid] = {
      uuid: sublayerUuid,
      layerUuid,
      type: "tile",
      name: "Earth XYZ feature tile",
      description: "A single red feature at the center of XYZ tile 4/8/8",
      legend: null,
      path: "http://localhost:4000/raster-fixture-xyz",
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
    const preset = doc.presets[mission.ids.presetA];
    preset.layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
    preset.mapSublayerControls[sublayerUuid] = {
      name: "Earth XYZ feature tile",
      sublayerUuid,
      visible: true,
      style: { ...initialStyle },
    };
  });

  await mission.open(page);
  const tileOracle = await page.evaluate((uuid) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const layer = map
      ?.getLayers()
      .getArray()
      .find((candidate) => candidate.get("uuid") === uuid) as TileLayer<XYZ> | undefined;
    const source = layer?.getSource();
    const grid = source?.getTileGrid();
    if (!map || !source || !grid) throw new Error("The Earth XYZ tile source did not load");
    const zoom = 4;
    const coordinate = [1_252_343.973, -1_252_343.973];
    const tileCoord = grid.getTileCoordForCoordAndZ(coordinate, zoom);
    const resolution = grid.getResolution(zoom);
    map.getView().setCenter(coordinate);
    map.getView().setResolution(resolution);
    map.renderSync();
    return {
      tileCoord,
      resolution,
      url: source.getTileUrlFunction()(tileCoord, 1, source.getProjection()),
    };
  }, sublayerUuid);
  expect(tileOracle.tileCoord).toEqual([4, 8, 8]);
  expect(tileOracle.resolution).toBeCloseTo(156543.033928 / 16, 4);
  expect(tileOracle.url).toContain("/4/8/8.png");
  await expect.poll(() => renderedMapCenterPixel(page)).toBe("#ff0000");
});

function writePbfMessage(
  writer: PbfWriter,
  tag: number,
  callback: (message: PbfWriter) => void
): void {
  writer.writeMessage(tag, (_message, nested) => callback(nested), writer);
}

function pointVectorTile(): Uint8Array {
  const tile = new PbfWriter();
  const writeStringField = (writer: PbfWriter, tag: number, value: string) =>
    writer.writeStringField(tag, value);
  const writeVarintField = (writer: PbfWriter, tag: number, value: number) =>
    writer.writeVarintField(tag, value);
  writePbfMessage(tile, 3, (layer) => {
    writeStringField(layer, 1, "surface");
    writePbfMessage(layer, 2, (feature) => {
      writeVarintField(feature, 1, 1);
      feature.writePackedVarint(2, [0, 0]);
      writeVarintField(feature, 3, 1);
      feature.writePackedVarint(4, [9, 4096, 4096]);
    });
    writeStringField(layer, 3, "name");
    writePbfMessage(layer, 4, (value) => writeStringField(value, 1, "PMTiles center oracle"));
    writeVarintField(layer, 5, 4096);
    writeVarintField(layer, 15, 2);
  });
  return tile.finish();
}

function pointPmtilesArchive(): Buffer {
  const tile = Buffer.from(pointVectorTile());
  const directoryWriter = new PbfWriter();
  directoryWriter.writeVarint(1);
  directoryWriter.writeVarint(0);
  directoryWriter.writeVarint(1);
  directoryWriter.writeVarint(tile.length);
  directoryWriter.writeVarint(1);
  const directory = Buffer.from(directoryWriter.finish());
  const metadata = Buffer.from(
    JSON.stringify({
      esri_tile_info: {
        lods: [{ level: 0, resolution: 78271.516964 }],
        origin: { x: -20037508.342789244, y: 20037508.342789244 },
        fullExtent: {
          xmin: -20037508.342789244,
          ymin: -20037508.342789244,
          xmax: 20037508.342789244,
          ymax: 20037508.342789244,
        },
        rows: 512,
        cols: 512,
        spatialReference: { wkid: 3857 },
      },
    })
  );
  const directoryOffset = 127;
  const metadataOffset = directoryOffset + directory.length;
  const tileOffset = metadataOffset + metadata.length;
  const header = Buffer.alloc(127);
  header.set(Buffer.from([80, 77, 84, 105, 108, 101, 115, 3]));
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const set64 = (offset: number, value: number) => view.setBigUint64(offset, BigInt(value), true);
  set64(8, directoryOffset);
  set64(16, directory.length);
  set64(24, metadataOffset);
  set64(32, metadata.length);
  set64(40, 0);
  set64(48, 0);
  set64(56, tileOffset);
  set64(64, tile.length);
  set64(72, 1);
  set64(80, 1);
  set64(88, 1);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, 1);
  view.setUint8(100, 0);
  view.setUint8(101, 0);
  view.setInt32(102, -1800000000, true);
  view.setInt32(106, -850000000, true);
  view.setInt32(110, 1800000000, true);
  view.setInt32(114, 850000000, true);
  view.setUint8(118, 0);
  view.setInt32(119, 0, true);
  view.setInt32(123, 0, true);
  return Buffer.concat([header, directory, metadata, tile]);
}

test("Earth Web Mercator PMTiles archive exposes its known center feature", async ({
  page,
  mission,
}) => {
  const layerUuid = "30000000-0000-4000-8000-000000009231";
  const sublayerUuid = "30000000-0000-4000-8000-000000009232";
  const archive = pointPmtilesArchive();
  await page.route("**/pmtiles-fixture/test.pmtiles", async (route) => {
    const range = route.request().headers().range;
    const match = range?.match(/^bytes=(\d+)-(\d+)$/);
    if (!match) {
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: archive });
      return;
    }
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), archive.length - 1);
    await route.fulfill({
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${archive.length}`,
      },
      contentType: "application/octet-stream",
      body: archive.subarray(start, end + 1),
    });
  });
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.layers[layerUuid] = { uuid: layerUuid, name: "PMTiles source", createdAt: 1, updatedAt: 1 };
    doc.sublayers[sublayerUuid] = {
      uuid: sublayerUuid,
      layerUuid,
      type: "vector-tile",
      name: "PMTiles center feature",
      description: "Single center point in a minimal PMTiles v3 archive",
      legend: null,
      path: "http://localhost:4000/pmtiles-fixture",
      tilePattern: "test.pmtiles",
      boundingBox: null,
      tileFormat: null,
      minNativeZoom: 0,
      maxNativeZoom: 0,
      maxZoom: 22,
      isTimeBased: false,
      timeLayerManifest: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const preset = doc.presets[mission.ids.presetA];
    preset.layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
    preset.mapSublayerControls[sublayerUuid] = {
      name: "PMTiles center feature",
      sublayerUuid,
      visible: true,
      style: { ...initialStyle },
    };
  });
  await mission.open(page);

  await expect
    .poll(() =>
      page.evaluate((uuid) => {
        const map = window.__aegisMaps.find(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )?.map;
        const layer = map
          ?.getLayers()
          .getArray()
          .find((candidate) => candidate.get("uuid") === uuid) as VectorTileLayer | undefined;
        return (
          layer
            ?.getFeaturesInExtent(map!.getView().calculateExtent(map!.getSize()))
            .map((feature) => ({
              name: feature.get("name"),
              coordinates: feature.getGeometry()?.getExtent(),
            })) ?? []
        );
      }, sublayerUuid)
    )
    .toContainEqual(expect.objectContaining({ name: "PMTiles center oracle" }));
  const featureExtent = await page.evaluate((uuid) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const layer = map
      ?.getLayers()
      .getArray()
      .find((candidate) => candidate.get("uuid") === uuid) as VectorTileLayer | undefined;
    return layer
      ?.getFeaturesInExtent(map!.getView().calculateExtent(map!.getSize()))
      .find((feature) => feature.get("name") === "PMTiles center oracle")
      ?.getGeometry()
      ?.getExtent();
  }, sublayerUuid);
  expect(featureExtent).toBeDefined();
  expect(featureExtent![0]).toBeCloseTo(0, 0);
  expect(featureExtent![1]).toBeCloseTo(0, 0);
});

test("lunar south-polar stereographic GeoJSON places a known lunar feature near the lander", async ({
  page,
  mission,
}) => {
  const layerUuid = "30000000-0000-4000-8000-000000009241";
  const sublayerUuid = "30000000-0000-4000-8000-000000009242";
  await page.route("**/lunar-geographic-fixture/features.geojson", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Lunar south-pole marker" },
            geometry: { type: "Point", coordinates: [0.1, -89.95] },
          },
        ],
      }),
    })
  );
  await mission.change((doc) => {
    doc.landerLocation = { lat: -89.96, lng: 0 };
    doc.planetRadius = 1_737_400;
    doc.initialZoom = 12;
    doc.projIsCustom = true;
    doc.projEpsg = "AEGIS:LUNAR-SOUTH-POLE";
    doc.projProj4String =
      "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs";
    doc.projBoundsMinX = -500_000;
    doc.projBoundsMinY = -500_000;
    doc.projBoundsMaxX = 500_000;
    doc.projBoundsMaxY = 500_000;
    doc.projResZoomLevel = 0;
    doc.projResUnitsPerPixel = 10_000;
    doc.layers[layerUuid] = {
      uuid: layerUuid,
      name: "Lunar geographic source",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.sublayers[sublayerUuid] = {
      uuid: sublayerUuid,
      layerUuid,
      type: "vector",
      name: "Lunar south-pole marker",
      description: "Geographic coordinates transformed to lunar south-polar stereographic",
      legend: null,
      path: "http://localhost:4000/lunar-geographic-fixture/features.geojson",
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
    preset.layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
    preset.mapSublayerControls[sublayerUuid] = {
      name: "Lunar south-pole marker",
      sublayerUuid,
      visible: true,
      style: { ...initialStyle },
    };
  });
  await mission.open(page);

  const readTransformed = () =>
    page.evaluate((uuid) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      const layer = map
        ?.getLayers()
        .getArray()
        .find((candidate) => candidate.get("uuid") === uuid) as
        VectorLayer<VectorSource> | undefined;
      const feature = layer?.getSource()?.getFeatures()[0];
      const geometry = feature?.getGeometry() as Point | undefined;
      return feature && geometry
        ? { name: feature.get("name"), coordinates: geometry.getCoordinates() }
        : null;
    }, sublayerUuid);
  await expect.poll(readTransformed).toMatchObject({ name: "Lunar south-pole marker" });
  const transformed = await readTransformed();
  expect(transformed).not.toBeNull();
  if (!transformed) throw new Error("The lunar GeoJSON feature did not load");
  expect(transformed.coordinates[0]).toBeCloseTo(2.646, 2);
  expect(transformed.coordinates[1]).toBeCloseTo(1516.165, 2);
});

test("timeline slope legend preserves labels and distinct colorblind palettes", async ({
  page,
  mission,
}) => {
  await mission.open(page);
  await page.getByLabel("evas Section", { exact: true }).click();
  await page
    .getByLabel("evaList-item")
    .filter({ hasText: "Survey Alpha" })
    .getByText("Survey Alpha", { exact: true })
    .click();
  await page.locator('[data-tooltip-content="Timeline"]').click();
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const legend = page.locator("dialog[open]");
  await expect(legend).toHaveAttribute("aria-labelledby");
  await expect(legend.getByText("Slope color = absolute degrees", { exact: true })).toBeVisible();
  await expect(legend.getByText("Path Grade (top)", { exact: true })).toBeVisible();
  await expect(legend.getByText("Terrain Slope (bottom)", { exact: true })).toBeVisible();
  const standardColors = await legend
    .getByLabel("Path Grade example", { exact: true })
    .locator("span")
    .evaluateAll((swatches) =>
      swatches.slice(0, 6).map((swatch) => getComputedStyle(swatch).backgroundColor)
    );
  await legend.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Colorblind", exact: true }).click();
  await expect(page.getByRole("button", { name: "Colorblind", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const colorblindColors = await legend
    .getByLabel("Path Grade example", { exact: true })
    .locator("span")
    .evaluateAll((swatches) =>
      swatches.slice(0, 6).map((swatch) => getComputedStyle(swatch).backgroundColor)
    );
  expect(colorblindColors).not.toEqual(standardColors);
  await expect(legend.getByText("Path Grade (top)", { exact: true })).toBeVisible();
  await expect(legend.getByText("Terrain Slope (bottom)", { exact: true })).toBeVisible();
  await legend.getByRole("button", { name: "Close", exact: true }).click();
});
