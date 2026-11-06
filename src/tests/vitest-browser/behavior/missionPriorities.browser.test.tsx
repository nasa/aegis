import type { Locator, BrowserPage as Page } from "vitest/browser";
import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode, selectPlanningStationActions } from "./planningHelpers";

const stmActionUuid = "50000000-0000-4000-8000-000000000010";

async function editField(
  page: Page,
  label: string,
  value: string,
  scope: Locator = page.getBySelector("body")
) {
  const dialog = page.getBySelector("dialog[open]");
  if (!dialog.length) {
    const target = scope.getBySelector(`div[aria-label="${label}"]`).first();
    if (isVisible(target)) await target.click();
    else await target.getBySelector("../..").click();
  }
  await expect.element(dialog.getByLabelText(label, { exact: true })).toBeVisible();
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

async function editCategory(page: Page, from: string, to: string): Promise<void> {
  await page.getByLabelText("Category name", { exact: true }).filter({ hasText: from }).click();
  const dialog = page.getBySelector("dialog[open]");
  await expect.element(dialog.getByLabelText("Category name", { exact: true })).toBeVisible();
  await dialog.getByLabelText("Category name", { exact: true }).fill(to);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

async function openPriorityConfig(page: Page): Promise<void> {
  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("missionPriorities_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toHaveTextContent(exactText("Mission Priority Identifiers"));
}

async function setPriorityDropdown(
  page: Page,
  fieldText: string,
  uuid: string,
  scope: Locator = page.getBySelector("body")
): Promise<void> {
  await scope
    .getByText(fieldText, { exact: true })
    .getBySelector("../..")
    .getByLabelText("dropdown", { exact: true })
    .selectOptions(uuid);
}

test("mission priority traces sort, rename through actions/templates, block in-use deletion, and clean up after references are removed", async ({
  page,
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
  await mission.open();
  await enablePlanningEditMode(page);
  await openPriorityConfig(page);

  await page.getByLabelText("createCategoryButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(1);
  await editField(page, "Category name", "Science");
  let priorityRows = page.getByLabelText("missionPriorities-item", { exact: true });
  await editField(page, "Trace", "SIMD-10", priorityRows.filter({ hasText: "(Trace)" }));
  await page.getByLabelText("addTraceButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(2);
  priorityRows = page.getByLabelText("missionPriorities-item", { exact: true });
  await editField(page, "Trace", "SIMD-2", priorityRows.filter({ hasText: "(Trace)" }));
  // SIMD short forms pad on the right: 10 denotes 1000, and 2 denotes 2000.
  await expect.element(priorityRows.nth(0)).toHaveTextContent("SIMD-10");
  await expect.element(priorityRows.nth(1)).toHaveTextContent("SIMD-2");

  // A second UI-created category proves the dropdown groups sort by category,
  // independently of the numeric trace ordering within Science.
  await page.getByLabelText("createCategoryButton", { exact: true }).click();
  await expect
    .poll(async () => Object.keys((await mission.read()).missionPriorities).length)
    .toBe(3);
  await editCategory(page, "New Category", "Astronomy");
  const astronomyTrace = page
    .getByLabelText("missionPriorities-item", { exact: true })
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
    has: page.getBySelector('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
  });
  if (!isVisible(actionRow.getByText("Mission Priority Identifier:", { exact: true }))) {
    await actionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", priorityUuid, actionRow);
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].missionPriorityUuid)
    .toBe(priorityUuid);
  await expect
    .element(actionRow.getByLabelText("Mission priority: SIMD-2", { exact: true }))
    .toBeVisible();
  const stmActionRow = page.getByRole("listitem").filter({ hasText: "Observe" });
  if (!isVisible(stmActionRow.getByText("Mission Priority Identifier:", { exact: true }))) {
    await stmActionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", priorityUuid, stmActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[stmActionUuid].missionPriorityUuid)
    .toBe(priorityUuid);
  await expect
    .element(stmActionRow.getByLabelText("Mission priority: SIMD-2", { exact: true }))
    .toBeVisible();

  await openPriorityConfig(page);
  await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
  await page.getByLabelText("addNewTemplateButton", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).actionTemplates).length).toBe(1);
  const templateUuid = Object.keys((await mission.read()).actionTemplates)[0];
  const templateName = (await mission.read()).actionTemplates[templateUuid].templateName!;
  const templateRow = page
    .getByLabelText("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(templateRow);
  await setPriorityDropdown(page, "Mission Priority:", priorityUuid);
  await expect
    .poll(async () => (await mission.read()).actionTemplates[templateUuid].missionPriorityUuid)
    .toBe(priorityUuid);

  await openPriorityConfig(page);
  await editCategory(page, "Science", "Instrumentation");
  const assignedTrace = page
    .getByLabelText("missionPriorities-item", { exact: true })
    .filter({ hasText: "SIMD-2" });
  await editField(page, "Trace", "SIMD-0002", assignedTrace);
  await expect
    .poll(async () => (await mission.read()).missionPriorities[priorityUuid])
    .toEqual({
      category: "Instrumentation",
      trace: "SIMD-0002",
    });
  const updatedTrace = page
    .getByLabelText("missionPriorities-item", { exact: true })
    .filter({ hasText: "SIMD-0002" });
  await selectPlanningStationActions(page, "Alpha station");
  await expect
    .element(
      page
        .getByRole("listitem")
        .filter({ hasText: "Sample regolith" })
        .getByLabelText("Mission priority: SIMD-0002", { exact: true })
    )
    .toBeVisible();
  await expect
    .element(
      page
        .getByRole("listitem")
        .filter({ hasText: "Observe" })
        .getByLabelText("Mission priority: SIMD-0002", { exact: true })
    )
    .toBeVisible();
  await openPriorityConfig(page);
  await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
  const renamedTemplateRow = page
    .getByLabelText("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(renamedTemplateRow);
  const templateDropdown = renamedTemplateRow
    .getByText("Mission Priority:", { exact: true })
    .getBySelector("../..")
    .getByLabelText("dropdown", { exact: true });
  await expect.element(templateDropdown).toHaveValue(priorityUuid);
  await expect.poll(() => templateDropdown.getBySelector("optgroup").length).toBe(2);
  await expect
    .element(templateDropdown.getBySelector("optgroup").nth(0))
    .toHaveAttribute("label", "Astronomy");
  await expect
    .element(templateDropdown.getBySelector("optgroup").nth(1))
    .toHaveAttribute("label", "Instrumentation");
  await expect
    .element(templateDropdown.getBySelector('option[value="' + priorityUuid + '"]'))
    .toHaveTextContent(exactText("SIMD-0002"));
  await mission.open();
  await enablePlanningEditMode(page);
  await openPriorityConfig(page);
  await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
  const reloadedTemplateRow = page
    .getByLabelText("templateList-item", { exact: true })
    .filter({ hasText: templateName });
  await ensureTemplateExpanded(reloadedTemplateRow);
  const reloadedTemplateDropdown = reloadedTemplateRow
    .getByText("Mission Priority:", { exact: true })
    .getBySelector("../..")
    .getByLabelText("dropdown", { exact: true });
  await expect.element(reloadedTemplateDropdown).toHaveValue(priorityUuid);
  await expect
    .element(reloadedTemplateDropdown.getBySelector('option[value="' + priorityUuid + '"]'))
    .toHaveTextContent(exactText("SIMD-0002"));
  await expect
    .element(reloadedTemplateDropdown.getBySelector("optgroup").nth(0))
    .toHaveAttribute("label", "Astronomy");
  await expect
    .element(reloadedTemplateDropdown.getBySelector("optgroup").nth(1))
    .toHaveAttribute("label", "Instrumentation");

  await openPriorityConfig(page);
  vi.spyOn(window, "alert").mockImplementationOnce((message) => {
    expect(String(message)).toContain("Reference POI");
    expect(String(message)).toContain(templateName);
  });
  await updatedTrace.getByLabelText("deleteButton", { exact: true }).click();
  expect((await mission.read()).missionPriorities[priorityUuid]).toMatchObject({
    category: "Instrumentation",
    trace: "SIMD-0002",
  });

  await selectPlanningStationActions(page, "Alpha station");
  const primaryActionRow = page.getByRole("listitem").filter({ hasText: "Sample regolith" });
  if (!isVisible(primaryActionRow.getByText("Mission Priority Identifier:", { exact: true }))) {
    await primaryActionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", "", primaryActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].missionPriorityUuid)
    .toBeNull();
  const updatedStmActionRow = page.getByRole("listitem").filter({ hasText: "Observe" });
  if (!isVisible(updatedStmActionRow.getByText("Mission Priority Identifier:", { exact: true }))) {
    await updatedStmActionRow.getBySelector('div[class*="actionHeadingCaret"]').click();
  }
  await setPriorityDropdown(page, "Mission Priority Identifier:", "", updatedStmActionRow);
  await expect
    .poll(async () => (await mission.read()).actions[stmActionUuid].missionPriorityUuid)
    .toBeNull();
  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("missionPriorities_panel", { exact: true }).click();
  await page.getByLabelText("actionTemplate_panel", { exact: true }).click();
  const prioritySelect = page
    .getByText("Mission Priority:", { exact: true })
    .getBySelector("../..")
    .getByLabelText("dropdown", { exact: true });
  await prioritySelect.selectOptions("");
  await expect
    .poll(async () => (await mission.read()).actionTemplates[templateUuid].missionPriorityUuid)
    .toBeNull();
  await openPriorityConfig(page);
  await updatedTrace.getByLabelText("deleteButton", { exact: true }).click();
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
  await mission.open();
  await openPriorityConfig(page);
  await expect
    .poll(() => page.getByLabelText("missionPriorities-item", { exact: true }).length)
    .toBe(2);
  await expect.element(page.getByText("SIMD-10", { exact: true })).toBeVisible();
  await expect.element(page.getByText("ASTRO-1", { exact: true })).toBeVisible();
});

async function ensureTemplateExpanded(row: Locator): Promise<void> {
  if (row.getBySelector('svg[data-icon="caret-right"]').length) {
    await row.getByLabelText("Expand Button", { exact: true }).click();
  }
}
