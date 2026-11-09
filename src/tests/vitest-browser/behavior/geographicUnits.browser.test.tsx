import { vi } from "vitest";
import { exactText, isVisible, setChecked } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode, selectPlanningStationActions } from "./planningHelpers";

async function openMissionConfig(page: Page, tab: string, title: string): Promise<void> {
  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText(tab, { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toMatchTextContent(exactText(title));
}

async function editDialogField(
  page: Page,
  label: string,
  value: string,
  scope: Locator = page.getBySelector("body")
): Promise<void> {
  const dialog = page.getBySelector("dialog[open]");
  if (!dialog.length) {
    const target = scope.getBySelector(`div[aria-label="${label}"]`).first();
    if (isVisible(target)) {
      await target.click();
    } else {
      await target.getBySelector("../..").click();
    }
  }
  await expect.element(dialog.getByLabelText(label, { exact: true })).toBeVisible();
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

async function toggleActionAssociation(
  page: Page,
  label: string,
  actionName = "Sample regolith"
): Promise<void> {
  if (!isVisible(page.getByText(label, { exact: true }))) {
    const actionRow = page.getByRole("listitem").filter({ hasText: actionName });
    await actionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
  }
  await toggleCheckbox(page.getBySelector("body"), label);
}

async function toggleCheckbox(scope: Locator, label: string): Promise<void> {
  const labelNode = scope.getByText(label, { exact: true });
  const inputId = labelNode.element().closest("label")?.htmlFor;
  expect(inputId, `The ${label} checkbox label must target its control`).toBeTruthy();
  await scope.getBySelector(`input[id="${inputId}"]`).click();
}

async function ensureTemplateExpanded(row: Locator): Promise<void> {
  if (row.getBySelector('svg[data-icon="caret-right"]').length) {
    await row.getByLabelText("Expand Button", { exact: true }).click();
  }
}

test.describe("Reference data contracts", () => {
  test("geographic units can be created and edited with abbreviation validation and durable values", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 1;
    });
    await mission.open();
    await enablePlanningEditMode(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    await page.getByLabelText("addGeoUnitButton", { exact: true }).click();
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
      .getByLabelText("geoUnitList-item", { exact: true })
      .filter({ hasText: "Highland Basin" });
    const invalid = page.getBySelector("dialog[open]");
    await unitRow.getBySelector('div[aria-label="Geographic unit abbreviation"]').first().click();
    await expect
      .element(invalid.getByLabelText("Geographic unit abbreviation", { exact: true }))
      .toBeVisible();
    await invalid.getByLabelText("Geographic unit abbreviation", { exact: true }).fill("TOOLONG");
    await expect
      .element(invalid.getByText("Must be at no more than 5 characters", { exact: true }))
      .toBeVisible();
    await expect.element(invalid.getByText("Save", { exact: true })).toBeDisabled();
    await expect
      .element(invalid.getByLabelText("Geographic unit abbreviation", { exact: true }))
      .toBeVisible();
    await invalid.getByText("Cancel", { exact: true }).click();
    const persisted = await mission.read();
    expect(persisted.geographicUnits).toEqual(beforeInvalid.geographicUnits);
    const [uuid, unit] = Object.entries(persisted.geographicUnits)[0];
    expect(unit).toMatchObject({ name: "Highland Basin", abbr: "HB" });
    expect(persisted.actions).toEqual(beforeInvalid.actions);
    await mission.open();
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    const item = page.getByLabelText("geoUnitList-item", { exact: true });
    await expect.poll(() => item.length).toBe(1);
    await expect.element(item.getByText("Highland Basin", { exact: true })).toBeVisible();
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
    await page.getByLabelText("addNewTemplateButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(1);
    const templateUuid = Object.keys((await mission.read()).actionTemplates)[0];
    const templateName = (await mission.read()).actionTemplates[templateUuid].templateName!;
    const templateRow = page
      .getByLabelText("templateList-item", { exact: true })
      .filter({ hasText: templateName });
    await ensureTemplateExpanded(templateRow);
    await toggleCheckbox(templateRow, "Highland Basin");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[templateUuid].geographicUnitsUsage)
      .toContain(uuid);

    await mission.open();
    const afterConsumerReload = await mission.read();
    expect(afterConsumerReload.actions[mission.ids.actionA].geographicUnitsUsage).toContain(uuid);
    expect(afterConsumerReload.actionTemplates[templateUuid].geographicUnitsUsage).toContain(uuid);
    await selectPlanningStationActions(page, "Alpha station");
    const sampleActionRow = page.getByRole("listitem").filter({ hasText: "Sample regolith" });
    if (!isVisible(sampleActionRow.getByText("Highland Basin", { exact: true }))) {
      await sampleActionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
    }
    await expect
      .element(sampleActionRow.getByText("Highland Basin", { exact: true }))
      .toBeVisible();
    await page.getByLabelText("mission Section", { exact: true }).click();
    await page.getByLabelText("export_panel", { exact: true }).click();
    await setChecked(page.getBySelector("#export-all-evas"), false);
    await setChecked(page.getBySelector("#export-actions"), true);
    const download = await mission.captureDownload(() =>
      page.getByLabelText("Export JSON File", { exact: true }).click()
    );
    const exported = JSON.parse(await download.text()) as {
      actions: Array<{ uuid: string; geographicalUnitsReadable: string[] | null }>;
    };
    expect(
      exported.actions.find((action) => action.uuid === mission.ids.actionA)
        ?.geographicalUnitsReadable
    ).toEqual(["Highland Basin"]);

    await enablePlanningEditMode(page);
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    vi.spyOn(window, "alert").mockImplementationOnce((message) => {
      expect(String(message)).toContain("Reference POI");
      expect(String(message)).toContain(templateName);
    });
    await item.getByLabelText("deleteButton", { exact: true }).click();
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
    await item.getByLabelText("deleteButton", { exact: true }).click();
    await expect
      .poll(async () => Object.hasOwn((await mission.read()).geographicUnits, uuid))
      .toBe(false);
    await mission.open();
    await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
    await expect
      .poll(() => page.getByLabelText("geoUnitList-item", { exact: true }).length)
      .toBe(0);
  });
});

test("geographic units sort by edited names, keep abbreviations and cancel drafts before independent deletion", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
  for (const [name, abbr] of [
    ["Bravo basin", "BB"],
    ["Alpha ridge", "AR"],
  ]) {
    await page.getByLabelText("addGeoUnitButton", { exact: true }).click();
    const row = page
      .getByLabelText("geoUnitList-item", { exact: true })
      .filter({ hasText: "(Geographic Unit Name)" });
    await editDialogField(page, "Geographic unit name", name, row);
    await editDialogField(
      page,
      "Geographic unit abbreviation",
      abbr,
      page.getByLabelText("geoUnitList-item", { exact: true }).filter({ hasText: name })
    );
  }
  const names = () =>
    page
      .getBySelector('div[aria-label="Geographic unit name"]')
      .elements()
      .map((node) => node.textContent);
  await expect.poll(names).toEqual(["Alpha ridge", "Bravo basin"]);
  const alpha = page
    .getByLabelText("geoUnitList-item", { exact: true })
    .filter({ hasText: "Alpha ridge" });
  await editDialogField(page, "Geographic unit name", "Zulu ridge", alpha);
  await expect.poll(names).toEqual(["Bravo basin", "Zulu ridge"]);
  const bravo = page
    .getByLabelText("geoUnitList-item", { exact: true })
    .filter({ hasText: "Bravo basin" });
  const before = await mission.read();
  await bravo.getBySelector('div[aria-label="Geographic unit name"]').click();
  const dialog = page.getBySelector("dialog[open]");
  await dialog.getByLabelText("Geographic unit name", { exact: true }).fill("Discarded");
  await dialog.getByText("Cancel", { exact: true }).click();
  expect(await mission.read()).toEqual(before);
  await page
    .getByLabelText("geoUnitList-item", { exact: true })
    .filter({ hasText: "Zulu ridge" })
    .getByLabelText("deleteButton", { exact: true })
    .click();
  await expect.poll(names).toEqual(["Bravo basin"]);
  expect(Object.values((await mission.read()).geographicUnits)).toEqual([
    { name: "Bravo basin", abbr: "BB" },
  ]);
  await bravo.getByLabelText("deleteButton", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).geographicUnits)).toEqual([]);
});
