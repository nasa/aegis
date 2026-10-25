import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import reference from "../../vitest/fixtures/lunarSky/reference.json" with { type: "json" };
import { enablePlanningEditMode, openPlanningField, selectPlanningEva } from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

const normalize = (degrees: number) => ((degrees % 360) + 360) % 360;

async function openDirections(page: Page) {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  if (
    !(await page.getByRole("button", { name: "Sun/Earth value source", exact: true }).isVisible())
  ) {
    await page.getByTestId("map-menu-launcher").click();
    const menu = page.getByTestId("map-menu-floating-panel");
    await menu.getByText("Sun/Earth Directions", { exact: true }).click();
    await menu.locator('svg[data-icon="xmark"]').click();
  }
}

async function indicatorAngles(page: Page) {
  return page
    .locator('[data-map-mode="editor"] [class*="sunEarthIcon_"]')
    .evaluateAll((icons: HTMLElement[]) =>
      icons.map((icon) => {
        const x = Number.parseFloat(icon.style.left);
        const y = Number.parseFloat(icon.style.top);
        return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      })
    );
}

async function expectAngles(page: Page, sun: number, earth: number) {
  await expect
    .poll(() => indicatorAngles(page))
    .toEqual([expect.closeTo(normalize(sun), 1), expect.closeTo(normalize(earth), 1)]);
  const map = page.locator('[data-map-mode="editor"]');
  await expect(map.locator('[class*="azimuthText_"]')).toHaveText([
    `${Math.round(normalize(sun)) % 360}°`,
    `${Math.round(normalize(earth)) % 360}°`,
  ]);
}

for (const polar of [false, true]) {
  test(`calculated celestial directions follow independent SPICE values and ${polar ? "polar" : "Mercator"} map north while manual values survive mode changes`, async ({
    page,
    mission,
  }) => {
    const samples = reference.cases.filter(
      (sample) =>
        sample.site === "lander" &&
        ["2028-08-04T22:00:00Z", "2028-08-05T22:00:00Z"].includes(sample.utc)
    );
    expect(samples).toHaveLength(2);
    await mission.change((doc) => {
      doc.landerLocation = samples[0].point;
      doc.landerElevationMeters = samples[0].heightMeters;
      doc.planetRadius = samples[0].radiusMeters;
      doc.evas[mission.ids.evaA].datetime = Date.parse(samples[0].utc);
      doc.evas[mission.ids.evaA].sequence = [];
      doc.presets[mission.ids.presetA].sunAzimuth = 17;
      doc.presets[mission.ids.presetA].earthAzimuth = 263;
      doc.presets[mission.ids.presetA].sunEnabled = true;
      doc.presets[mission.ids.presetA].earthEnabled = true;
      if (polar) {
        doc.projIsCustom = true;
        doc.projEpsg = "AEGIS:CELESTIAL-TEST";
        doc.projProj4String =
          "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs";
        doc.projBoundsMinX = -5000000;
        doc.projBoundsMinY = -5000000;
        doc.projBoundsMaxX = 5000000;
        doc.projBoundsMaxY = 5000000;
        doc.projResZoomLevel = 0;
        doc.projResUnitsPerPixel = 1000;
      }
    });
    await mission.open(page);
    await selectPlanningEva(page, "Survey Alpha");
    await enablePlanningEditMode(page);
    await openDirections(page);
    await expectAngles(page, 17, 263);
    await page.locator("#sunEarthFromDateCheckbox").check();
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunEarthFromDate)
      .toBe(true);
    for (const sample of samples) {
      await mission.change((doc) => {
        doc.evas[mission.ids.evaA].datetime = Date.parse(sample.utc);
      });
      const rotation = polar ? sample.point.lng : 0;
      await expectAngles(
        page,
        sample.spice.sun.azimuth + rotation,
        sample.spice.earth.azimuth + rotation
      );
      await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toHaveText(
        "Source: Selected EVA: Survey Alpha"
      );
      await expect(
        page.getByRole("button", { name: "Sun/Earth value source", exact: true })
      ).toHaveAttribute("data-status", "Calculated");
      expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({
        sunAzimuth: 17,
        earthAzimuth: 263,
      });
    }
    const alternate = reference.cases.find(
      (sample) => sample.site === "southern-midlatitude" && sample.utc === samples[0].utc
    );
    await mission.change((doc) => {
      doc.landerLocation = alternate.point;
      doc.landerElevationMeters = alternate.heightMeters;
      doc.evas[mission.ids.evaA].datetime = Date.parse(alternate.utc);
    });
    await expectAngles(
      page,
      alternate.spice.sun.azimuth + (polar ? alternate.point.lng : 0),
      alternate.spice.earth.azimuth + (polar ? alternate.point.lng : 0)
    );
    await page.locator("#sunEarthFromDateCheckbox").uncheck();
    await expectAngles(page, 17, 263);
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA])
      .toMatchObject({ sunEarthFromDate: false, sunAzimuth: 17, earthAzimuth: 263 });
    await page.reload();
    await expectAngles(page, 17, 263);
    const saved = (await mission.read()).presets[mission.ids.presetA];
    expect(saved).toMatchObject({ sunEarthFromDate: false, sunAzimuth: 17, earthAzimuth: 263 });
  });
}

