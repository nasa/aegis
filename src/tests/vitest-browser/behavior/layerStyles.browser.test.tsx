import { exactText } from "./browserAssertions";
import {
  ids,
  baseStyle,
  mixedGeoJson,
  addSublayer,
} from "tests/playwright/fixtures/layerStyleSeed";
import type { BrowserPage as Page } from "vitest/browser";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type CircleStyle from "ol/style/Circle";
import type Style from "ol/style/Style";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode } from "./planningHelpers";

const fixtureBase = "http://browser-fixture.invalid/layer-styles-assets-fixture";
async function vectorStyles(
  page: Page,
  uuid: string,
  zoom: number
): Promise<VectorStyleSnapshot[]> {
  return (({ uuid, zoom }) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const layer = map
      ?.getLayers()
      .getArray()
      .find((candidate) => candidate.get("uuid") === uuid) as VectorLayer<VectorSource> | undefined;
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
  })({ uuid, zoom });
}

function layerRow(page: Page, name: string) {
  return page
    .getBySelector('[class*="layerGroup"]')
    .filter({ hasText: name })
    .getBySelector('[class*="sublayerItemContainer"]')
    .filter({ hasText: name });
}

async function selectPreset(page: Page, name: string) {
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Title"]'))
    .toMatchTextContent(exactText(name));
}

test.describe("PRESET-005 vector and contour style variants", () => {
  test("line, fill, point and contour labels use saved styles, legends and zoom thresholds", async ({
    page,
    mission,
    requestHandlers,
  }) => {
    requestHandlers["/layer-styles-assets-fixture/mixed.geojson"] = () =>
      Response.json(mixedGeoJson);
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

    await mission.open();
    await enablePlanningEditMode(page);
    await selectPreset(page, "Overview");
    await page.getByLabelText("layers_panel", { exact: true }).click();
    const row = layerRow(page, "Contour and mapped units");
    await expect.element(row).toMatchTextContent("Contour and mapped units (vector)");
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

    await row.getBySelector('svg[data-icon="circle-info"]').click();
    await expect.element(row).toMatchTextContent("Legend (m)");
    for (const item of ["Contour line", "Mapped fill", "Point feature"]) {
      await expect.element(row).toMatchTextContent(item);
    }
    await row.getBySelector('svg[data-icon="sliders"]').click();
    await row.getByLabelText("weight", { exact: true }).fill("5");
    await row.getByLabelText("fillOpacity", { exact: true }).fill("60");
    await row.getByLabelText("labelMinZoom", { exact: true }).fill("3");
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
    await mission.open();
    await selectPreset(page, "Overview");
    expect(
      (await vectorStyles(page, ids.vector, 6)).every(({ strokeWidth }) => strokeWidth === 5)
    ).toBe(true);
  });
});
