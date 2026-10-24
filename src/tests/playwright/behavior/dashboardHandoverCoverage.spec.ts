import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";

test.use({ scenario: "execution" });

async function selectExecution(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showOnly = page.getByLabel("Show only Executing EVA", { exact: true });
  if (await showOnly.isVisible()) await showOnly.click();
  const row = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: plannedName });
  await expect(row).toHaveCount(1);
  await row.locator("select").selectOption(evaUuid);
}

async function openInfo(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await selectExecution(page, plannedName, evaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  if ((await toggle.getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function visibleDashboardPositions(page: Page): Promise<string[]> {
  return (await readMapFeatures(page, "dashboard"))
    .filter((feature) => feature.labelType === "pos" && feature.visible)
    .map((feature) => feature.id)
    .sort();
}

test("dashboard follows remote execution start, PET pause/resume, stop and REX handover without reload", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.isRunning = false;
    rex.petRunning = false;
  });
  await mission.open(page);
  await openInfo(page, "Survey Bravo", mission.ids.rexEvaB);
  await enableEditing(page);

  const dashboard = await context.newPage();
  await installMapObserver(dashboard);
  await dashboard.goto(mission.dashboardUrl);
  await expect(dashboard.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveCount(0);
  await expect(dashboard.locator(".ol-viewport")).toHaveCount(0);

  await page.getByLabel("Execute EVA", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
    .toBe(true);
  await expect(dashboard.getByText("Active Bravo", { exact: true })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
  await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);
  await expect
    .poll(() => visibleDashboardPositions(dashboard))
    .toEqual([`pos-${mission.ids.posB}`]);

  await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petRunning)
    .toBe(true);
  await expect(page.getByRole("button", { name: "Pause PET timer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
  await expect
    .poll(async () => {
      const rex = (await mission.read()).rexes[mission.ids.rexB];
      return rex.petRunning ? null : rex.petValueAtStartStop;
    })
    .not.toBeNull();
  const firstPausedPet = (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop;
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText(firstPausedPet);
  await expect(page.getByRole("button", { name: "Start PET timer", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petRunning)
    .toBe(true);
  await expect(page.getByRole("button", { name: "Pause PET timer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause PET timer", exact: true }).click();
  await expect
    .poll(async () => {
      const rex = (await mission.read()).rexes[mission.ids.rexB];
      return rex.petRunning ? null : rex.petValueAtStartStop;
    })
    .not.toBeNull();
  const finalPausedPet = (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop;
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText(finalPausedPet);

  await page.getByLabel("Stop Execution", { exact: true }).click();
  await expect
    .poll(async () => {
      const rex = (await mission.read()).rexes[mission.ids.rexB];
      return { running: rex.isRunning, petRunning: rex.petRunning, pet: rex.petValueAtStartStop };
    })
    .toEqual({ running: false, petRunning: false, pet: finalPausedPet });
  await expect(dashboard.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveCount(0);
  await expect(dashboard.locator(".ol-viewport")).toHaveCount(0);

  await openInfo(page, "Survey Alpha", mission.ids.rexEvaA);
  await enableEditing(page);
  await page.getByLabel("Execute EVA", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
    .toBe(true);
  await expect(dashboard.getByText("Stopped Alpha", { exact: true })).toBeVisible();
  await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+02:10:05");
  await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);
  await expect
    .poll(() => visibleDashboardPositions(dashboard))
    .toEqual([`pos-${mission.ids.posA}`]);
  const final = await mission.read();
  expect(final.rexes[mission.ids.rexA].isRunning).toBe(true);
  expect(final.rexes[mission.ids.rexB].isRunning).toBe(false);
  await dashboard.close();
});