test("manual celestial drafts save and cancel without changing unrelated compass settings", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.presets[mission.ids.presetA].sunEnabled = true;
    doc.presets[mission.ids.presetA].earthEnabled = true;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openDirections(page);
  for (const degrees of [0, 90, 359]) {
    for (const field of ["SunDegrees", "EarthDegrees"]) {
      const dialog = await openPlanningField(page, field);
      await dialog.getByLabel(field, { exact: true }).fill(String(degrees));
      await dialog.getByText("Save", { exact: true }).click();
    }
    await expectAngles(page, degrees, degrees);
    const dialog = await openPlanningField(page, "SunDegrees");
    await dialog.getByLabel("SunDegrees", { exact: true }).fill("55");
    await dialog.getByText("Cancel", { exact: true }).click();
    await expectAngles(page, degrees, degrees);
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunAzimuth)
      .toBe(degrees);
  }
  await page.locator("#sunCheckbox").uncheck();
  await page.locator("#earthCheckbox").uncheck();
  await expect(
    page.getByRole("button", { name: "Sun/Earth value source", exact: true })
  ).toHaveCount(0);
  await page.locator("#earthCheckbox").check();
  await page.getByLabel("moonDirectionButton", { exact: true }).click();
  await expect(page.locator('[data-map-mode="editor"] svg[data-icon="moon"]')).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].earthAsMoon)
    .toBe(true);
  await page.reload();
  expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({
    sunEnabled: false,
    earthEnabled: true,
    earthAsMoon: true,
    sunAzimuth: 359,
    earthAzimuth: 359,
  });
});

