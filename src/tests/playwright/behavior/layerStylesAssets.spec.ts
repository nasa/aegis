import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type CircleStyle from "ol/style/Circle";
import type Style from "ol/style/Style";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const ids = {
  layer: "30000000-0000-4000-8000-000000009901",
  vector: "30000000-0000-4000-8000-000000009902",
  healthyLayer: "30000000-0000-4000-8000-000000009903",
  healthy: "30000000-0000-4000-8000-000000009904",
  missingLayer: "30000000-0000-4000-8000-000000009905",
  missing: "30000000-0000-4000-8000-000000009906",
  corruptLayer: "30000000-0000-4000-8000-000000009907",
  corrupt: "30000000-0000-4000-8000-000000009908",
  slowLayer: "30000000-0000-4000-8000-000000009909",
  slow: "30000000-0000-4000-8000-000000009910",
  presetHealthyLayer: "30000000-0000-4000-8000-000000009911",
  presetHealthy: "30000000-0000-4000-8000-000000009912",
};

const baseStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#6633cc",
  weight: 2,
  fillColor: "#22aa44",
  fillOpacity: 0.25,
  isDashed: false,
  dashLen: 10,
  altColor: "#ffffff",
  altOpacity: 1,
  showLabels: true,
  labelMinZoom: 4,
};

const fixtureBase = "http://localhost:4000/layer-styles-assets-fixture";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: {
    sync: {
      write(image: { width: number; height: number; data: Buffer }): Buffer;
      read(data: Buffer): { width: number; height: number; data: Buffer };
    };
  };
};
const mixedGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { label: "Contour 120 m", elev: 120 },
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.001, 0],
          [0, 0],
          [0.001, 0],
        ],
      },
    },
    {
      type: "Feature",
      properties: { label: "Basalt unit" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-0.0008, -0.0004],
            [-0.0003, -0.0004],
            [-0.0003, 0.0001],
            [-0.0008, 0.0001],
            [-0.0008, -0.0004],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { label: "Drill point" },
      geometry: { type: "Point", coordinates: [0.0005, 0.00035] },
    },
  ],
};

interface VectorStyleSnapshot {
  geometry: string | undefined;
  label: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  fill: string | null;
  pointRadius: number | null;
  pointFill: string | null;
}

async function vectorStyles(
  page: Page,
  uuid: string,
  zoom: number
): Promise<VectorStyleSnapshot[]> {
  return page.evaluate(
    ({ uuid, zoom }) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      const layer = map
        ?.getLayers()
        .getArray()
        .find((candidate) => candidate.get("uuid") === uuid) as
        VectorLayer<VectorSource> | undefined;
      const source = layer?.getSource();
      const styleFunction = layer?.getStyleFunction();
      if (!source || !("getFeatures" in source) || !styleFunction) return [];
      const resolution = 156543.033928 / 2 ** zoom;
      return source.getFeatures().map((feature: Feature<Geometry>): VectorStyleSnapshot => {
        const rawStyles = styleFunction(feature, resolution);
        const style = (Array.isArray(rawStyles) ? rawStyles : [rawStyles]).find(
          (candidate): candidate is Style => candidate != null
        );
        const image = style?.getImage();
        const pointImage = image as CircleStyle | undefined;
        const strokeColor = style?.getStroke()?.getColor();
        const fillColor = style?.getFill()?.getColor();
        const pointFillColor = pointImage?.getFill()?.getColor();
        const labelText = style?.getText()?.getText();
        return {
          geometry: feature.getGeometry()?.getType(),
          label: typeof labelText === "string" ? labelText : null,
          stroke: typeof strokeColor === "string" ? strokeColor : null,
          strokeWidth: style?.getStroke()?.getWidth() ?? null,
          fill: typeof fillColor === "string" ? fillColor : null,
          pointRadius: pointImage?.getRadius() ?? null,
          pointFill: typeof pointFillColor === "string" ? pointFillColor : null,
        };
      });
    },
    { uuid, zoom }
  );
}

async function mapLayerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    return (
      map
        ?.getLayers()
        .getArray()
        .map((layer) => layer.get("uuid") as string)
        .filter(Boolean) ?? []
    );
  });
}

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

