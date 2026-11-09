import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test as base, expect } from "./missionHarness";
const test = base;
import { enablePlanningEditMode } from "./planningHelpers";

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

async function circleRings(page: Page, mode: "editor" | "dashboard") {
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
}

async function selectPreset(page: Page, name: string): Promise<void> {
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

test.describe("PRESET-008 lander circles", () => {
  const test = base.extend({ scenario: "execution" as BehavioralScenario });

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
    await mission.open();
    await enablePlanningEditMode(page);
    await selectPreset(page, "Overview");
    await page.getByLabelText("circle_panel", { exact: true }).click();
    const circleRow = page
      .getBySelector('[class*="sublayerItemContainer"]')
      .filter({ hasText: "Known 750 metre ring" });
    await expect.element(circleRow).toMatchTextContent("750m");
    await expect.poll(() => circleRings(page, "editor")).toHaveLength(0);
    await circleRow.getBySelector('svg[data-icon="eye-slash"]').click();

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

    await circleRow.getBySelector('svg[data-icon="sliders"]').click();
    await page.getByLabelText("weight", { exact: true }).fill("5");
    await expect
      .poll(
        async () =>
          (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid].style
            .weight
      )
      .toBe(5);
    await mission.open();
    await selectPreset(page, "Overview");
    await expect.poll(() => circleRings(page, "editor")).toHaveLength(1);
    await assertMeterRadius("editor");
    expect(
      (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid]
    ).toMatchObject({
      visible: true,
      style: { weight: 5 },
    });

    await mission.openDashboard();
    await expect
      .element(page.getBySelector('[data-map-mode="dashboard"] .ol-viewport'))
      .toBeVisible();
    await expect.poll(() => circleRings(page, "dashboard")).toHaveLength(1);
    await assertMeterRadius("dashboard");
  });
});