test.describe("Celestial time attribution and fallback", () => {
  test.use({ scenario: "execution" });
  test("planned, historical, running, layer and preview dates identify their source and invalid prerequisites retain manual directions", async ({
    page,
    mission,
  }) => {
    const layer = "30000000-0000-4000-8000-000000008012";
    const sublayer = "30000000-0000-4000-8000-000000008013";
    await mission.change((doc) => {
      doc.projIsCustom = true;
      doc.projEpsg = "EPSG:3857";
      doc.projProj4String = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +units=m +no_defs";
      doc.projBoundsMinX = -20037508;
      doc.projBoundsMinY = -20037508;
      doc.projBoundsMaxX = 20037508;
      doc.projBoundsMaxY = 20037508;
      doc.projResZoomLevel = 0;
      doc.projResUnitsPerPixel = 156543.033928;
      doc.presets[mission.ids.presetA].sunEnabled = true;
      doc.presets[mission.ids.presetA].earthEnabled = true;
      doc.presets[mission.ids.presetA].sunEarthFromDate = true;
      doc.presets[mission.ids.presetA].sunAzimuth = 34;
      doc.presets[mission.ids.presetA].earthAzimuth = 278;
      doc.evas[mission.ids.evaA].datetime = Date.parse("2028-08-04T22:00:00Z");
      doc.evas[mission.ids.rexEvaA].datetime = Date.parse("2028-08-05T22:00:00Z");
      doc.evas[mission.ids.rexEvaB].datetime = Date.parse("2028-08-06T22:00:00Z");
      doc.evas[mission.ids.rexEvaA].name = "Historical Alpha";
      doc.evas[mission.ids.rexEvaB].name = "Running Bravo";
      doc.layers[layer] = { uuid: layer, name: "Date reference", createdAt: 1, updatedAt: 1 };
      doc.sublayers[sublayer] = {
        uuid: sublayer,
        layerUuid: layer,
        type: "tile",
        name: "Lunar light",
        description: "",
        legend: null,
        path: "celestial-tiles",
        tilePattern: "xyz",
        boundingBox: null,
        tileFormat: "png",
        minNativeZoom: 0,
        maxNativeZoom: 1,
        maxZoom: 22,
        isTimeBased: true,
        timeLayerManifest: [
          {
            datetime: "2028-08-07T22:00:00Z",
            dirName: "slice",
            lowerBound: "2028-08-01T00:00:00Z",
            upperBound: "2028-09-01T00:00:00Z",
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      };
      doc.presets[mission.ids.presetA].layerOrder = [
        { layerUuid: layer, sublayerUuids: [sublayer] },
      ];
      doc.presets[mission.ids.presetA].mapSublayerControls[sublayer] = {
        name: "Lunar light",
        sublayerUuid: sublayer,
        visible: true,
        style: { ...doc.presets[mission.ids.presetA].mapGridControl.style },
      };
    });
    await page.route("**/celestial-tiles/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64"
        ),
      })
    );
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openDirections(page);
    const source = page.getByRole("button", { name: "Sun/Earth value source", exact: true });
    for (const [plan, evaUuid, name, date] of [
      ["Survey Alpha", mission.ids.evaA, "Survey Alpha", "2028-08-04"],
      ["Survey Alpha", mission.ids.rexEvaA, "Historical Alpha", "2028-08-05"],
      ["Survey Bravo", mission.ids.rexEvaB, "Running Bravo", "2028-08-06"],
    ]) {
      await selectExecution(page, plan, evaUuid);
      if (!(await page.locator('div[aria-label="EVA Title"]').isVisible())) {
        await page
          .getByLabel("evaList-item", { exact: true })
          .filter({ hasText: plan })
          .getByText(plan, { exact: true })
          .first()
          .click();
      }
      await openDirections(page);
      await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
        `Selected EVA: ${name}`
      );
      await expect(page.getByLabel("sunEarthFromDateNote", { exact: true })).toContainText(date);
      await expect(source).toHaveAttribute("data-status", "Calculated");
      await expect(source).toHaveAttribute("aria-description", /Calculated|Selected EVA|date/i);
    }
    await mission.change((doc) => {
      doc.evas[mission.ids.rexEvaB].datetime = null;
    });
    await expect(source).toHaveAttribute("data-status", "Fallback");
    await expect(source).toHaveAttribute("aria-description", /no valid date/i);
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "has no valid date"
    );
    await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
      "Time-based layer: Lunar light (fallback)"
    );
    await page.getByLabel("layers_panel", { exact: true }).click();
    await page
      .getByText("Time Preview", { exact: true })
      .locator("..")
      .getByRole("checkbox")
      .check();
    await expect(source).toHaveAttribute("data-status", "Preview");
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
      "Preset preview"
    );
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "has no valid date"
    );
    await mission.change((doc) => {
      doc.landerLocation = { lat: null, lng: null };
    });
    await expect(source).toHaveAttribute("data-status", "Manual");
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "Lander location is unavailable"
    );
    await expectAngles(page, 34, 278);
    await mission.change((doc) => {
      doc.landerLocation = { lat: 0, lng: 0 };
      doc.projProj4String = "unresolved-test-projection";
    });
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "Map projection is unavailable"
    );
    await expectAngles(page, 34, 278);
    await mission.change((doc) => {
      doc.projProj4String = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +units=m +no_defs";
      delete doc.sublayers[sublayer];
      doc.presets[mission.ids.presetA].mapSublayerControls = {};
    });
    await page.getByLabel("layers_panel", { exact: true }).click();
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(source).toHaveAttribute("data-status", "Manual");
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "has no valid date"
    );
    await expectAngles(page, 34, 278);
    expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({
      sunAzimuth: 34,
      earthAzimuth: 278,
      sunEarthFromDate: true,
    });
  });
});
