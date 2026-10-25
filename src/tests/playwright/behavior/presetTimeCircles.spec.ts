import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: {
    sync: {
      read(data: Buffer): { width: number; height: number; data: Buffer };
      write(image: { width: number; height: number; data: Buffer }): Buffer;
    };
  };
};

const layerUuid = "30000000-0000-4000-8000-000000009801";
const sublayerIds = {
  noSlice: "30000000-0000-4000-8000-000000009802",
  oneSlice: "30000000-0000-4000-8000-000000009803",
  manySlices: "30000000-0000-4000-8000-000000009804",
};
const fixtureBase = "http://localhost:4000/preset-time-fixture";
const circleUuid = "30000000-0000-4000-8000-000000009805";
const circleCenter = { lat: 0.001, lng: 0.001 };
const circleRadiusMeters = 750;

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

const manyTimeSlices: TimeLayerInfo[] = [
  {
    datetime: "2028-01-01T00:00:00Z",
    dirName: "slice-a",
    lowerBound: "2028-01-01T00:00:00Z",
    upperBound: "2028-01-02T00:00:00Z",
  },
  {
    datetime: "2028-01-03T00:00:00Z",
    dirName: "slice-b",
    lowerBound: "2028-01-02T00:00:00Z",
    upperBound: "2028-01-04T00:00:00Z",
  },
  {
    datetime: "2028-01-05T00:00:00Z",
    dirName: "slice-c",
    lowerBound: "2028-01-04T00:00:00Z",
    upperBound: "2028-01-06T00:00:00Z",
  },
];

function pngTile(color: [number, number, number, number]): Buffer {
  const data = Buffer.alloc(256 * 256 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  }
  return PNG.sync.write({ width: 256, height: 256, data });
}

