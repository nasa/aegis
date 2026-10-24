import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import { enablePlanningEditMode, openPlanningField } from "./planningHelpers";

const presetFolderUuid = "30000000-0000-4000-8000-000000000001";

function presetRow(page: Page, name: string): Locator {
  return page
    .getByLabel("mapPreset", { exact: true })
    .filter({ has: page.getByLabel("leftPresetName", { exact: true }).filter({ hasText: name }) });
}

async function openPresets(page: Page): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toHaveText(
    "Map Display Presets"
  );
}

async function selectPreset(page: Page, name: string): Promise<void> {
  await openPresets(page);
  await presetRow(page, name).getByText(name, { exact: true }).click();
  await expect(page.locator('div[aria-label="Preset Title"]')).toHaveText(name);
}

async function openPresetInfo(page: Page): Promise<void> {
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(page.getByText("Preset Information", { exact: true })).toBeVisible();
}

async function setSunAzimuth(page: Page, degrees: string): Promise<void> {
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  const dialog = await openPlanningField(page, "SunDegrees");
  await dialog.getByLabel("SunDegrees", { exact: true }).fill(degrees);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function setMissionDefault(page: Page, mission: BehavioralMission, presetUuid: string) {
  const preset = (await mission.read()).presets[presetUuid];
  await selectPreset(page, preset.name);
  await openPresetInfo(page);
  await page.getByText("Set to Default", { exact: true }).click();
  await expect
    .poll(async () =>
      Object.values((await mission.read()).presets)
        .filter((preset) => preset.missionDefault)
        .map((preset) => preset.uuid)
    )
    .toEqual([presetUuid]);
}

test.describe("Preset lifecycle and defaults", () => {
  test("presets create, rename, duplicate independently, delete safely, and return to the persisted default", async ({
    page,
    mission,
  }) => {
    await mission.change((draft) => {
      draft.folders[presetFolderUuid] = seedFolder({
        uuid: presetFolderUuid,
        name: "Preset collection",
        type: "preset",
        items: [mission.ids.presetB],
      });
    });
    const initial = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPresets(page);

    await page.getByLabel("Add", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(3);
    const created = Object.values((await mission.read()).presets).find(
      (preset) => !Object.hasOwn(initial.presets, preset.uuid)
    );
    expect(created).toBeDefined();
    await openPresetInfo(page);
    const titleDialog = await openPlanningField(page, "Preset Title");
    await titleDialog.getByLabel("Preset Title", { exact: true }).fill("Lifecycle source");
    await titleDialog.getByText("Save", { exact: true }).click();
    await expect(titleDialog).toHaveCount(0);
    await expect
      .poll(async () => (await mission.read()).presets[created.uuid].name)
      .toBe("Lifecycle source");

    await setSunAzimuth(page, "45");
    await expect.poll(async () => (await mission.read()).presets[created.uuid].sunAzimuth).toBe(45);
    const sourceWithStyle = (await mission.read()).presets[created.uuid];
    await setMissionDefault(page, mission, created.uuid);

    await page.getByLabel("Duplicate", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(4);
    const withCopy = await mission.read();
    const copy = Object.values(withCopy.presets).find(
      (preset) => !Object.hasOwn(initial.presets, preset.uuid) && preset.uuid !== created.uuid
    );
    expect(copy).toBeDefined();
    expect(copy.name).toBe("Lifecycle source (copy 1)");
    expect(copy.missionDefault).toBe(false);
    expect(copy.sunAzimuth).toBe(45);
    expect(copy.uuid).not.toBe(created.uuid);
    expect({
      ...copy,
      uuid: sourceWithStyle.uuid,
      name: sourceWithStyle.name,
      missionDefault: sourceWithStyle.missionDefault,
      createdAt: sourceWithStyle.createdAt,
      updatedAt: sourceWithStyle.updatedAt,
    }).toEqual(sourceWithStyle);

    await setSunAzimuth(page, "210");
    await expect.poll(async () => (await mission.read()).presets[copy.uuid].sunAzimuth).toBe(210);
    expect((await mission.read()).presets[created.uuid].sunAzimuth).toBe(45);
    await expect
      .poll(
        async () =>
          Object.values((await mission.read()).presets).filter((preset) => preset.missionDefault)
            .length
      )
      .toBe(1);

    await setMissionDefault(page, mission, mission.ids.presetB);
    await selectPreset(page, copy.name);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Are you sure you want to delete this Preset?");
      await dialog.dismiss();
    });
    await page.getByLabel("deleteButton", { exact: true }).click();
    expect((await mission.read()).presets[copy.uuid]).toBeDefined();
    expect((await mission.read()).folders[presetFolderUuid].items).toEqual([mission.ids.presetB]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteButton", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).presets[copy.uuid]).toBeUndefined();
    await expect(presetRow(page, "Detail").getByLabel("selectedPreset")).toBeVisible();
    expect((await mission.read()).presets[mission.ids.presetB].missionDefault).toBe(true);

    await setMissionDefault(page, mission, mission.ids.presetA);
    await selectPreset(page, "Detail");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByLabel("deleteButton", { exact: true }).click();
    expect((await mission.read()).presets[mission.ids.presetB]).toBeDefined();
    expect((await mission.read()).folders[presetFolderUuid].items).toEqual([mission.ids.presetB]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetB])
      .toBeUndefined();
    await expect(presetRow(page, "Overview").getByLabel("selectedPreset")).toBeVisible();
    const after = await mission.read();
    expect(after.presets[mission.ids.presetA].missionDefault).toBe(true);
    expect(after.folders[presetFolderUuid].items).toEqual([]);
    expect(after.presets[created.uuid].sunAzimuth).toBe(45);
    expect(after.presets[created.uuid].missionDefault).toBe(false);
    expect(after.evas).toEqual(initial.evas);
    expect(after.stations).toEqual(initial.stations);

    await mission.open(page);
    await openPresets(page);
    await expect(presetRow(page, "Overview").getByLabel("selectedPreset")).toBeVisible();
    const reloaded = await mission.read();
    expect(reloaded.presets[created.uuid].sunAzimuth).toBe(45);
    expect(reloaded.presets[created.uuid].name).toBe("Lifecycle source");
    expect(reloaded.folders[presetFolderUuid].items).toEqual([]);
    expect(
      Object.values(reloaded.presets)
        .filter((preset) => preset.missionDefault)
        .map((preset) => preset.uuid)
    ).toEqual([mission.ids.presetA]);
  });
});
