import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const referenceIds = {
  verb: "70000000-0000-4000-8000-000000000001",
  noun: "70000000-0000-4000-8000-000000000002",
  adjective: "70000000-0000-4000-8000-000000000003",
  equipment: "70000000-0000-4000-8000-000000000004",
  geography: "70000000-0000-4000-8000-000000000005",
  priority: "70000000-0000-4000-8000-000000000006",
  otherPriority: "70000000-0000-4000-8000-000000000007",
  circle: "70000000-0000-4000-8000-000000000008",
};

async function openMissionConfig(page: Page, tab: string, title: string): Promise<void> {
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel(tab, { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(title);
}

async function rejectDraft(
  page: Page,
  row: Locator,
  label: string,
  value: string,
  error: string
): Promise<void> {
  const nestedTarget = row.locator(`div[aria-label="${label}"]`).first();
  const target = (await nestedTarget.count()) > 0 ? nestedTarget : row;
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" })
  );
  await target.click();
  const dialog = page.locator("dialog[open]");
  const field = dialog.getByLabel(label, { exact: true });
  await expect(field).toBeVisible();
  await field.fill(value);
  await expect(dialog.getByText(error, { exact: true })).toBeVisible();
  await expect(dialog.getByText("Save", { exact: true })).toHaveClass(/saveButtonDisabled/);
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function cancelValidBoundary(
  page: Page,
  row: Locator,
  label: string,
  value: string
): Promise<void> {
  const target = row.locator(`div[aria-label="${label}"]`).first();
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" })
  );
  await target.click();
  const dialog = page.locator("dialog[open]");
  const field = dialog.getByLabel(label, { exact: true });
  await expect(field).toBeVisible();
  await field.fill(value);
  await expect(
    dialog.getByText("Should be greater than or equal to 1", { exact: true })
  ).toHaveCount(0);
  await expect(dialog.getByText("Must be an integer", { exact: true })).toHaveCount(0);
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function saveValidDraft(
  page: Page,
  row: Locator,
  label: string,
  value: string
): Promise<void> {
  const nestedTarget = row.locator(`div[aria-label="${label}"]`).first();
  const target = (await nestedTarget.count()) > 0 ? nestedTarget : row;
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" })
  );
  await target.click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await expect(dialog.getByText("Save", { exact: true })).not.toHaveClass(/saveButtonDisabled/);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("reference lists reject invalid required, duplicate, abbreviation and numeric drafts without changing consumers", async ({
  page,
  mission,
}) => {
  await mission.change((draft) => {
    draft.actionSystemVersion = 2;
    draft.actionDefinitions = {
      verbs: {
        [referenceIds.verb]: { name: "Collect", abbr: "collect" },
      },
      nouns: {
        [referenceIds.noun]: { name: "Core", abbr: "core" },
      },
      adjectives: {
        [referenceIds.adjective]: { name: "Pristine", abbr: "pristine" },
      },
    };
    draft.equipmentItems = {
      [referenceIds.equipment]: { name: "Sample canister", quantity: 12, singleUse: true },
    };
    draft.missionPriorities = {
      [referenceIds.priority]: { category: "Science", trace: "SIMD-1" },
      [referenceIds.otherPriority]: { category: "Operations", trace: "OPS-1" },
    };
    draft.circleDefinitions = {
      [referenceIds.circle]: { name: "Reference circle", radius: 50 },
    };
    const action = draft.actions[mission.ids.actionA];
    action.stmAction = true;
    action.actionDefinition = {
      verbUuid: referenceIds.verb,
      nounUuid: referenceIds.noun,
      adjectiveUuid: referenceIds.adjective,
    };
    action.equipmentItemsUsage = { [referenceIds.equipment]: { quantityUsed: 1 } };
    action.missionPriorityUuid = referenceIds.priority;
  });

  await mission.open(page);
  await enablePlanningEditMode(page);

  await openMissionConfig(page, "equipment_panel", "Mission Equipment");
  await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).equipmentItems).length).toBe(2);
  const duplicateEquipmentRow = page
    .getByLabel("equipmentList-item", { exact: true })
    .filter({ hasText: "(Equipment Name)" });
  await saveValidDraft(page, duplicateEquipmentRow, "Equipment item name", "Sample canister");
  const duplicateNamedEquipment = page
    .getByLabel("equipmentList-item", { exact: true })
    .filter({ hasText: "Sample canister" })
    .last();
  await saveValidDraft(page, duplicateNamedEquipment, "Equipment item quantity", "2");

  await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).actionTemplates).length).toBe(1);
  const templateRow = page.getByLabel("templateList-item", { exact: true }).first();
  const baseline = await mission.read();
  const originalDefinitions = baseline.actionDefinitions;
  const originalReferences = {
    equipmentItems: baseline.equipmentItems,
    geographicUnits: baseline.geographicUnits,
    missionPriorities: baseline.missionPriorities,
    circleDefinitions: baseline.circleDefinitions,
    actionTemplates: baseline.actionTemplates,
  };
  const originalConsumers = {
    actions: baseline.actions,
    stations: baseline.stations,
    presets: baseline.presets,
  };
  expect(Object.values(originalDefinitions.verbs)).toContainEqual({
    name: "Collect",
    abbr: "collect",
  });
  const duplicateEquipmentUuids = Object.entries(baseline.equipmentItems).filter(
    ([, equipment]) => equipment.name === "Sample canister"
  );
  expect(duplicateEquipmentUuids).toHaveLength(2);
  expect(new Set(duplicateEquipmentUuids.map(([uuid]) => uuid)).size).toBe(2);
  expect(baseline.actions[mission.ids.actionA].equipmentItemsUsage).toEqual({
    [referenceIds.equipment]: { quantityUsed: 1 },
  });

  await openMissionConfig(page, "actionDefinitions_panel", "STM Action Definitions");
  const definitionTypes = [
    { label: "Verbs", name: "Collect", abbr: "collect" },
    { label: "Nouns", name: "Core", abbr: "core" },
    { label: "Adjectives", name: "Pristine", abbr: "pristine" },
  ];
  for (const definition of definitionTypes) {
    const row = page
      .getByLabel("actionDefs-item", { exact: true })
      .filter({ hasText: definition.name });
    await rejectDraft(page, row, `${definition.label} name`, "", "Required");
    await rejectDraft(page, row, `${definition.label} abbreviation`, "", "Required");
    await rejectDraft(
      page,
      row,
      `${definition.label} abbreviation`,
      "abcdefghijk",
      "Must be at no more than 10 characters"
    );
  }
  for (const label of [
    "Verb singular label",
    "Verb plural label",
    "Noun singular label",
    "Noun plural label",
    "Adjective singular label",
    "Adjective plural label",
    "Verb-to-noun conjunction",
    "Noun-to-adjective conjunction",
  ]) {
    await rejectDraft(page, page.locator("body"), label, "", "Required");
  }

  await openMissionConfig(page, "equipment_panel", "Mission Equipment");
  let row = page
    .getByLabel("equipmentList-item", { exact: true })
    .filter({ hasText: "Sample canister" });
  await rejectDraft(page, row, "Equipment item name", "", "Required");
  await rejectDraft(page, row, "Equipment item quantity", "", "Required");
  await rejectDraft(
    page,
    row,
    "Equipment item quantity",
    "0",
    "Should be greater than or equal to 1"
  );
  await rejectDraft(
    page,
    row,
    "Equipment item quantity",
    "1000",
    "Must be at no more than 3 characters"
  );
  await cancelValidBoundary(page, row, "Equipment item quantity", "1");
  await cancelValidBoundary(page, row, "Equipment item quantity", "999");

  // Geographic units are a v1 panel; switch this fixture version for the real UI path.
  await openMissionConfig(page, "circle_panel", "Proximity Circle Definitions");
  row = page
    .getByLabel("circle-definition-item", { exact: true })
    .filter({ hasText: "Reference circle" });
  await rejectDraft(page, row, "Circle Definition Name", "", "Required");
  await rejectDraft(page, row, "Circle Definition Range", "", "Required");
  await rejectDraft(
    page,
    row,
    "Circle Definition Range",
    "0",
    "Should be greater than or equal to 1"
  );
  await rejectDraft(
    page,
    row,
    "Circle Definition Range",
    "10000000",
    "Must be at no more than 7 characters"
  );
  await cancelValidBoundary(page, row, "Circle Definition Range", "1");
  await cancelValidBoundary(page, row, "Circle Definition Range", "9999999");

  await openMissionConfig(page, "missionPriorities_panel", "Mission Priority Identifiers");
  const scienceCategory = page
    .getByLabel("Category name", { exact: true })
    .filter({ hasText: "Science" });
  await rejectDraft(page, scienceCategory, "Category name", "", "Required");
  const operationsCategory = page
    .getByLabel("Category name", { exact: true })
    .filter({ hasText: "Operations" });
  await rejectDraft(page, operationsCategory, "Category name", "Science", "Name must be unique");
  row = page.getByLabel("missionPriorities-item", { exact: true }).filter({ hasText: "SIMD-1" });
  await rejectDraft(page, row, "Trace", "", "Required");

  await openMissionConfig(page, "actionTemplate_panel", "Action Templates");
  const templateName = templateRow.locator('div[aria-label="Template Name"]').first();
  await templateName.click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Template Name", { exact: true }).fill("");
  await expect(dialog.getByText("Required", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Save", { exact: true })).toHaveClass(/saveButtonDisabled/);
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The invalid attempts above used real fields and Cancel. Re-read the authoritative document
  // after every draft has closed; saved references and their action/map consumers must match.
  const after = await mission.read();
  expect(after.actionDefinitions).toEqual(originalDefinitions);
  expect(after.equipmentItems).toEqual(originalReferences.equipmentItems);
  expect(after.missionPriorities).toEqual(originalReferences.missionPriorities);
  expect(after.circleDefinitions).toEqual(originalReferences.circleDefinitions);
  expect(after.actionTemplates).toEqual(originalReferences.actionTemplates);
  expect(after.actions).toEqual(originalConsumers.actions);
  expect(after.stations).toEqual(originalConsumers.stations);
  expect(after.presets).toEqual(originalConsumers.presets);
  expect(after.actions[mission.ids.actionA]).toMatchObject({
    equipmentItemsUsage: { [referenceIds.equipment]: { quantityUsed: 1 } },
    missionPriorityUuid: referenceIds.priority,
  });
});

