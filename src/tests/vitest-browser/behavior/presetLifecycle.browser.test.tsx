import { vi } from "vitest";
import { exactText } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedFolder } from "tests/playwright/fixtures/entitySeeds";
import { enablePlanningEditMode, openPlanningField } from "./planningHelpers";

const presetFolderUuid = "30000000-0000-4000-8000-000000000001";

function presetRow(page: Page, name: string): Locator {
  return page.getByLabelText("mapPreset", { exact: true }).filter({
    has: page.getByLabelText("leftPresetName", { exact: true }).filter({ hasText: name }),
  });
}

async function openPresets(page: Page): Promise<void> {
  await page.getByLabelText("preset Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }))
    .toMatchTextContent(exactText("Map Display Presets"));
}

async function selectPreset(page: Page, name: string): Promise<void> {
  await openPresets(page);
  await presetRow(page, name).getByText(name, { exact: true }).click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Title"]'))
    .toMatchTextContent(exactText(name));
}

async function openPresetInfo(page: Page): Promise<void> {
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(page.getByText("Preset Information", { exact: true })).toBeVisible();
}

async function setPresetDescription(page: Page, description: string): Promise<void> {
  await page.getByLabelText("info_panel", { exact: true }).click();
  const dialog = await openPlanningField(page, "Preset Description");
  await dialog.getByLabelText("Preset Description", { exact: true }).fill(description);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

async function setMissionDefault(page: Page, mission: BrowserMission, presetUuid: string) {
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
    await mission.open();
    await enablePlanningEditMode(page);
    await openPresets(page);

    await page.getByLabelText("Add", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(3);
    const created = Object.values((await mission.read()).presets).find(
      (preset) => !Object.hasOwn(initial.presets, preset.uuid)
    );
    expect(created).toBeDefined();
    await openPresetInfo(page);
    const titleDialog = await openPlanningField(page, "Preset Title");
    await titleDialog.getByLabelText("Preset Title", { exact: true }).fill("Lifecycle source");
    await titleDialog.getByText("Save", { exact: true }).click();
    await expect.poll(() => titleDialog.length).toBe(0);
    await expect
      .poll(async () => (await mission.read()).presets[created.uuid].name)
      .toBe("Lifecycle source");

    await setPresetDescription(page, "45");
    await expect
      .poll(async () => (await mission.read()).presets[created.uuid].description)
      .toBe("45");
    const sourceWithStyle = (await mission.read()).presets[created.uuid];
    await setMissionDefault(page, mission, created.uuid);

    await page.getByLabelText("Duplicate", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).presets).length).toBe(4);
    const withCopy = await mission.read();
    const copy = Object.values(withCopy.presets).find(
      (preset) => !Object.hasOwn(initial.presets, preset.uuid) && preset.uuid !== created.uuid
    );
    expect(copy).toBeDefined();
    expect(copy.name).toBe("Lifecycle source (copy 1)");
    expect(copy.missionDefault).toBe(false);
    expect(copy.description).toBe("45");
    expect(copy.uuid).not.toBe(created.uuid);
    expect({
      ...copy,
      uuid: sourceWithStyle.uuid,
      name: sourceWithStyle.name,
      missionDefault: sourceWithStyle.missionDefault,
      createdAt: sourceWithStyle.createdAt,
      updatedAt: sourceWithStyle.updatedAt,
    }).toEqual(sourceWithStyle);

    await setPresetDescription(page, "210");
    await expect
      .poll(async () => (await mission.read()).presets[copy.uuid].description)
      .toBe("210");
    expect((await mission.read()).presets[created.uuid].description).toBe("45");
    await expect
      .poll(
        async () =>
          Object.values((await mission.read()).presets).filter((preset) => preset.missionDefault)
            .length
      )
      .toBe(1);

    await setMissionDefault(page, mission, mission.ids.presetB);
    await selectPreset(page, copy.name);
    vi.spyOn(window, "confirm").mockImplementationOnce((message) => {
      expect(String(message)).toBe("Are you sure you want to delete this Preset?");

      return false;
    });
    await page.getByLabelText("deleteButton", { exact: true }).click();
    expect((await mission.read()).presets[copy.uuid]).toBeDefined();
    expect((await mission.read()).folders[presetFolderUuid].items).toEqual([mission.ids.presetB]);

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await page.getByLabelText("deleteButton", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).presets[copy.uuid]).toBeUndefined();
    await expect.element(presetRow(page, "Detail").getByLabelText("selectedPreset")).toBeVisible();
    expect((await mission.read()).presets[mission.ids.presetB].missionDefault).toBe(true);

    await setMissionDefault(page, mission, mission.ids.presetA);
    await selectPreset(page, "Detail");
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await page.getByLabelText("deleteButton", { exact: true }).click();
    expect((await mission.read()).presets[mission.ids.presetB]).toBeDefined();
    expect((await mission.read()).folders[presetFolderUuid].items).toEqual([mission.ids.presetB]);

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await page.getByLabelText("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetB])
      .toBeUndefined();
    await expect
      .element(presetRow(page, "Overview").getByLabelText("selectedPreset"))
      .toBeVisible();
    const after = await mission.read();
    expect(after.presets[mission.ids.presetA].missionDefault).toBe(true);
    expect(after.folders[presetFolderUuid].items).toEqual([]);
    expect(after.presets[created.uuid].description).toBe("45");
    expect(after.presets[created.uuid].missionDefault).toBe(false);
    expect(after.evas).toEqual(initial.evas);
    expect(after.stations).toEqual(initial.stations);

    await mission.open();
    await openPresets(page);
    await expect
      .element(presetRow(page, "Overview").getByLabelText("selectedPreset"))
      .toBeVisible();
    const remounted = await mission.read();
    expect(remounted.presets[created.uuid].description).toBe("45");
    expect(remounted.presets[created.uuid].name).toBe("Lifecycle source");
    expect(remounted.folders[presetFolderUuid].items).toEqual([]);
    expect(
      Object.values(remounted.presets)
        .filter((preset) => preset.missionDefault)
        .map((preset) => preset.uuid)
    ).toEqual([mission.ids.presetA]);
  });
});
