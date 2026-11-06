import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";

const CLOCK_ORIGIN = "2026-10-24T12:00:00.000Z";

test.use({ scenario: "execution" });

async function selectExecution(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string
): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const eva = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: asPlannedName });
  await expect(eva).toHaveCount(1);
  await eva.locator("select").selectOption(executionEvaUuid);
}

async function openExecutionInformation(
  page: Page,
  asPlannedName: string,
  executionEvaUuid: string,
  executionName: string
): Promise<void> {
  await selectExecution(page, asPlannedName, executionEvaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
  await expect(page.locator('div[aria-label="REX Title"]')).toHaveText(executionName);
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn On Edit Mode");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function expectPet(page: Page, pet: string): Promise<void> {
  await expect(page.getByTestId("rex-pet-clock")).toContainText(pet);
}

async function expectPositionAge(
  page: Page,
  positionUuid: string,
  expectedAge: string,
  mode: MapMode = "editor"
): Promise<void> {
  await expect
    .poll(async () => {
      const feature = (await readMapFeatures(page, mode)).find(
        (item) => item.id === `pos-${positionUuid}` && item.labelType === "pos" && item.visible
      );
      return feature?.name.split(" / ")[0] ?? null;
    })
    .toBe(expectedAge);
}

async function controlClock(page: Page): Promise<void> {
  // Browser time owns these scenarios; neutralize only the external server-clock correction.
  await page.context().addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      setItem.call(this, key, key === "timeOffsetMs" ? "0" : value);
    };
    sessionStorage.setItem("timeOffsetMs", "0");
  });
  // Keep real timers and animation frames so Automerge can synchronize and maps can paint.
  await page.clock.setFixedTime(new Date(CLOCK_ORIGIN));
}

async function advanceClock(page: Page, milliseconds: number): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(new Date(now + milliseconds));
}

async function observePetTickWindow(page: Page): Promise<void> {
  const startedAt = await page.evaluate(() => performance.now());
  // Observe more than two native 100 ms PET ticks before asserting that time stayed frozen.
  await expect
    .poll(() => page.evaluate((startedAt) => performance.now() - startedAt, startedAt))
    .toBeGreaterThanOrEqual(250);
}

test.describe("Execution lifecycle", () => {
  test("stopping execution also freezes its running PET and removes the live dashboard", async ({
    page,
    mission,
    context,
  }) => {
    await controlClock(page);
    await mission.open(page);
    await openExecutionInformation(page, "Survey Bravo", mission.ids.rexEvaB, "Active Bravo");
    await enableEditing(page);
    const dashboard = await context.newPage();
    await installMapObserver(dashboard);
    await dashboard.goto(mission.dashboardUrl);
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);

    await page.getByRole("button", { name: "Start PET timer", exact: true }).click();
    await advanceClock(page, 20_000);
    await expectPet(page, "+00:05:20");
    await page.getByLabel("Stop Execution", { exact: true }).click();
    await expect(page.getByLabel("Execute EVA", { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const rex = (await mission.read()).rexes[mission.ids.rexB];
        return {
          isRunning: rex.isRunning,
          petRunning: rex.petRunning,
          pet: rex.petValueAtStartStop,
        };
      })
      .toEqual({ isRunning: false, petRunning: false, pet: "+00:05:20" });
    await advanceClock(page, 60_000);
    await observePetTickWindow(page);
    await expectPet(page, "+00:05:20");
    await expectPositionAge(page, mission.ids.posB, "+00:03:20");
    await expect(
      dashboard.getByText("No EVA is currently running.", { exact: true })
    ).toBeVisible();
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(0);
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveCount(0);
    await dashboard.close();
  });

  test("starting a stopped REX publishes its own frozen PET to an already-open dashboard", async ({
    page,
    mission,
    context,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = false;
    });
    await mission.open(page);
    await openExecutionInformation(page, "Survey Alpha", mission.ids.rexEvaA, "Stopped Alpha");
    await enableEditing(page);
    const dashboard = await context.newPage();
    await installMapObserver(dashboard);
    await dashboard.goto(mission.dashboardUrl);
    await expect(
      dashboard.getByText("No EVA is currently running.", { exact: true })
    ).toBeVisible();

    await page.getByLabel("Execute EVA", { exact: true }).click();
    await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
    await expect(dashboard.getByTestId("dashboard-pet-clock")).toHaveText("+02:10:05");
    await expect(dashboard.getByText("Stopped Alpha", { exact: true })).toBeVisible();
    await expect(dashboard.locator(".ol-viewport")).toHaveCount(2);
    await expectPositionAge(dashboard, mission.ids.posA, "+00:15:00", "dashboard");
    await expectPositionAge(page, mission.ids.posA, "+00:15:00");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
      .toBe(true);
    await dashboard.close();
  });
});
