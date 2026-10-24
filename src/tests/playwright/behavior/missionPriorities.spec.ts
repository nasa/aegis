import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, selectPlanningStationActions } from "./planningHelpers";

const stmActionUuid = "50000000-0000-4000-8000-000000000010";

async function editField(
  page: Page,
  label: string,
  value: string,
  scope: Locator = page.locator("body")
) {
  const dialog = page.locator("dialog[open]");
  if (!(await dialog.count())) {
    const target = scope.locator(`div[aria-label="${label}"]`).first();
    if (await target.isVisible()) await target.click();
    else await target.locator("../..").click();
  }
  await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function editCategory(page: Page, from: string, to: string): Promise<void> {
  await page.getByLabel("Category name", { exact: true }).filter({ hasText: from }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByLabel("Category name", { exact: true })).toBeVisible();
  await dialog.getByLabel("Category name", { exact: true }).fill(to);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function openPriorityConfig(page: Page): Promise<void> {
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("missionPriorities_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "Mission Priority Identifiers"
  );
}

async function setPriorityDropdown(
  page: Page,
  fieldText: string,
  uuid: string,
  scope: Locator = page.locator("body")
): Promise<void> {
  await scope
    .getByText(fieldText, { exact: true })
    .locator("../..")
    .getByLabel("dropdown", { exact: true })
    .selectOption(uuid);
}

test("mission priority traces sort, rename through actions/templates, block in-use deletion, and clean up after references are removed", async ({
  page,
  context,
  mission,
}) => {
  const sourceAction = (await mission.read()).actions[mission.ids.actionA];
  await mission.change((draft) => {
    draft.actionSystemVersion = 2;
    draft.actionDefinitions = {
      verbs: { "50000000-0000-4000-8000-000000000001": { name: "Observe", abbr: "observe" } },
      nouns: { "50000000-0000-4000-8000-000000000002": { name: "Core", abbr: "core" } },
      adjectives: {},
    };
    const stmAction = JSON.parse(JSON.stringify(sourceAction)) as Action;
    stmAction.uuid = stmActionUuid;
    stmAction.refUuid = "60000000-0000-4000-8000-000000000010";
    stmAction.name = "";
    stmAction.poiUuid = null;
    stmAction.stmAction = true;
    stmAction.actionDefinition = {
      verbUuid: "50000000-0000-4000-8000-000000000001",
      nounUuid: "50000000-0000-4000-8000-000000000002",
    };
    draft.actions[stmActionUuid] = stmAction;
    draft.stations[mission.ids.stationA].actionOrderUuids.push(stmActionUuid);
  });
  const original = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPriorityConfig(page);

  await page.getByLabel("createCategoryButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(1);
  await editField(page, "Category name", "Science");
  let priorityRows = page.getByLabel("missionPriorities-item", { exact: true });
  await editField(page, "Trace", "SIMD-10", priorityRows.filter({ hasText: "(Trace)" }));
  await page.getByLabel("addTraceButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(2);
  priorityRows = page.getByLabel("missionPriorities-item", { exact: true });
  await editField(page, "Trace", "SIMD-2", priorityRows.filter({ hasText: "(Trace)" }));
  await expect(priorityRows.nth(0)).toContainText("SIMD-2");
  await expect(priorityRows.nth(1)).toContainText("SIMD-10");

  // A second UI-created category proves the dropdown groups sort by category,
  // independently of the numeric trace ordering within Science.
  await page.getByLabel("createCategoryButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(3);
  await editCategory(page, "New Category", "Astronomy");
  const astronomyTrace = page
    .getByLabel("missionPriorities-item", { exact: true })
    .filter({ hasText: "(Trace)" });
  await editField(page, "Trace", "ASTRO-1", astronomyTrace);
  await expect
    .poll(async () => Object.values((await mission.read()).missionPriorities))
    .toContainEqual({ category: "Astronomy", trace: "ASTRO-1" });
  const byTrace = await mission.read();
  const priorityUuid = Object.keys(byTrace.missionPriorities).find(
    (uuid) => byTrace.missionPriorities[uuid].trace === "SIMD-2"
  )!;

  await selectPlanningStationActions(page, "Alpha station");
  const actionRow = page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
  });
  if (!(await actionRow.getByText("Mission Priority Identifier:", { exact: true }).isVisible())) {
    await actionRow.locator('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", priorityUuid, actionRow);
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].missionPriorityUuid)
    .toBe(priorityUuid);
  await expect(actionRow.getByLabel("Mission priority: SIMD-2", { exact: true })).toBeVisible();
  const stmActionRow = page.getByRole("listitem").filter({ hasText: "Observe" });
  if (
    !(await stmActionRow.getByText("Mission Priority Identifier:", { exact: true }).isVisible())
  ) {
    await stmActionRow.locator('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", priorityUuid, stmActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[stmActionUuid].missionPriorityUuid)
    .toBe(priorityUuid);
  await expect(stmActionRow.getByLabel("Mission priority: SIMD-2", { exact: true })).toBeVisible();

  await openPriorityConfig(page);
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).actionTemplates).length).toBe(1);
  const templateUuid = Object.keys((await mission.read()).actionTemplates)[0];
  const templateName = (await mission.read()).actionTemplates[templateUuid].templateName!;
  const templateRow = page
    .getByLabel("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(templateRow);
  await setPriorityDropdown(page, "Mission Priority:", priorityUuid);
  await expect
    .poll(async () => (await mission.read()).actionTemplates[templateUuid].missionPriorityUuid)
    .toBe(priorityUuid);

  const peer = await context.newPage();
  await mission.open(peer);
  await enablePlanningEditMode(peer);
  await selectPlanningStationActions(peer, "Alpha station");
  await expect(
    peer
      .getByRole("listitem")
      .filter({ hasText: "Sample regolith" })
      .getByLabel("Mission priority: SIMD-2", { exact: true })
  ).toBeVisible();
  await expect(
    peer
      .getByRole("listitem")
      .filter({ hasText: "Observe" })
      .getByLabel("Mission priority: SIMD-2", { exact: true })
  ).toBeVisible();

  await openPriorityConfig(page);
  await editCategory(page, "Science", "Instrumentation");
  const assignedTrace = page
    .getByLabel("missionPriorities-item", { exact: true })
    .filter({ hasText: "SIMD-2" });
  await editField(page, "Trace", "SIMD-0002", assignedTrace);
  await expect
    .poll(async () => (await mission.read()).missionPriorities[priorityUuid])
    .toEqual({
      category: "Instrumentation",
      trace: "SIMD-0002",
    });
  const updatedTrace = page
    .getByLabel("missionPriorities-item", { exact: true })
    .filter({ hasText: "SIMD-0002" });
  await selectPlanningStationActions(page, "Alpha station");
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Sample regolith" })
      .getByLabel("Mission priority: SIMD-0002", { exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Observe" })
      .getByLabel("Mission priority: SIMD-0002", { exact: true })
  ).toBeVisible();
  await selectPlanningStationActions(peer, "Alpha station");
  await expect(
    peer
      .getByRole("listitem")
      .filter({ hasText: "Sample regolith" })
      .getByLabel("Mission priority: SIMD-0002", { exact: true })
  ).toBeVisible();
  await expect(
    peer
      .getByRole("listitem")
      .filter({ hasText: "Observe" })
      .getByLabel("Mission priority: SIMD-0002", { exact: true })
  ).toBeVisible();

  await openPriorityConfig(page);
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  const renamedTemplateRow = page
    .getByLabel("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(renamedTemplateRow);
  const templateDropdown = renamedTemplateRow
    .getByText("Mission Priority:", { exact: true })
    .locator("../..")
    .getByLabel("dropdown", { exact: true });
  await expect(templateDropdown).toHaveValue(priorityUuid);
  await expect(templateDropdown.locator("optgroup")).toHaveCount(2);
  await expect(templateDropdown.locator("optgroup").nth(0)).toHaveAttribute("label", "Astronomy");
  await expect(templateDropdown.locator("optgroup").nth(1)).toHaveAttribute(
    "label",
    "Instrumentation"
  );
  await expect(templateDropdown.locator('option[value="' + priorityUuid + '"]')).toHaveText(
    "SIMD-0002"
  );
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPriorityConfig(page);
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  const reloadedTemplateRow = page
    .getByLabel("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(reloadedTemplateRow);
  const reloadedTemplateDropdown = reloadedTemplateRow
    .getByText("Mission Priority:", { exact: true })
    .locator("../..")
    .getByLabel("dropdown", { exact: true });
  await expect(reloadedTemplateDropdown).toHaveValue(priorityUuid);
  await expect(reloadedTemplateDropdown.locator('option[value="' + priorityUuid + '"]')).toHaveText(
    "SIMD-0002"
  );
  await expect(reloadedTemplateDropdown.locator("optgroup").nth(0)).toHaveAttribute(
    "label",
    "Astronomy"
  );
  await expect(reloadedTemplateDropdown.locator("optgroup").nth(1)).toHaveAttribute(
    "label",
    "Instrumentation"
  );

  await openPriorityConfig(page);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("alert");
    expect(dialog.message()).toContain("Reference POI");
    expect(dialog.message()).toContain(templateName);
    await dialog.accept();
  });
  await updatedTrace.getByLabel("deleteButton", { exact: true }).click();
  expect((await mission.read()).missionPriorities[priorityUuid]).toMatchObject({
    category: "Instrumentation",
    trace: "SIMD-0002",
  });

  await selectPlanningStationActions(page, "Alpha station");
  const primaryActionRow = page.getByRole("listitem").filter({ hasText: "Sample regolith" });
  if (
    !(await primaryActionRow.getByText("Mission Priority Identifier:", { exact: true }).isVisible())
  ) {
    await primaryActionRow.locator('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", "", primaryActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].missionPriorityUuid)
    .toBeNull();
  const updatedStmActionRow = page.getByRole("listitem").filter({ hasText: "Observe" });
  if (
    !(await updatedStmActionRow
      .getByText("Mission Priority Identifier:", { exact: true })
      .isVisible())
  ) {
    await updatedStmActionRow.locator('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", "", updatedStmActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[stmActionUuid].missionPriorityUuid)
    .toBeNull();
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("missionPriorities_panel", { exact: true }).click();
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  const prioritySelect = page
    .getByText("Mission Priority:", { exact: true })
    .locator("../..")
    .getByLabel("dropdown", { exact: true });
  await prioritySelect.selectOption("");
  await expect
    .poll(async () => (await mission.read()).actionTemplates[templateUuid].missionPriorityUuid)
    .toBeNull();
  await openPriorityConfig(page);
  await updatedTrace.getByLabel("deleteButton", { exact: true }).click();
  await expect
    .poll(async () => Object.hasOwn((await mission.read()).missionPriorities, priorityUuid))
    .toBe(false);
  const after = await mission.read();
  expect(Object.values(after.missionPriorities)).toEqual(
    expect.arrayContaining([
      { category: "Instrumentation", trace: "SIMD-10" },
      { category: "Astronomy", trace: "ASTRO-1" },
    ])
  );
  expect(after.actions[mission.ids.actionA].missionPriorityUuid).toBeNull();
  expect(after.actionTemplates[templateUuid].missionPriorityUuid).toBeNull();
  expect(after.stations).toEqual(original.stations);
  await mission.open(page);
  await openPriorityConfig(page);
  await expect(page.getByLabel("missionPriorities-item", { exact: true })).toHaveCount(2);
  await expect(page.getByText("SIMD-10", { exact: true })).toBeVisible();
  await expect(page.getByText("ASTRO-1", { exact: true })).toBeVisible();
});

async function ensureTemplateExpanded(row: Locator): Promise<void> {
  if (await row.locator('svg[data-icon="caret-right"]').count()) {
    await row.getByLabel("Expand Button", { exact: true }).click();
  }
}
