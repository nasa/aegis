import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/behavioralTest";

export async function openPlanningSection(
  page: Page,
  section: "station" | "poi" | "evas" | "mission"
): Promise<void> {
  await page.getByLabel(`${section} Section`, { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    {
      station: "Stations",
      poi: "Points of Interest",
      evas: "EVAs",
      mission: "Mission Configuration",
    }[section]
  );
}

export async function enablePlanningEditMode(page: Page): Promise<void> {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  await expect(toggle).toHaveAttribute("data-tooltip-content", /^Turn (On|Off) Edit Mode$/);
  if ((await toggle.getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

export function planningField(page: Page, label: string): Locator {
  return page.locator(`div[aria-label="${label}"]`);
}

export async function openPlanningField(page: Page, label: string): Promise<Locator> {
  // The surrounding label also contains the pencil and stays clickable for empty values.
  await planningField(page, label).locator("..").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  return dialog;
}

export async function savePlanningField(page: Page, label: string, value: string): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(planningField(page, label)).toHaveText(value);
}

export async function cancelPlanningField(page: Page, label: string, value: string): Promise<void> {
  const previous = await planningField(page, label).innerText();
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(planningField(page, label)).toHaveText(previous);
}

export async function selectPlanningStation(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "station");
  await page
    .getByLabel("stationList-item", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(planningField(page, "Station")).toHaveText(name);
}

export async function selectPlanningPoi(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "poi");
  await page
    .getByLabel("poiList-item", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect(planningField(page, "POI")).toHaveText(name);
}

export async function selectPlanningStationActions(page: Page, name: string): Promise<void> {
  await selectPlanningStation(page, name);
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(page.getByText("Station Actions", { exact: true })).toBeVisible();
}

export function planningEvaRow(page: Page, name: string): Locator {
  return page
    .getByLabel("evaList-item", { exact: true })
    .filter({ has: page.getByText(name, { exact: true }) });
}

export async function selectPlanningEva(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "evas");
  // Clicking the selected EVA again deselects it.
  const title = planningField(page, "EVA Title");
  if (!(await title.isVisible()) || (await title.textContent()) !== name) {
    await planningEvaRow(page, name).getByText(name, { exact: true }).click();
  }
  await expect(planningField(page, "EVA Title")).toHaveText(name);
}

export async function choosePlanningEvaAction(
  page: Page,
  name: string,
  action: string
): Promise<void> {
  await planningEvaRow(page, name).locator('svg[data-icon="ellipsis-vertical"]').click();
  await page.locator("dialog[open]").getByText(action, { exact: true }).click();
}

export async function confirmPlanningDelete(page: Page, label: string): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel(label, { exact: true }).click();
}
