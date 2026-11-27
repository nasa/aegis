import type { BrowserPage as Page } from "vitest/browser";
import { exactText } from "./browserAssertions";
import { test as base, expect } from "./missionHarness";
const test = base.extend({
  requestHandlers: {
    "/static/missionFiles/1/Data/draft-overlay.geojson": () =>
      Response.json({ type: "FeatureCollection", features: [] }),
  },
});
import { enablePlanningEditMode, openPlanningField } from "./planningHelpers";

const layerUuid = "30000000-0000-4000-8000-000000009001";
const sublayerUuid = "30000000-0000-4000-8000-000000009002";
const circleUuid = "30000000-0000-4000-8000-000000009003";

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

test("preset drafts save or cancel independently and styles, visibility and descriptions survive remount", async ({
  page,
  mission,
}) => {
  const initialStyle = {
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
  await mission.change((doc) => {
    doc.layers[layerUuid] = {
      uuid: layerUuid,
      name: "Preset draft layer",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.sublayers[sublayerUuid] = {
      uuid: sublayerUuid,
      layerUuid,
      type: "vector",
      name: "Draft overlay",
      description: "A fixture overlay for preset editing",
      legend: null,
      path: "draft-overlay.geojson",
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
    doc.circleDefinitions[circleUuid] = { name: "Draft radius", radius: 25 };
    for (const presetUuid of [mission.ids.presetA, mission.ids.presetB]) {
      const preset = doc.presets[presetUuid];
      preset.layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
      preset.mapSublayerControls[sublayerUuid] = {
        name: "Draft overlay",
        sublayerUuid,
        visible: presetUuid === mission.ids.presetA,
        style: { ...initialStyle },
      };
      preset.mapCircleControls[circleUuid] = {
        uuid: circleUuid,
        visible: presetUuid === mission.ids.presetA,
        style: { ...initialStyle },
      };
      preset.description = presetUuid === mission.ids.presetA ? "30" : "210";
    }
  });

  await mission.open();
  await enablePlanningEditMode(page);
  await selectPreset(page, "Overview");
  await page.getByLabelText("info_panel", { exact: true }).click();
  expect((await mission.read()).presets[mission.ids.presetA].description).toBe("30");
  const draft = await openPlanningField(page, "Preset Description");
  await draft.getByLabelText("Preset Description", { exact: true }).fill("75");
  await expect
    .element(draft.getByLabelText("Preset Description", { exact: true }))
    .toHaveValue("75");
  expect((await mission.read()).presets[mission.ids.presetA].description).toBe("30");
  expect((await mission.read()).presets[mission.ids.presetB].description).toBe("210");
  await draft.getByText("Cancel", { exact: true }).click();
  await expect.poll(() => draft.length).toBe(0);
  expect((await mission.read()).presets[mission.ids.presetA].description).toBe("30");

  const save = await openPlanningField(page, "Preset Description");
  await save.getByLabelText("Preset Description", { exact: true }).fill("75");
  await save.getByText("Save", { exact: true }).click();
  await expect.poll(() => save.length).toBe(0);
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].description)
    .toBe("75");

  await page.getByLabelText("layers_panel", { exact: true }).click();
  await expect.element(page.getByText("Draft overlay (vector)", { exact: true })).toBeVisible();
  const layerRow = page.getByText("Draft overlay (vector)", { exact: true }).getBySelector("..");
  await layerRow.getBySelector('svg[data-icon="sliders"]').click();
  await page.getByLabelText("opacity", { exact: true }).fill("35");
  await expect
    .poll(
      async () =>
        (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid].style
          .opacity
    )
    .toBe(0.35);
  await layerRow.getBySelector('svg[data-icon="eye"]').click();
  await expect
    .poll(
      async () =>
        (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid]
          .visible
    )
    .toBe(false);
  expect(
    (await mission.read()).presets[mission.ids.presetB].mapSublayerControls[sublayerUuid].visible
  ).toBe(false);
  await page.getByLabelText("circle_panel", { exact: true }).click();
  await expect.element(page.getByText("Draft radius", { exact: true })).toBeVisible();
  await page
    .getByText("Draft radius", { exact: true })
    .getBySelector("..")
    .getBySelector('svg[data-icon="eye"]')
    .click();
  await expect
    .poll(
      async () =>
        (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid].visible
    )
    .toBe(false);
  expect(
    (await mission.read()).presets[mission.ids.presetB].mapCircleControls[circleUuid].visible
  ).toBe(false);
  await selectPreset(page, "Detail");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Description"]'))
    .toMatchTextContent(exactText("210"));
  await selectPreset(page, "Overview");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Description"]'))
    .toMatchTextContent(exactText("75"));
  await mission.open();
  expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({
    description: "75",
  });
  expect(
    (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid].visible
  ).toBe(false);
  expect(
    (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid].style
      .opacity
  ).toBe(0.35);
  expect(
    (await mission.read()).presets[mission.ids.presetA].mapCircleControls[circleUuid].visible
  ).toBe(false);
  expect((await mission.read()).presets[mission.ids.presetB]).toMatchObject({
    description: "210",
  });
  expect(
    (await mission.read()).presets[mission.ids.presetB].mapSublayerControls[sublayerUuid].visible
  ).toBe(false);
  expect(
    (await mission.read()).presets[mission.ids.presetB].mapCircleControls[circleUuid].visible
  ).toBe(false);
});
