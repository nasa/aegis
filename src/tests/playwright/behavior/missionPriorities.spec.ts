import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, selectPlanningStationActions } from "./planningHelpers";

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

test("priority renames reach assigned actions in a live peer and persist after reload", async ({
  page,
  context,
  mission,
}) => {
  const priorityUuid = "50000000-0000-4000-8000-000000000100";
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.missionPriorities = { [priorityUuid]: { category: "Science", trace: "SCI-1" } };
    doc.actions[mission.ids.actionA].missionPriorityUuid = priorityUuid;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPriorityConfig(page);
  const peer = await context.newPage();
  await mission.open(peer);
  await selectPlanningStationActions(peer, "Alpha station");
  const badge = (name: string) => peer.getByLabel(`Mission priority: ${name}`, { exact: true });
  await expect(badge("SCI-1")).toBeVisible();
  await editCategory(page, "Science", "Instrumentation");
  await editField(
    page,
    "Trace",
    "SCI-0001",
    page.getByLabel("missionPriorities-item", { exact: true })
  );
  await expect(badge("SCI-0001")).toBeVisible();
  await peer.reload();
  await selectPlanningStationActions(peer, "Alpha station");
  await expect(badge("SCI-0001")).toBeVisible();
  expect((await mission.read()).missionPriorities[priorityUuid]).toEqual({
    category: "Instrumentation",
    trace: "SCI-0001",
  });
  expect((await mission.read()).actions[mission.ids.actionA].missionPriorityUuid).toBe(
    priorityUuid
  );
});
