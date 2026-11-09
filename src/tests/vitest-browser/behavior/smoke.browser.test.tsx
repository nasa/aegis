import { test, expect } from "./missionHarness";
import { expectMapLabel } from "./mapInteractions";
import { MISSION_NAMES } from "tests/playwright/fixtures/missionSeed";
import { exactText } from "./browserAssertions";

test("a mission exposes its planned EVAs, stations, POIs and map", async ({ page, mission }) => {
  await mission.open();
  await page.getByLabelText("evas Section", { exact: true }).click();
  await expect.poll(() => page.getByLabelText("evaList-item").length).toBe(2);
  for (const name of [MISSION_NAMES.evaA, MISSION_NAMES.evaB])
    await expect
      .element(page.getByLabelText("evaList-item").filter({ hasText: name }))
      .toBeVisible();
  await page.getByLabelText("station Section", { exact: true }).click();
  for (const name of [MISSION_NAMES.stationA, MISSION_NAMES.stationB])
    await expect
      .element(page.getByLabelText("stationList-item").filter({ hasText: name }))
      .toBeVisible();
  await page.getByLabelText("poi Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("poiList-item").filter({ hasText: MISSION_NAMES.poiA }))
    .toBeVisible();
  await expect.element(page.getBySelector('[data-map-mode="editor"] canvas').first()).toBeVisible();
});

test("the dashboard explicitly reports that no execution is running", async ({ page, mission }) => {
  await mission.openDashboard();
  await expect
    .element(page.getByText("No EVA is currently running.", { exact: true }))
    .toBeVisible();
  expect(page.getBySelector('[data-map-mode="dashboard"]').length).toBe(0);
  expect(page.getByTestId("dashboard-pet-clock").length).toBe(0);
});

const executionTest = test.extend({ scenario: "execution" as BehavioralScenario });
executionTest(
  "dashboard clock and both maps belong to the active execution",
  async ({ page, mission }) => {
    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toMatchTextContent(exactText("+00:05:00"));
    for (const mode of ["dashboard", "minimap"])
      await expect
        .element(page.getBySelector(`[data-map-mode="${mode}"] .ol-viewport`))
        .toBeVisible();
    await expectMapLabel("+00:03:00 / 1 (C)", "dashboard");
  }
);
