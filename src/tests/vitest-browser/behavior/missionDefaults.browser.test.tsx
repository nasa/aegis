import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { exactText } from "./browserAssertions";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";
async function openPreferences(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("prefs_panel", { exact: true }).click();
}

function displayedValue(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .getBySelector("../..")
    .getBySelector('[class*="displayFieldValue"]');
}

test("mission walkback defaults update inherited times while station overrides and existing EVA durations stay independent", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.walkbackRate = 3;
    doc.defaultEvaDuration = 240;
    doc.stations[mission.ids.stationA].walkbackTraverseRate = null;
    doc.stations[mission.ids.stationB].walkbackTraverseRate = 6;
    for (const uuid of [mission.ids.stationA, mission.ids.stationB]) {
      doc.stations[uuid].walkbackPathSegmentDistances = [500];
    }
  });
  const before = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("10"));

  await openPreferences(page);
  await savePlanningField(page, "Default walkback rate", "2");
  await savePlanningField(page, "Default EVA Duration", "300");
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("15"));
  await selectPlanningStation(page, "Bravo station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(planningField(page, "Average Walkback Traverse Rate"))
    .toHaveTextContent(exactText("6"));
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("5"));
  const clear = await openPlanningField(page, "Average Walkback Traverse Rate");
  await clear.getByLabelText("Average Walkback Traverse Rate", { exact: true }).fill("");
  await clear.getByText("Save", { exact: true }).click();
  await expect.poll(() => clear.length).toBe(0);
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("15"));

  await selectPlanningStation(page, "Alpha station");
  await savePlanningField(page, "Average Walkback Traverse Rate", "1.5");
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("20"));
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("20"));
  await openPreferences(page);
  await savePlanningField(page, "Default walkback rate", "6");
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("20"));
  await selectPlanningStation(page, "Bravo station");
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("5"));
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationB].walkbackTraverseRate)
    .toBeNull();
  const after = await mission.read();
  expect(after.evas).toEqual(before.evas);
  expect(after.actions).toEqual(before.actions);
  expect(after.traverses).toEqual(before.traverses);

  // The EVA duration default is copied at creation, unlike inherited walkback rates.
  await openPlanningSection(page, "evas");
  await page.getByLabelText("addEva", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).evas).length).toBe(3);
  const created = Object.values((await mission.read()).evas).find((eva) => !before.evas[eva.uuid]);
  expect(created.duration).toBe(300);
  for (const uuid of [mission.ids.evaA, mission.ids.evaB]) {
    expect((await mission.read()).evas[uuid]).toEqual(before.evas[uuid]);
  }
  await mission.open();
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("20"));
  await selectPlanningStation(page, "Bravo station");
  await expect.element(displayedValue(page, "Time (mins):")).toHaveTextContent(exactText("5"));
});