test("geographic unit required and abbreviation boundaries preserve saved consumers", async ({
  page,
  mission,
}) => {
  await mission.change((draft) => {
    draft.actionSystemVersion = 1;
    draft.geographicUnits = {
      [referenceIds.geography]: { name: "Highland Basin", abbr: "HB" },
    };
    draft.actions[mission.ids.actionA].geographicUnitsUsage = [referenceIds.geography];
  });
  const baseline = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openMissionConfig(page, "geographicUnit_panel", "Mission Geography");
  const row = page
    .getByLabel("geoUnitList-item", { exact: true })
    .filter({ hasText: "Highland Basin" });
  await rejectDraft(page, row, "Geographic unit name", "", "Required");
  await rejectDraft(page, row, "Geographic unit abbreviation", "", "Required");
  await rejectDraft(
    page,
    row,
    "Geographic unit abbreviation",
    "TOOLONG",
    "Must be at no more than 5 characters"
  );

  const after = await mission.read();
  expect(after.geographicUnits).toEqual(baseline.geographicUnits);
  expect(after.actions[mission.ids.actionA]).toEqual(baseline.actions[mission.ids.actionA]);
  expect(after.actions[mission.ids.actionA].geographicUnitsUsage).toEqual([referenceIds.geography]);
});

test("mission reference navigation falls back when an action version removes the selected tab", async ({
  page,
  mission,
}) => {
  await mission.change((draft) => {
    draft.actionSystemVersion = 2;
  });
  await mission.open(page);
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("actionDefinitions_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "STM Action Definitions"
  );

  await mission.change((draft) => {
    draft.actionSystemVersion = 1;
  });
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "Mission Preferences"
  );
  await expect(page.getByLabel("prefs_panel", { exact: true })).toHaveClass(
    /rightIconContainerSelectedTab/
  );
});
