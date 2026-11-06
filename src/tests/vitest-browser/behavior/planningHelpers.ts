import { vi } from "vitest";
import { exactText, isVisible } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { expect } from "./missionHarness";

export async function openPlanningSection(
  page: Page,
  section: "station" | "poi" | "evas" | "mission"
): Promise<void> {
  await page.getByLabelText(`${section} Section`, { exact: true }).click();
  if (section === "evas") {
    const showAll = page.getByLabelText("Show All EVAs", { exact: true });
    if (await isVisible(showAll)) await showAll.click();
  }
  const title = {
    station: "Stations",
    poi: "Points of Interest",
    evas: "EVAs",
    mission: "Mission Configuration",
  }[section];
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }).filter({ hasText: title }))
    .toHaveTextContent(exactText(title));
}

export async function enablePlanningEditMode(page: Page): Promise<void> {
  await page.getBySelector("body").unhover();
  await expect.poll(() => isVisible(page.getBySelector("#aegis-tooltip"))).toBe(false);
  const toggle = page.getByLabelText("globalEditToggle", { exact: true });
  await expect
    .poll(() => toggle.element().getAttribute("data-tooltip-content"))
    .toMatch(/^Turn (On|Off) Edit Mode$/);
  if ((await toggle.element().getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await toggle.click();
  }
  await expect.element(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

export function planningField(page: Page, label: string): Locator {
  return page.getBySelector(`div[aria-label="${label}"]:not([role="button"])`);
}

export async function openPlanningField(page: Page, label: string): Promise<Locator> {
  // The surrounding label also contains the pencil and stays clickable for empty values.
  await planningField(page, label).getBySelector("..").click();
  const dialog = page.getBySelector("dialog[open]");
  await expect.element(dialog.getByLabelText(label, { exact: true })).toBeVisible();
  return dialog;
}

export async function savePlanningField(page: Page, label: string, value: string): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
  await expect.element(planningField(page, label)).toHaveTextContent(exactText(value));
}

export async function cancelPlanningField(page: Page, label: string, value: string): Promise<void> {
  const previous = await planningField(page, label).element().textContent;
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Cancel", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
  await expect.element(planningField(page, label)).toHaveTextContent(exactText(previous));
}

export async function selectPlanningStation(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "station");
  const title = planningField(page, "Station");
  if (!(await isVisible(title)) || (await title.element().textContent) !== name) {
    await page
      .getByLabelText("stationList-item", { exact: true })
      .filter({ hasText: name })
      .getByText(name, { exact: true })
      .click();
  }
  await expect.element(planningField(page, "Station")).toHaveTextContent(exactText(name));
}

export async function selectPlanningPoi(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "poi");
  const title = planningField(page, "POI");
  if (!(await isVisible(title)) || (await title.element().textContent) !== name) {
    await page
      .getByLabelText("poiList-item", { exact: true })
      .filter({ hasText: name })
      .getByText(name, { exact: true })
      .click();
  }
  await expect.element(planningField(page, "POI")).toHaveTextContent(exactText(name));
}

export async function selectPlanningStationActions(page: Page, name: string): Promise<void> {
  await selectPlanningStation(page, name);
  await page.getByLabelText("actions_panel", { exact: true }).click();
  await expect.element(page.getByText("Station Actions", { exact: true })).toBeVisible();
}

export function planningEvaRow(page: Page, name: string): Locator {
  return page
    .getByLabelText("evaList-item", { exact: true })
    .filter({ has: page.getByText(name, { exact: true }) });
}

export async function selectPlanningEva(page: Page, name: string): Promise<void> {
  await openPlanningSection(page, "evas");
  // Clicking the selected EVA again deselects it.
  const title = planningField(page, "EVA Title");
  if (!(await isVisible(title)) || (await title.element().textContent) !== name) {
    await planningEvaRow(page, name).getByText(name, { exact: true }).click();
  }
  await expect.element(planningField(page, "EVA Title")).toHaveTextContent(exactText(name));
}

export async function choosePlanningEvaAction(
  page: Page,
  name: string,
  action: string
): Promise<void> {
  await planningEvaRow(page, name).getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText(action, { exact: true }).click();
}

export async function confirmPlanningDelete(page: Page, label: string): Promise<void> {
  vi.spyOn(window, "confirm").mockReturnValueOnce(true);
  await page.getByLabelText(label, { exact: true }).click();
}
