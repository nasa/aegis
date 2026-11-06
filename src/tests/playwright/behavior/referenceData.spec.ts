import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, selectPlanningStationActions } from "./planningHelpers";

async function openMissionConfig(page: Page, tab: string, title: string): Promise<void> {
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel(tab, { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(title);
}

async function editDialogField(
  page: Page,
  label: string,
  value: string,
  scope: Locator = page.locator("body")
): Promise<void> {
  const dialog = page.locator("dialog[open]");
  if (!(await dialog.count())) {
    const target = scope.locator(`div[aria-label="${label}"]`).first();
    if (await target.isVisible()) {
      await target.click();
    } else {
      await target.locator("../..").click();
    }
  }
  await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function toggleActionAssociation(
  page: Page,
  label: string,
  actionName = "Sample regolith"
): Promise<void> {
  if (!(await page.getByText(label, { exact: true }).isVisible())) {
    const actionRow = page.getByRole("listitem").filter({ hasText: actionName });
    await actionRow.locator('div[class*="actionHeadingCaret"]').click();
  }
  await toggleCheckbox(page.locator("body"), label);
}

async function toggleCheckbox(scope: Locator, label: string): Promise<void> {
  const labelNode = scope.getByText(label, { exact: true });
  const inputId = await labelNode.evaluate((element) => element.closest("label")?.htmlFor);
  expect(inputId, `The ${label} checkbox label must target its control`).toBeTruthy();
  await scope.locator(`input[id="${inputId}"]`).click();
}

async function ensureTemplateExpanded(row: Locator): Promise<void> {
  if (await row.locator('svg[data-icon="caret-right"]').count()) {
    await row.getByLabel("Expand Button", { exact: true }).click();
  }
}

test.describe("Reference data contracts", () => {
  test("geographic units can be created and edited with abbreviation validation and durable values", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    await page.getByLabel("addGeoUnitButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).geographicUnits).length)
      .toBe(1);
    await editDialogField(page, "Geographic unit name", "Highland Basin");
    await editDialogField(page, "Geographic unit abbreviation", "HB");
    await expect
      .poll(async () => Object.values((await mission.read()).geographicUnits)[0]?.abbr)
      .toBe("HB");
    const beforeInvalid = await mission.read();
    const unitRow = page
      .getByLabel("geoUnitList-item", { exact: true })
      .filter({ hasText: "Highland Basin" });
    const invalid = page.locator("dialog[open]");
    await unitRow.locator('div[aria-label="Geographic unit abbreviation"]').first().click();
    await expect(invalid.getByLabel("Geographic unit abbreviation", { exact: true })).toBeVisible();
    await invalid.getByLabel("Geographic unit abbreviation", { exact: true }).fill("TOOLONG");
    await expect(
      invalid.getByText("Must be at no more than 5 characters", { exact: true })
    ).toBeVisible();
    await expect(invalid.getByText("Save", { exact: true })).toBeDisabled();
    await expect(invalid.getByLabel("Geographic unit abbreviation", { exact: true })).toBeVisible();
    await invalid.getByText("Cancel", { exact: true }).click();
    const persisted = await mission.read();
    expect(persisted.geographicUnits).toEqual(beforeInvalid.geographicUnits);
    const [uuid, unit] = Object.entries(persisted.geographicUnits)[0];
    expect(unit).toMatchObject({ name: "Highland Basin", abbr: "HB" });
    expect(persisted.actions).toEqual(beforeInvalid.actions);
    await mission.open(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    const item = page.getByLabel("geoUnitList-item", { exact: true });
    await expect(item).toHaveCount(1);
    await expect(item.getByText("Highland Basin", { exact: true })).toBeVisible();
    expect((await mission.read()).geographicUnits[uuid]).toMatchObject({
      name: "Highland Basin",
      abbr: "HB",
    });

    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await toggleActionAssociation(page, "Highland Basin");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].geographicUnitsUsage)
      .toContain(uuid);
    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    await page.getByLabel("addNewTemplateButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(1);
    const templateUuid = Object.keys((await mission.read()).actionTemplates)[0];
    const templateName = (await mission.read()).actionTemplates[templateUuid].templateName!;
    const templateRow = page
      .getByLabel("templateList-item", { exact: true })
      .filter({ hasText: templateName });
    await ensureTemplateExpanded(templateRow);
    await toggleCheckbox(templateRow, "Highland Basin");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[templateUuid].geographicUnitsUsage)
      .toContain(uuid);

    await mission.open(page);
    const afterConsumerReload = await mission.read();
    expect(afterConsumerReload.actions[mission.ids.actionA].geographicUnitsUsage).toContain(uuid);
    expect(afterConsumerReload.actionTemplates[templateUuid].geographicUnitsUsage).toContain(uuid);
    await selectPlanningStationActions(page, "Alpha station");
    const sampleActionRow = page.getByRole("listitem").filter({ hasText: "Sample regolith" });
    if (!(await sampleActionRow.getByText("Highland Basin", { exact: true }).isVisible())) {
      await sampleActionRow.locator('div[class*="actionHeadingCaret"]').click();
    }
    await expect(sampleActionRow.getByText("Highland Basin", { exact: true })).toBeVisible();
    await page.getByLabel("mission Section", { exact: true }).click();
    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-all-evas").uncheck();
    await page.locator("#export-actions").check();
    const downloadPending = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await downloadPending;
    expect(await download.failure()).toBeNull();
    const exported = JSON.parse(await readFile(await download.path(), "utf8")) as {
      actions: Array<{ uuid: string; geographicalUnitsReadable: string[] | null }>;
    };
    expect(
      exported.actions.find((action) => action.uuid === mission.ids.actionA)
        ?.geographicalUnitsReadable
    ).toEqual(["Highland Basin"]);

    await enablePlanningEditMode(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("alert");
      expect(dialog.message()).toContain("Reference POI");
      expect(dialog.message()).toContain(templateName);
      await dialog.accept();
    });
    await item.getByLabel("deleteButton", { exact: true }).click();
    expect((await mission.read()).geographicUnits[uuid]).toMatchObject({
      name: "Highland Basin",
      abbr: "HB",
    });

    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    await ensureTemplateExpanded(templateRow);
    await toggleCheckbox(templateRow, "Highland Basin");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[templateUuid].geographicUnitsUsage)
      .not.toContain(uuid);
    await selectPlanningStationActions(page, "Alpha station");
    await toggleActionAssociation(page, "Highland Basin");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].geographicUnitsUsage)
      .not.toContain(uuid);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    await item.getByLabel("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => Object.hasOwn((await mission.read()).geographicUnits, uuid))
      .toBe(false);
    await mission.open(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(0);
  });
});