async function mapPixel(page: Page): Promise<string> {
  const screenshot = PNG.sync.read(
    await page.locator('[data-map-mode="editor"] .ol-viewport').screenshot()
  );
  const x = Math.floor(screenshot.width / 2 + 90);
  const y = Math.floor(screenshot.height / 2 + 90);
  const offset = (y * screenshot.width + x) * 4;
  return `#${[...screenshot.data.subarray(offset, offset + 3)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function activeTimePaths(page: Page, uuid: string): Promise<string[]> {
  return page.evaluate(
    ({ uuid }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) return [];
      return map
        .getLayers()
        .getArray()
        .filter((layer) => layer.get("uuid") === uuid)
        .map((layer) => layer.get("_resolvedPath") as string);
    },
    { uuid }
  );
}

async function circleRings(page: Page, mode: "editor" | "dashboard") {
  return page.evaluate(
    ({ mode }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) return [];
      return map
        .getLayers()
        .getArray()
        .flatMap((layer) => {
          const source = (layer as VectorLayer).getSource?.();
          if (!source || !("getFeatures" in source)) return [];
          return source.getFeatures().flatMap((feature) => {
            const geometry = feature.getGeometry() as LineString | undefined;
            if (!geometry || geometry.getType() !== "LineString") return [];
            const coordinates = geometry.getCoordinates();
            return coordinates.length > 100 ? [coordinates] : [];
          });
        });
    },
    { mode }
  );
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

function addTimeLayer(
  doc: Mission,
  presetUuid: string,
  uuid: string,
  name: string,
  path: string,
  manifest: TimeLayerInfo[],
  visible: boolean
) {
  doc.sublayers[uuid] = {
    uuid,
    layerUuid,
    type: "tile",
    name,
    description: "Test-owned solid time slices",
    legend: null,
    path,
    tilePattern: "{z}/{x}/{y}.png",
    boundingBox: null,
    tileFormat: "xyz",
    minNativeZoom: 0,
    maxNativeZoom: 1,
    maxZoom: 22,
    isTimeBased: true,
    timeLayerManifest: manifest,
    createdAt: 1,
    updatedAt: 1,
  };
  doc.presets[presetUuid].mapSublayerControls[uuid] = {
    name,
    sublayerUuid: uuid,
    visible,
    style: { ...initialStyle },
  };
}

test.describe("PRESET-006 time-aware map layers", () => {
  test.use({ scenario: "execution" });

  test("time slices refresh at inclusive boundaries across EVA and REX scopes with zero and one-slice sources", async ({
    page,
    mission,
  }) => {
    const tiles = new Map<string, Buffer>([
      ["static", pngTile([128, 128, 128, 255])],
      ["only", pngTile([255, 255, 0, 255])],
      ["slice-a", pngTile([255, 0, 0, 255])],
      ["slice-b", pngTile([0, 255, 0, 255])],
      ["slice-c", pngTile([0, 0, 255, 255])],
    ]);
    const requests: string[] = [];
    await page.route("**/preset-time-fixture/**", async (route) => {
      requests.push(route.request().url());
      const color = [...tiles.keys()].find((key) => route.request().url().includes(`/${key}/`));
      await route.fulfill({
        status: color ? 200 : 404,
        contentType: "image/png",
        body: color ? tiles.get(color)! : Buffer.alloc(0),
      });
    });

    await mission.change((doc) => {
      doc.projIsCustom = false;
      doc.projEpsg = "EPSG:3857";
      doc.layers[layerUuid] = { uuid: layerUuid, name: "Dated raster", createdAt: 1, updatedAt: 1 };
      const oneSlice: TimeLayerInfo[] = [
        {
          datetime: "2028-01-03T00:00:00Z",
          dirName: "only",
          lowerBound: "2028-01-01T00:00:00Z",
          upperBound: "2028-01-06T00:00:00Z",
        },
      ];
      addTimeLayer(
        doc,
        mission.ids.presetA,
        sublayerIds.noSlice,
        "Static raster",
        `${fixtureBase}/static`,
        [],
        false
      );
      addTimeLayer(
        doc,
        mission.ids.presetA,
        sublayerIds.oneSlice,
        "Single-date raster",
        `${fixtureBase}/single`,
        oneSlice,
        false
      );
      addTimeLayer(
        doc,
        mission.ids.presetA,
        sublayerIds.manySlices,
        "Multi-date raster",
        `${fixtureBase}/multi`,
        manyTimeSlices,
        true
      );
      doc.presets[mission.ids.presetA].layerOrder = [
        {
          layerUuid,
          sublayerUuids: [sublayerIds.noSlice, sublayerIds.oneSlice, sublayerIds.manySlices],
        },
      ];
      doc.evas[mission.ids.evaA].datetime = Date.parse("2028-01-01T00:00:00Z");
      doc.evas[mission.ids.rexEvaA].datetime = Date.parse("2028-01-02T00:00:00Z");
      doc.evas[mission.ids.rexEvaB].datetime = Date.parse("2028-01-04T00:00:00Z");
    });
    await mission.open(page);
    await selectPreset(page, "Overview");
    await selectExecution(page, "Survey Alpha", mission.ids.evaA);

    const sourcePath = (slice: string) => `${fixtureBase}/multi/${slice}`;
    await expect
      .poll(() => activeTimePaths(page, sublayerIds.manySlices))
      .toEqual([sourcePath("slice-a")]);
    await expect.poll(() => mapPixel(page)).toBe("#ff0000");
    expect(requests.some((url) => url.includes("/multi/slice-a/"))).toBe(true);

    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expect
      .poll(() => activeTimePaths(page, sublayerIds.manySlices))
      .toEqual([sourcePath("slice-b")]);
    await expect.poll(() => mapPixel(page)).toBe("#00ff00");
    expect(requests.some((url) => url.includes("/multi/slice-b/"))).toBe(true);

    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await expect
      .poll(() => activeTimePaths(page, sublayerIds.manySlices))
      .toEqual([sourcePath("slice-c")]);
    await expect.poll(() => mapPixel(page)).toBe("#0000ff");
    expect(requests.some((url) => url.includes("/multi/slice-c/"))).toBe(true);

    await mission.change((doc) => {
      doc.evas[mission.ids.rexEvaB].datetime = Date.parse("2028-01-06T00:00:01Z");
    });
    await expect.poll(() => activeTimePaths(page, sublayerIds.manySlices)).toEqual([]);

    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await mission.change((doc) => {
      doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.manySlices].visible = false;
      doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.oneSlice].visible = true;
    });
    await expect
      .poll(() => activeTimePaths(page, sublayerIds.oneSlice))
      .toEqual([`${fixtureBase}/single/only`]);
    await expect.poll(() => mapPixel(page)).toBe("#ffff00");
    expect(requests.some((url) => url.includes("/single/only/"))).toBe(true);

    await mission.change((doc) => {
      doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.oneSlice].visible = false;
      doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.noSlice].visible = true;
    });
    await expect
      .poll(() => activeTimePaths(page, sublayerIds.noSlice))
      .toEqual([`${fixtureBase}/static`]);
    await expect.poll(() => mapPixel(page)).toBe("#808080");
    expect(requests.some((url) => url.includes("/static/0/"))).toBe(true);
    expect(await mission.read()).toMatchObject({
      presets: {
        [mission.ids.presetA]: {
          mapSublayerControls: { [sublayerIds.noSlice]: { visible: true } },
        },
      },
    });
  });
});

test.describe("PRESET-008 lander circles", () => {
  test.use({ scenario: "execution" });

  test("lander circle uses the saved metre radius in the editor and dashboard", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.projIsCustom = false;
      doc.projEpsg = "EPSG:3857";
      doc.landerLocation = circleCenter;
      doc.circleDefinitions[circleUuid] = {
        name: "Known 750 metre ring",
        radius: circleRadiusMeters,
      };
      doc.presets[mission.ids.presetA].mapCircleControls[circleUuid] = {
        uuid: circleUuid,
        visible: false,
        style: { ...initialStyle },
      };
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPreset(page, "Overview");
    await page.getByLabel("circle_panel", { exact: true }).click();
    const circleRow = page
      .locator('[class*="sublayerItemContainer"]')
      .filter({ hasText: "Known 750 metre ring" });
    await expect(circleRow).toContainText("750m");
    await expect.poll(() => circleRings(page, "editor")).toHaveLength(0);
    await circleRow.locator('svg[data-icon="eye-slash"]').click();

    const expectedCenter = {
      x: (6_378_137 * circleCenter.lng * Math.PI) / 180,
      y: 6_378_137 * Math.log(Math.tan(Math.PI / 4 + (circleCenter.lat * Math.PI) / 360)),
    };
    const assertMeterRadius = async (mode: "editor" | "dashboard") => {
      const rings = await circleRings(page, mode);
      expect(rings).toHaveLength(1);
      const radialDistances = rings[0].map(([x, y]) =>
        Math.hypot(x - expectedCenter.x, y - expectedCenter.y)
      );
      expect(Math.min(...radialDistances)).toBeCloseTo(circleRadiusMeters, 5);
      expect(Math.max(...radialDistances)).toBeCloseTo(circleRadiusMeters, 5);
    };
    await expect.poll(() => circleRings(page, "editor")).toHaveLength(1);
    await assertMeterRadius("editor");

    await circleRow.locator('svg[data-icon="sliders"]').click();
    await page.getByLabel("weight", { exact: true }).fill("5");
    await expect
      .poll(
        async () =>
          (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid].style
            .weight
      )
      .toBe(5);
    await page.reload();
    await selectPreset(page, "Overview");
    await expect.poll(() => circleRings(page, "editor")).toHaveLength(1);
    await assertMeterRadius("editor");
    expect(
      (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid]
    ).toMatchObject({
      visible: true,
      style: { weight: 5 },
    });

    await page.goto(mission.dashboardUrl);
    await expect(page.locator('[data-map-mode="dashboard"] .ol-viewport')).toBeVisible();
    await expect.poll(() => circleRings(page, "dashboard")).toHaveLength(1);
    await assertMeterRadius("dashboard");
  });
});
