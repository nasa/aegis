import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  savePlanningField,
  selectPlanningEva,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

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
  test("v2 definition entries and wording edit, reject invalid drafts, and persist together", async ({
    page,
    mission,
  }) => {
    await mission.change((draft) => {
      draft.actionSystemVersion = 2;
      draft.actionDefinitions = {
        verbs: { "40000000-0000-4000-8000-000000000001": { name: "Sample", abbr: "sample" } },
        nouns: { "40000000-0000-4000-8000-000000000002": { name: "Core", abbr: "core" } },
        adjectives: {
          "40000000-0000-4000-8000-000000000003": { name: "Pristine", abbr: "pristine" },
        },
      };
      draft.actions[mission.ids.actionA].stmAction = true;
      draft.actions[mission.ids.actionA].actionDefinition = {
        verbUuid: "40000000-0000-4000-8000-000000000001",
        nounUuid: "40000000-0000-4000-8000-000000000002",
        adjectiveUuid: "40000000-0000-4000-8000-000000000003",
      };
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openMissionConfig(page, "actionDefinitions_panel", "STM Action Definitions");

    await page.getByLabel("addGeoUnitButton", { exact: true }).first().click();
    const newVerbRow = page.getByLabel("actionDefs-item", { exact: true }).filter({
      has: page.getByLabel("Verbs name", { exact: true }).filter({ hasText: "(Verb Name)" }),
    });
    await expect(newVerbRow).toHaveCount(1);
    await editDialogField(page, "Verbs name", "Unused survey action", newVerbRow);
    const unusedRow = page
      .getByLabel("actionDefs-item", { exact: true })
      .filter({ hasText: "Unused survey action" });
    await editDialogField(page, "Verbs abbreviation", "unused", unusedRow);
    const initialVerb = page
      .getByLabel("actionDefs-item", { exact: true })
      .filter({ hasText: "Sample" });
    await editDialogField(page, "Verbs name", "Collect", initialVerb);
    const collectRow = page
      .getByLabel("actionDefs-item", { exact: true })
      .filter({ hasText: "Collect" });
    await editDialogField(page, "Verbs abbreviation", "collect", collectRow);
    await editDialogField(page, "Verb singular label", "Operation");
    await editDialogField(page, "Verb plural label", "Operations");
    await editDialogField(page, "Noun singular label", "Target");
    await editDialogField(page, "Noun plural label", "Targets");
    await editDialogField(page, "Adjective singular label", "Qualifier");
    await editDialogField(page, "Adjective plural label", "Qualifiers");
    await editDialogField(page, "Verb-to-noun conjunction", "from");
    await editDialogField(page, "Noun-to-adjective conjunction", "under");

    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    for (const word of ["Collect", "from", "Core", "under", "Pristine"]) {
      await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
    }
    await openMissionConfig(page, "actionDefinitions_panel", "STM Action Definitions");
    await unusedRow.getByLabel("deleteButton", { exact: true }).click();
    const unusedNames = [
      {
        index: 1,
        placeholder: "(Target Name)",
        nameLabel: "Nouns name",
        abbrLabel: "Nouns abbreviation",
        name: "Unused crater",
        abbr: "ucrater",
      },
      {
        index: 2,
        placeholder: "(Qualifier Name)",
        nameLabel: "Adjectives name",
        abbrLabel: "Adjectives abbreviation",
        name: "Unused icy",
        abbr: "uicy",
      },
    ];
    for (const unused of unusedNames) {
      await page.getByLabel("addGeoUnitButton", { exact: true }).nth(unused.index).click();
      const createdRow = page
        .getByLabel("actionDefs-item", { exact: true })
        .filter({ hasText: unused.placeholder });
      await editDialogField(page, unused.nameLabel, unused.name, createdRow);
      const namedRow = page
        .getByLabel("actionDefs-item", { exact: true })
        .filter({ hasText: unused.name });
      await editDialogField(page, unused.abbrLabel, unused.abbr, namedRow);
      await namedRow.getByLabel("deleteButton", { exact: true }).click();
      await expect
        .poll(async () =>
          Object.values(
            (await mission.read()).actionDefinitions[unused.index === 1 ? "nouns" : "adjectives"]
          ).some((item) => item.name === unused.name)
        )
        .toBe(false);
    }

    await expect(page.getByText("Actions read as:", { exact: true })).toBeVisible();
    await expect(page.getByText("Operation", { exact: true })).toBeVisible();
    await expect(page.getByText("Plural labels (menus & lists):", { exact: true })).toBeVisible();
    const badDraft = page.locator("dialog[open]");
    await collectRow.locator('div[aria-label="Verbs name"]').first().click();
    await expect(badDraft.getByLabel("Verbs name", { exact: true })).toBeVisible();
    await badDraft.getByLabel("Verbs name", { exact: true }).fill("");
    await expect(badDraft.getByText("Required", { exact: true })).toBeVisible();
    await badDraft.getByText("Save", { exact: true }).click();
    await expect(badDraft.getByLabel("Verbs name", { exact: true })).toBeVisible();
    await badDraft.getByText("Cancel", { exact: true }).click();

    const persisted = await mission.read();
    expect(persisted.actionSystemVersion).toBe(2);
    expect(Object.values(persisted.actionDefinitions.verbs)).toContainEqual({
      name: "Collect",
      abbr: "collect",
    });
    expect(Object.values(persisted.actionDefinitions.verbs)).not.toContainEqual({
      name: "Unused survey action",
      abbr: "unused",
    });
    expect(Object.values(persisted.actionDefinitions.nouns)).not.toContainEqual({
      name: "Unused crater",
      abbr: "ucrater",
    });
    expect(Object.values(persisted.actionDefinitions.adjectives)).not.toContainEqual({
      name: "Unused icy",
      abbr: "uicy",
    });
    expect(persisted.actionDefinitionLabels).toEqual({
      verb: { singular: "Operation", plural: "Operations" },
      noun: { singular: "Target", plural: "Targets" },
      adjective: { singular: "Qualifier", plural: "Qualifiers" },
    });
    expect(persisted.actionDefinitionConjunctions).toEqual({
      verbToNoun: "from",
      nounToAdjective: "under",
    });
    expect(persisted.actions).toEqual(before.actions);
    await mission.open(page);
    await openMissionConfig(page, "actionDefinitions_panel", "STM Action Definitions");
    await expect(
      page.getByLabel("actionDefs-item", { exact: true }).filter({ hasText: "Collect" })
    ).toHaveCount(1);
    await expect(page.getByText("Actions read as:", { exact: true })).toBeVisible();
    await expect(page.getByText("Operation", { exact: true })).toBeVisible();
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    for (const word of ["Collect", "from", "Core", "under", "Pristine"]) {
      await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
    }
    await expect
      .poll(mission.read)
      .toMatchObject({ actionDefinitionLabels: persisted.actionDefinitionLabels });
  });

  test("equipment inventory supports both item types, validates quantity, and survives reload", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openMissionConfig(page, "equipment_panel", "Mission Equipment");
    const original = await mission.read();
    await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).equipmentItems).length)
      .toBe(1);
    const firstUuid = Object.keys((await mission.read()).equipmentItems)[0];
    await editDialogField(page, "Equipment item name", "Sample canister");
    await editDialogField(page, "Equipment item quantity", "12");
    const sampleRow = page.getByLabel("equipmentList-item", { exact: true }).filter({
      has: page
        .getByLabel("Equipment item name", { exact: true })
        .filter({ hasText: "Sample canister" }),
    });
    await sampleRow.getByRole("checkbox").check();
    await expect
      .poll(async () => (await mission.read()).equipmentItems[firstUuid])
      .toMatchObject({ name: "Sample canister", quantity: 12, singleUse: true });
    const quantityDialog = page.locator("dialog[open]");
    await sampleRow.locator('div[aria-label="Equipment item quantity"]').first().click();
    await expect(
      quantityDialog.getByLabel("Equipment item quantity", { exact: true })
    ).toBeVisible();
    await quantityDialog.getByLabel("Equipment item quantity", { exact: true }).fill("0");
    await expect(
      quantityDialog.getByText("Should be greater than or equal to 1", { exact: true })
    ).toBeVisible();
    await quantityDialog.getByText("Save", { exact: true }).click();
    await expect(
      quantityDialog.getByLabel("Equipment item quantity", { exact: true })
    ).toBeVisible();
    await quantityDialog.getByText("Cancel", { exact: true }).click();
    await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).equipmentItems).length)
      .toBe(2);
    const secondUuid = Object.keys((await mission.read()).equipmentItems).find(
      (uuid) => uuid !== firstUuid
    )!;
    const reusableRow = page
      .getByLabel("equipmentList-item", { exact: true })
      .filter({ hasText: "(Equipment Name)" });
    await editDialogField(page, "Equipment item name", "Reusable drill", reusableRow);
    await editDialogField(
      page,
      "Equipment item quantity",
      "1",
      page.getByLabel("equipmentList-item", { exact: true }).filter({ hasText: "Reusable drill" })
    );
    const persisted = await mission.read();
    expect(persisted.equipmentItems).toMatchObject({
      [firstUuid]: { name: "Sample canister", quantity: 12, singleUse: true },
      [secondUuid]: { name: "Reusable drill", quantity: 1, singleUse: false },
    });
    expect(persisted.actions).toEqual(original.actions);
    await mission.open(page);
    await openMissionConfig(page, "equipment_panel", "Mission Equipment");
    await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(2);
    await expect(
      page.getByLabel("Equipment item name", { exact: true }).filter({ hasText: "Sample canister" })
    ).toBeVisible();

    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await toggleActionAssociation(page, "Sample canister");
    await toggleActionAssociation(page, "Reusable drill");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].equipmentItemsUsage)
      .toEqual({
        [firstUuid]: { quantityUsed: 1 },
        [secondUuid]: { quantityUsed: 1 },
      });

    await selectPlanningStationActions(page, "Bravo station");
    await page.getByText("Add Action", { exact: true }).click();
    await savePlanningField(page, "Action Name", "Second station sample");
    await toggleActionAssociation(page, "Sample canister", "Second station sample");
    await expect
      .poll(
        async () =>
          Object.values((await mission.read()).actions).find(
            (action) => action.name === "Second station sample"
          )?.equipmentItemsUsage
      )
      .toEqual({ [firstUuid]: { quantityUsed: 1 } });
    const secondActionUuid = Object.values((await mission.read()).actions).find(
      (action) => action.name === "Second station sample"
    )!.uuid;

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].equipmentItemsUsage)
      .toEqual({
        [firstUuid]: { quantityUsed: 1 },
        [secondUuid]: { quantityUsed: 1 },
      });
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    const stationConsumables = page
      .getByText("Consumable Equipment Totals", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"panelSection")]')
      .first();
    await expect(
      stationConsumables
        .getByText("Sample canister", { exact: true })
        .locator("../..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await selectPlanningStation(page, "Bravo station");
    await page.getByLabel("info_panel", { exact: true }).click();
    const secondStationConsumables = page
      .getByText("Consumable Equipment Totals", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"panelSection")]')
      .first();
    await expect(
      secondStationConsumables.getByText("Sample canister", { exact: true })
    ).toBeVisible();
    await expect(secondStationConsumables.getByText("Reusable drill", { exact: true })).toHaveCount(
      0
    );
    await expect(
      secondStationConsumables
        .getByText("Sample canister", { exact: true })
        .locator("../..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await selectPlanningEva(page, "Survey Alpha");
    await page.getByLabel("info_panel", { exact: true }).click();
    const evaConsumables = page
      .getByText("Consumable Equipment Totals", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"panelSection")]')
      .first();
    await expect(evaConsumables.getByText("Sample canister", { exact: true })).toBeVisible();
    await expect(evaConsumables.getByText("Reusable drill", { exact: true })).toHaveCount(0);
    await expect(
      evaConsumables
        .getByText("Sample canister", { exact: true })
        .locator("../..")
        .getByText("2", { exact: true })
    ).toBeVisible();

    await selectPlanningStationActions(page, "Alpha station");
    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    await page.getByLabel("addNewTemplateButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(1);
    const templateUuid = Object.keys((await mission.read()).actionTemplates)[0];
    const template = (await mission.read()).actionTemplates[templateUuid];
    const templateRow = page
      .getByLabel("templateList-item", { exact: true })
      .filter({ hasText: template.templateName! });
    await ensureTemplateExpanded(templateRow);
    await toggleCheckbox(templateRow, "Sample canister");
    await toggleCheckbox(templateRow, "Reusable drill");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[templateUuid].equipmentItemsUsage)
      .toEqual({
        [firstUuid]: { quantityUsed: 1 },
        [secondUuid]: { quantityUsed: 1 },
      });

    await openMissionConfig(page, "equipment_panel", "Mission Equipment");
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("alert");
      expect(dialog.message()).toContain("Reference POI");
      expect(dialog.message()).toContain(template.templateName!);
      await dialog.accept();
    });
    await page
      .getByLabel("equipmentList-item", { exact: true })
      .filter({ hasText: "Sample canister" })
      .getByLabel("deleteButton", { exact: true })
      .click();
    expect((await mission.read()).equipmentItems[firstUuid]).toMatchObject({
      name: "Sample canister",
    });
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(template.templateName!);
      await dialog.accept();
    });
    await page
      .getByLabel("equipmentList-item", { exact: true })
      .filter({ hasText: "Reusable drill" })
      .getByLabel("deleteButton", { exact: true })
      .click();
    expect((await mission.read()).equipmentItems[secondUuid]).toMatchObject({
      name: "Reusable drill",
    });

    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    await toggleCheckbox(templateRow, "Sample canister");
    await toggleCheckbox(templateRow, "Reusable drill");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[templateUuid].equipmentItemsUsage)
      .toEqual({});
    await selectPlanningStationActions(page, "Alpha station");
    await toggleActionAssociation(page, "Sample canister");
    await toggleActionAssociation(page, "Reusable drill");
    await expect
      .poll(
        async () =>
          (await mission.read()).actions[mission.ids.actionA].equipmentItemsUsage?.[firstUuid]
      )
      .toBeUndefined();
    await expect
      .poll(
        async () =>
          (await mission.read()).actions[mission.ids.actionA].equipmentItemsUsage?.[secondUuid]
      )
      .toBeUndefined();
    await selectPlanningStationActions(page, "Bravo station");
    await toggleActionAssociation(page, "Sample canister", "Second station sample");
    await expect
      .poll(async () => (await mission.read()).actions[secondActionUuid].equipmentItemsUsage)
      .toEqual({});
    await openMissionConfig(page, "equipment_panel", "Mission Equipment");
    await page
      .getByLabel("equipmentList-item", { exact: true })
      .filter({ hasText: "Sample canister" })
      .getByLabel("deleteButton", { exact: true })
      .click();
    await page
      .getByLabel("equipmentList-item", { exact: true })
      .filter({ hasText: "Reusable drill" })
      .getByLabel("deleteButton", { exact: true })
      .click();
    await expect.poll(async () => Object.keys((await mission.read()).equipmentItems)).toEqual([]);
    await mission.open(page);
    await openMissionConfig(page, "equipment_panel", "Mission Equipment");
    await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(0);
  });

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
    await invalid.getByText("Save", { exact: true }).click();
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

  test("action templates duplicate with independent identity and values, and deletion cancellation preserves siblings", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    const original = await mission.read();

    await page.getByLabel("addNewTemplateButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(1);
    let templates = await mission.read();
    const sourceUuid = Object.keys(templates.actionTemplates)[0];
    const sourceRow = page.getByLabel("templateList-item", { exact: true }).filter({
      has: page.getByText(templates.actionTemplates[sourceUuid].templateName!, { exact: true }),
    });
    if (!(await sourceRow.locator('div[aria-label="Template Description"]').isVisible())) {
      await sourceRow.getByLabel("Expand Button", { exact: true }).click();
    }
    await editDialogField(page, "Template Description", "Source instructions", sourceRow);
    await page.getByLabel("addNewTemplateButton", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(2);
    templates = await mission.read();
    const unrelatedUuid = Object.keys(templates.actionTemplates).find(
      (uuid) => uuid !== sourceUuid
    )!;
    const unrelatedRow = page
      .getByLabel("templateList-item", { exact: true })
      .filter({ hasText: templates.actionTemplates[unrelatedUuid].templateName! });
    if (!(await unrelatedRow.locator('div[aria-label="Template Description"]').isVisible())) {
      await unrelatedRow.getByLabel("Expand Button", { exact: true }).click();
    }
    await editDialogField(page, "Template Description", "Unrelated notes", unrelatedRow);
    await sourceRow.getByLabel("Template Menu", { exact: true }).click();
    await page.locator("dialog[open]").getByLabel("Duplicate", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
      .toBe(3);
    templates = await mission.read();
    const duplicateUuid = Object.keys(templates.actionTemplates).find(
      (uuid) => uuid !== sourceUuid && uuid !== unrelatedUuid
    )!;
    expect(duplicateUuid).toBeTruthy();
    expect(templates.actionTemplates[duplicateUuid].description).toBe("Source instructions");
    const source = templates.actionTemplates[sourceUuid];
    const duplicate = templates.actionTemplates[duplicateUuid];
    expect(duplicate.templateName).not.toBe(source.templateName);

    const duplicateRow = page
      .getByLabel("templateList-item", { exact: true })
      .filter({ hasText: duplicate.templateName! });
    if (!(await duplicateRow.locator('div[aria-label="Template Description"]').isVisible())) {
      await duplicateRow.getByLabel("Expand Button", { exact: true }).click();
    }
    await editDialogField(page, "Template Description", "Independent instructions", duplicateRow);
    await expect
      .poll(async () => (await mission.read()).actionTemplates[duplicateUuid].description)
      .toBe("Independent instructions");
    await expect
      .poll(async () => (await mission.read()).actionTemplates[sourceUuid].description)
      .toBe("Source instructions");

    const stateBeforeCancel = await mission.read();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Are you sure you want to delete this Action Template?");
      await dialog.dismiss();
    });
    await duplicateRow.getByLabel("Template Menu", { exact: true }).click();
    await page.locator("dialog[open]").getByLabel("Delete", { exact: true }).click();
    await expect
      .poll(mission.read)
      .toMatchObject({ actionTemplates: stateBeforeCancel.actionTemplates });
    page.once("dialog", async (dialog) => dialog.accept());
    await duplicateRow.getByLabel("Template Menu", { exact: true }).click();
    await page.locator("dialog[open]").getByLabel("Delete", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).actionTemplates).sort())
      .toEqual([sourceUuid, unrelatedUuid].sort());
    await expect.poll(async () => (await mission.read()).actions).toEqual(original.actions);
    await mission.open(page);
    await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
    await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(2);
    await expect(page.getByText(source.templateName!, { exact: true })).toBeVisible();
    await expect(
      page.getByText(templates.actionTemplates[unrelatedUuid].templateName!, { exact: true })
    ).toBeVisible();
    expect((await mission.read()).actionTemplates[sourceUuid].description).toBe(
      "Source instructions"
    );
    expect((await mission.read()).actionTemplates[unrelatedUuid].description).toBe(
      "Unrelated notes"
    );
  });
});
