import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, openPlanningField } from "./planningHelpers";

const layerUuid = "30000000-0000-4000-8000-000000009001";
const sublayerUuid = "30000000-0000-4000-8000-000000009002";
const circleUuid = "30000000-0000-4000-8000-000000009003";

async function selectPreset(page: Page, name: string): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText(name);
}

test("preset edits keep an unsaved value local until Save, Cancel restores it, and saved style and circle changes reach a peer", async ({
  page,
  context,
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
      preset.sunEnabled = true;
      preset.sunAzimuth = presetUuid === mission.ids.presetA ? 30 : 210;
    }
  });

  const peer = await context.newPage();
  try {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPreset(page, "Overview");
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await selectPreset(peer, "Overview");
    await peer.getByLabel("azimuth_panel", { exact: true }).click();
    const peerInitial = await mission.read();
    expect(peerInitial.presets[mission.ids.presetA].sunAzimuth).toBe(30);
    const peerSunDegrees = peer.locator('input[name="SunDegrees"]');
    await expect(peerSunDegrees).toHaveValue("30");

    const draft = await openPlanningField(page, "SunDegrees");
    await draft.getByLabel("SunDegrees", { exact: true }).fill("75");
    await expect(draft.locator('input[name="SunDegrees"]')).toHaveValue("75");
    expect((await mission.read()).presets[mission.ids.presetA].sunAzimuth).toBe(30);
    await expect(peerSunDegrees).toHaveValue("30");
    expect((await mission.read()).presets[mission.ids.presetB].sunAzimuth).toBe(210);
    await draft.getByText("Cancel", { exact: true }).click();
    await expect(draft).toHaveCount(0);
    expect((await mission.read()).presets[mission.ids.presetA].sunAzimuth).toBe(30);

    const save = await openPlanningField(page, "SunDegrees");
    await save.getByLabel("SunDegrees", { exact: true }).fill("75");
    await save.getByText("Save", { exact: true }).click();
    await expect(save).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunAzimuth)
      .toBe(75);
    await expect(peerSunDegrees).toHaveValue("75");

    await page.getByLabel("layers_panel", { exact: true }).click();
    await expect(page.getByText("Draft overlay (vector)", { exact: true })).toBeVisible();
    const layerRow = page.getByText("Draft overlay (vector)", { exact: true }).locator("..");
    await layerRow.locator('svg[data-icon="sliders"]').click();
    await page.getByLabel("opacity", { exact: true }).fill("35");
    await expect
      .poll(
        async () =>
          (await mission.read()).presets[mission.ids.presetA].mapSublayerControls[sublayerUuid]
            .style.opacity
      )
      .toBe(0.35);
    await layerRow.locator('svg[data-icon="eye"]').click();
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
    await peer.getByLabel("layers_panel", { exact: true }).click();
    const peerLayerRow = peer.getByText("Draft overlay (vector)", { exact: true }).locator("..");
    await expect(peerLayerRow.locator('svg[data-icon="eye-slash"]')).toBeVisible();
    await peerLayerRow.locator('svg[data-icon="sliders"]').click();
    await expect(peer.getByLabel("opacity", { exact: true })).toHaveValue("35");

    await page.getByLabel("circle_panel", { exact: true }).click();
    await expect(page.getByText("Draft radius", { exact: true })).toBeVisible();
    await page
      .getByText("Draft radius", { exact: true })
      .locator("..")
      .locator('svg[data-icon="eye"]')
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
    await peer.getByLabel("circle_panel", { exact: true }).click();
    const peerCircleRow = peer.getByText("Draft radius", { exact: true }).locator("..");
    await expect(peerCircleRow.locator('svg[data-icon="eye-slash"]')).toBeVisible();

    await selectPreset(page, "Detail");
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(page.locator('input[name="SunDegrees"]')).toHaveValue("210");
    await selectPreset(page, "Overview");
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(page.locator('input[name="SunDegrees"]')).toHaveValue("75");
    await page.reload();
    expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({ sunAzimuth: 75 });
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
    expect((await mission.read()).presets[mission.ids.presetB]).toMatchObject({ sunAzimuth: 210 });
    expect(
      (await mission.read()).presets[mission.ids.presetB].mapSublayerControls[sublayerUuid].visible
    ).toBe(false);
    expect(
      (await mission.read()).presets[mission.ids.presetB].mapCircleControls[circleUuid].visible
    ).toBe(false);
  } finally {
    await peer.close();
  }
});
