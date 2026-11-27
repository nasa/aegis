import { userEvent } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { MISSION_NAMES } from "tests/playwright/fixtures/missionSeed";
import { enablePlanningEditMode, openPlanningSection } from "./planningHelpers";
const executionTest = test.extend({ scenario: "execution" as BehavioralScenario });
test("editor controls and map remain reachable at narrow and wide viewports", async ({
  page,
  mission,
}) => {
  await mission.open();
  expect(await (() => window.devicePixelRatio)()).toBe(2);
  for (const width of [360, 641, 1440]) {
    await page.viewport(width, 900);
    await expect.element(page.getByLabelText("globalEditToggle", { exact: true })).toBeVisible();
    await expect.element(page.getBySelector('[data-map-mode="editor"] .ol-viewport')).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await page
          .getBySelector('[data-map-mode="editor"]')
          .query()
          ?.getBoundingClientRect();
        return bounds ? bounds.x + bounds.width : Infinity;
      })
      .toBeLessThanOrEqual(width + 1);
    const bounds = await page
      .getBySelector('[data-map-mode="editor"]')
      .query()
      ?.getBoundingClientRect();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.width).toBeGreaterThan(100);
    if (width === 360) {
      await enablePlanningEditMode(page);
      await openPlanningSection(page, "mission");
      const nameTrigger = page.getByRole("button", { name: "Mission Name edit", exact: true });
      nameTrigger.element().focus();
      await userEvent.keyboard("{Enter}");
      const dialog = page.getBySelector("dialog[open]");
      await expect.element(dialog.getByLabelText("Mission Name", { exact: true })).toBeVisible();
      const dialogBounds = await dialog
        .getByLabelText("Mission Name", { exact: true })
        .query()
        ?.getBoundingClientRect();
      expect(dialogBounds).not.toBeNull();
      expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(width + 1);
      await userEvent.keyboard("{Escape}");
      await expect.element(nameTrigger).toHaveFocus();
      await page.getByLabelText("evas Section", { exact: true }).click();
      await expect.poll(() => page.getByLabelText("evaList-item").length).toBe(2);
    }
  }
});
test("long labels, report text and timeline canvas stay inside the narrow editor viewport", async ({
  page,
  mission,
}) => {
  const longStationName = "North Ridge Surface Operations Station ".repeat(5).trim();
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].name = longStationName;
    doc.traverses[mission.ids.traverseA].duration = 9999;
  });
  await page.viewport(360, 900);
  await mission.open();
  await page.getByLabelText("station Section", { exact: true }).click();
  const stationRow = page
    .getByLabelText("stationList-item", { exact: true })
    .filter({ hasText: longStationName });
  await expect.element(stationRow).toMatchTextContent(longStationName);
  const stationName = stationRow.getBySelector("div").nth(1);
  const stationNameLayout = await ((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))(stationName.element());
  expect(stationNameLayout.clientWidth).toBeGreaterThan(0);
  expect(stationNameLayout.scrollWidth).toBeLessThanOrEqual(stationNameLayout.clientWidth + 1);

  await page.getByLabelText("evas Section", { exact: true }).click();
  await page
    .getByLabelText("evaList-item")
    .filter({ hasText: MISSION_NAMES.evaA })
    .getByText(MISSION_NAMES.evaA, { exact: true })
    .click();
  await page.getByText(MISSION_NAMES.traverseA, { exact: true }).click();
  await page.getByLabelText("report_panel", { exact: true }).click();
  await expect.element(page.getByText("Traverse Report", { exact: true })).toBeVisible();
  const reportPanel = page.getBySelector('[class*="rightControl"]').last();
  const reportBounds = await reportPanel.query()?.getBoundingClientRect();
  expect(reportBounds).not.toBeNull();
  expect(reportBounds!.x).toBeGreaterThanOrEqual(0);
  expect(reportBounds!.x + reportBounds!.width).toBeLessThanOrEqual(361);
  const warning = page.getByText(
    "Traverse duration is significantly more than the calculated total duration of actions and movement",
    { exact: true }
  );
  await expect.element(warning).toBeVisible();
  const warningSize = await ((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    right: element.getBoundingClientRect().right,
  }))(warning.element());
  expect(warningSize.scrollWidth).toBeLessThanOrEqual(warningSize.clientWidth + 1);
  expect(warningSize.right).toBeLessThanOrEqual(361);

  await page.getBySelector('[data-tooltip-content="Timeline"]').click();
  const timeline = page.getBySelector('[class*="timelineContainer"]');
  await expect.element(timeline).toBeVisible();
  await expect
    .poll(() => ((element) => element.scrollWidth - element.clientWidth)(timeline.element()))
    .toBeLessThanOrEqual(1);
  const timelineLayout = await ((element) => ({
    bounds: element.getBoundingClientRect().toJSON(),
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    canvas: element.querySelector("canvas")?.getBoundingClientRect().toJSON() ?? null,
  }))(timeline.element());
  expect(timelineLayout.bounds.x).toBeGreaterThanOrEqual(0);
  expect(timelineLayout.bounds.right).toBeLessThanOrEqual(361);
  expect(timelineLayout.scrollWidth).toBeLessThanOrEqual(timelineLayout.clientWidth + 1);
  expect(timelineLayout.canvas).not.toBeNull();
  expect(timelineLayout.canvas!.left).toBeGreaterThanOrEqual(timelineLayout.bounds.left);
  expect(timelineLayout.canvas!.right).toBeLessThanOrEqual(timelineLayout.bounds.right + 1);
});
executionTest(
  "dashboard map and minimap stay visible and within narrow and wide viewports",
  async ({ page, mission }) => {
    await mission.openDashboard();
    expect(await (() => window.devicePixelRatio)()).toBe(2);
    for (const width of [360, 641, 1440]) {
      await page.viewport(width, 900);
      for (const mode of ["dashboard", "minimap"]) {
        const map = page.getBySelector(`[data-map-mode="${mode}"]`);
        await expect.element(map.getBySelector(".ol-viewport")).toBeVisible();
        await expect
          .poll(async () => {
            const bounds = await map.query()?.getBoundingClientRect();
            return bounds ? bounds.x + bounds.width : Infinity;
          })
          .toBeLessThanOrEqual(width + 1);
        const bounds = await map.query()?.getBoundingClientRect();
        expect(bounds).not.toBeNull();
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        expect(bounds!.width).toBeGreaterThan(80);
      }
      await expect.element(page.getByTestId("dashboard-pet-clock")).toBeVisible();
    }
  }
);