async function renderedPixel(page: Page): Promise<string> {
  const png = PNG.sync.read(
    await page.locator('[data-map-mode="editor"] .ol-viewport').screenshot()
  );
  const offset = (Math.floor(png.height / 2 + 90) * png.width + Math.floor(png.width / 2 + 90)) * 4;
  return `#${[...png.data.subarray(offset, offset + 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function layerRow(page: Page, name: string) {
  return page
    .locator('[class*="layerGroup"]')
    .filter({ hasText: name })
    .locator('[class*="sublayerItemContainer"]')
    .filter({ hasText: name });
}

function addSublayer(
  doc: Mission,
  presetUuid: string,
  args: {
    layerUuid: string;
    uuid: string;
    name: string;
    type: SublayerType;
    path: string;
    visible: boolean;
    style?: MapSublayerStyle;
    legend?: Legend | null;
    tilePattern?: string | null;
  }
) {
  doc.layers[args.layerUuid] = {
    uuid: args.layerUuid,
    name: args.name,
    createdAt: 1,
    updatedAt: 1,
  };
  doc.sublayers[args.uuid] = {
    uuid: args.uuid,
    layerUuid: args.layerUuid,
    type: args.type,
    name: args.name,
    description: "Small deterministic UI fixture",
    legend: args.legend ?? null,
    path: args.path,
    tilePattern: args.tilePattern ?? null,
    boundingBox: null,
    tileFormat: args.type === "tile" ? "xyz" : null,
    minNativeZoom: args.type === "tile" ? 0 : null,
    maxNativeZoom: args.type === "tile" ? 1 : null,
    maxZoom: args.type === "tile" ? 22 : null,
    isTimeBased: false,
    timeLayerManifest: [],
    createdAt: 1,
    updatedAt: 1,
  };
  doc.presets[presetUuid].layerOrder.push({
    layerUuid: args.layerUuid,
    sublayerUuids: [args.uuid],
  });
  doc.presets[presetUuid].mapSublayerControls[args.uuid] = {
    name: args.name,
    sublayerUuid: args.uuid,
    visible: args.visible,
    style: { ...baseStyle, ...args.style },
  };
}

async function selectPreset(page: Page, name: string) {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText(name);
}

test.describe("PRESET-005 vector and contour style variants", () => {
  test("line, fill, point and contour labels use saved styles, legends and zoom thresholds", async ({
    page,
    mission,
  }) => {
    await page.route("**/layer-styles-assets-fixture/mixed.geojson", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/geo+json",
        body: JSON.stringify(mixedGeoJson),
      })
    );
    await mission.change((doc) => {
      doc.projIsCustom = true;
      doc.projEpsg = "EPSG:3857";
      doc.projProj4String = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +units=m +no_defs";
      doc.projResUnitsPerPixel = 156543.033928;
      doc.projResZoomLevel = 0;
      doc.projBoundsMinX = -20037508;
      doc.projBoundsMinY = -20037508;
      doc.projBoundsMaxX = 20037508;
      doc.projBoundsMaxY = 20037508;
      for (const presetUuid of [mission.ids.presetA, mission.ids.presetB]) {
        doc.presets[presetUuid].layerOrder = [];
      }
      const legend: Legend = {
        unitsAbbr: "m",
        unitsName: "metres",
        version: "1",
        legend: [
          { color: "#6633cc", description: "Contour line", shape: "line" },
          { color: "#22aa44", description: "Mapped fill", shape: "fill" },
          { color: "#6633cc", description: "Point feature", shape: "circle" },
        ],
      };
      addSublayer(doc, mission.ids.presetA, {
        layerUuid: ids.layer,
        uuid: ids.vector,
        name: "Contour and mapped units",
        type: "vector",
        path: `${fixtureBase}/mixed.geojson`,
        visible: true,
        style: { ...baseStyle },
        legend,
      });
      doc.presets[mission.ids.presetB].layerOrder = [
        {
          layerUuid: ids.layer,
          sublayerUuids: [ids.vector],
        },
      ];
      doc.presets[mission.ids.presetB].mapSublayerControls[ids.vector] = {
        name: "Contour and mapped units",
        sublayerUuid: ids.vector,
        visible: true,
        style: { ...baseStyle, color: "#cc2244", weight: 1, fillColor: "#2244cc", labelMinZoom: 0 },
      };
    });

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPreset(page, "Overview");
    await page.getByLabel("layers_panel", { exact: true }).click();
    const row = layerRow(page, "Contour and mapped units");
    await expect(row).toContainText("Contour and mapped units (vector)");
    await expect.poll(() => vectorStyles(page, ids.vector, 2)).toHaveLength(3);
    const lowZoom = await vectorStyles(page, ids.vector, 2);
    expect(lowZoom.map(({ geometry }) => geometry).sort()).toEqual([
      "LineString",
      "Point",
      "Polygon",
    ]);
    expect(
      lowZoom.every(({ label }) => label === null),
      JSON.stringify(lowZoom)
    ).toBe(true);

    await row.locator('svg[data-icon="circle-info"]').click();
    await expect(row).toContainText("Legend (m)");
    for (const item of ["Contour line", "Mapped fill", "Point feature"]) {
      await expect(row).toContainText(item);
    }
    await row.locator('svg[data-icon="sliders"]').click();
    await row.getByLabel("weight", { exact: true }).fill("5");
    await row.getByLabel("fillOpacity", { exact: true }).fill("60");
    await row.getByLabel("labelMinZoom", { exact: true }).fill("3");
    await expect
      .poll(
        async () =>
          (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[ids.vector].style
      )
      .toMatchObject({ weight: 5, fillOpacity: 0.6, labelMinZoom: 3 });

    const highZoom = await vectorStyles(page, ids.vector, 6);
    expect(highZoom).toHaveLength(3);
    expect(
      highZoom.every(({ stroke, strokeWidth }) => stroke === "#6633cc" && strokeWidth === 5)
    ).toBe(true);
    const contour = highZoom.find(({ geometry }) => geometry === "LineString");
    const polygon = highZoom.find(({ geometry }) => geometry === "Polygon");
    const point = highZoom.find(({ geometry }) => geometry === "Point");
    expect(contour).toMatchObject({ label: "Contour 120 m", stroke: "#6633cc", strokeWidth: 5 });
    expect(polygon?.fill).toBe("rgba(34,170,68,0.6)");
    expect(point?.pointRadius).toBeGreaterThan(0);
    expect(point?.pointFill).toBe("rgba(34,170,68,0.6)");

    await selectPreset(page, "Detail");
    const detail = await vectorStyles(page, ids.vector, 6);
    expect(
      detail.every(({ stroke, strokeWidth }) => stroke === "#cc2244" && strokeWidth === 1)
    ).toBe(true);
    await selectPreset(page, "Overview");
    const restored = await vectorStyles(page, ids.vector, 6);
    expect(
      restored.every(({ stroke, strokeWidth }) => stroke === "#6633cc" && strokeWidth === 5)
    ).toBe(true);
    await page.reload();
    await selectPreset(page, "Overview");
    expect(
      (await vectorStyles(page, ids.vector, 6)).every(({ strokeWidth }) => strokeWidth === 5)
    ).toBe(true);
  });
});

test.describe("PRESET-009 map asset failure and recovery", () => {
  test("failed tiles preserve healthy content, a delayed prior-preset tile stays isolated, and a recovered asset renders", async ({
    page,
    mission,
  }) => {
    const responseBodies = {
      healthyOverview: pngTile([35, 170, 90, 255]),
      healthyDetail: pngTile([35, 85, 220, 255]),
      slowOldPreset: pngTile([230, 90, 30, 255]),
      recovered: pngTile([238, 190, 35, 255]),
    };
    const requests: Array<{ name: string; status: number }> = [];
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    await page.route("**/layer-styles-assets-fixture/tiles/**", async (route) => {
      const url = route.request().url();
      const name = url.includes("/missing/")
        ? "missing"
        : url.includes("/corrupt/")
          ? "corrupt"
          : url.includes("/slow/")
            ? "slow"
            : url.includes("/healthy-overview/")
              ? "healthyOverview"
              : url.includes("/healthy-detail/")
                ? "healthyDetail"
                : url.includes("/recovered/")
                  ? "recovered"
                  : "unknown";
      const record = { name, status: 0 };
      requests.push(record);
      if (name === "missing") {
        record.status = 404;
        await route.fulfill({ status: 404, contentType: "image/png", body: Buffer.alloc(0) });
      } else if (name === "corrupt") {
        record.status = 200;
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: "this is not a PNG image",
        });
      } else if (name === "slow") {
        await slowGate;
        record.status = 200;
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: responseBodies.slowOldPreset,
        });
      } else {
        const body = responseBodies[name as keyof typeof responseBodies];
        record.status = body ? 200 : 404;
        await route.fulfill({
          status: record.status,
          contentType: "image/png",
          body: body ?? Buffer.alloc(0),
        });
      }
    });

    try {
      await mission.change((doc) => {
        doc.projIsCustom = false;
        doc.projEpsg = "EPSG:3857";
        doc.presets[mission.ids.presetA].layerOrder = [];
        doc.presets[mission.ids.presetB].layerOrder = [];
        addSublayer(doc, mission.ids.presetA, {
          layerUuid: ids.missingLayer,
          uuid: ids.missing,
          name: "Missing tile",
          type: "tile",
          path: `${fixtureBase}/tiles/missing`,
          tilePattern: "{z}/{x}/{y}.png",
          visible: true,
        });
        addSublayer(doc, mission.ids.presetA, {
          layerUuid: ids.corruptLayer,
          uuid: ids.corrupt,
          name: "Corrupt tile",
          type: "tile",
          path: `${fixtureBase}/tiles/corrupt`,
          tilePattern: "{z}/{x}/{y}.png",
          visible: true,
        });
        addSublayer(doc, mission.ids.presetA, {
          layerUuid: ids.slowLayer,
          uuid: ids.slow,
          name: "Delayed tile",
          type: "tile",
          path: `${fixtureBase}/tiles/slow`,
          tilePattern: "{z}/{x}/{y}.png",
          visible: true,
        });
        addSublayer(doc, mission.ids.presetA, {
          layerUuid: ids.healthyLayer,
          uuid: ids.healthy,
          name: "Healthy overview underlay",
          type: "tile",
          path: `${fixtureBase}/tiles/healthy-overview`,
          tilePattern: "{z}/{x}/{y}.png",
          visible: true,
        });
        addSublayer(doc, mission.ids.presetB, {
          layerUuid: ids.presetHealthyLayer,
          uuid: ids.presetHealthy,
          name: "Healthy detail layer",
          type: "tile",
          path: `${fixtureBase}/tiles/healthy-detail`,
          tilePattern: "{z}/{x}/{y}.png",
          visible: true,
        });
      });
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPreset(page, "Overview");
      await expect
        .poll(() => requests.some(({ name, status }) => name === "missing" && status === 404))
        .toBe(true);
      await expect.poll(() => requests.some(({ name }) => name === "corrupt")).toBe(true);
      await expect.poll(() => requests.some(({ name }) => name === "slow")).toBe(true);
      await expect.poll(() => renderedPixel(page)).toBe("#23aa5a");

      await selectPreset(page, "Detail");
      await expect.poll(() => renderedPixel(page)).toBe("#2355dc");
      releaseSlow();
      await expect
        .poll(() => requests.some(({ name, status }) => name === "slow" && status === 200))
        .toBe(true);
      await expect
        .poll(() => mapLayerIds(page))
        .toEqual(expect.arrayContaining([ids.presetHealthy]));
      expect(await mapLayerIds(page)).not.toContain(ids.slow);
      await expect.poll(() => renderedPixel(page)).toBe("#2355dc");

      await mission.change((doc) => {
        doc.sublayers[ids.missing].path = `${fixtureBase}/tiles/recovered`;
        doc.presets[mission.ids.presetA].mapSublayerControls[ids.slow].visible = false;
      });
      await selectPreset(page, "Overview");
      await expect.poll(() => requests.some(({ name }) => name === "recovered")).toBe(true);
      await expect.poll(() => renderedPixel(page)).toBe("#eebe23");
      expect(await mapLayerIds(page)).toContain(ids.missing);
      expect(await mapLayerIds(page)).not.toContain(ids.slow);
      expect(
        requests.filter(({ name, status }) => name === "missing" && status === 404)
      ).not.toHaveLength(0);
      expect(requests.some(({ name, status }) => name === "recovered" && status === 200)).toBe(
        true
      );
    } finally {
      releaseSlow();
    }
  });
});
