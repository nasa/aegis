import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  planningField,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function openStationLinks(page: Page, name: string): Promise<void> {
  await selectPlanningStation(page, name);
  await page.getByLabelText("poi_panel", { exact: true }).click();
  await expect.element(page.getByText("Station POIs", { exact: true })).toBeVisible();
}

async function expectUsage(page: Page, count: number): Promise<void> {
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(
      page
        .getByText("Stations using this POI:", { exact: true })
        .getBySelector("../..")
        .getBySelector('[class*="displayFieldValue"]')
    )
    .toMatchTextContent(exactText(String(count)));
}

test("linking a POI across stations updates counters and navigation without adopting source actions", async ({
  page,
  mission,
}) => {
  const sourceUuid = "30000000-0000-4000-8000-000000000091";
  await mission.change((doc) => {
    doc.actions[sourceUuid] = seedAction({
      uuid: sourceUuid,
      refUuid: sourceUuid,
      name: "Unadopted POI sample",
      poiUuid: mission.ids.poiA,
    });
    doc.pois[mission.ids.poiA].actionOrderUuids = [sourceUuid];
  });
  const before = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  await expectUsage(page, 1);

  await openStationLinks(page, "Bravo station");
  await expect.element(page.getBySelector(`input[id="${mission.ids.poiA}"]`)).not.toBeChecked();
  await page.getBySelector(`input[id="${mission.ids.poiA}"]`).click();
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationB].poiUuids)
    .toEqual([mission.ids.poiA]);
  await expectUsage(page, 2);

  // In view mode, a linked POI is a navigation target rather than a checkbox.
  await page.getByLabelText("globalEditToggle", { exact: true }).click();
  for (const name of ["Alpha station", "Bravo station"]) {
    await openStationLinks(page, name);
    await page.getByText("Reference POI", { exact: true }).click();
    await expect.element(planningField(page, "POI")).toMatchTextContent(exactText("Reference POI"));
    await expectUsage(page, 2);
  }

  await enablePlanningEditMode(page);
  for (const [name, uuid, count] of [
    ["Alpha station", mission.ids.stationA, 1],
    ["Bravo station", mission.ids.stationB, 0],
  ] as const) {
    await openStationLinks(page, name);
    await expect.element(page.getBySelector(`input[id="${mission.ids.poiA}"]`)).toBeChecked();
    await page.getBySelector(`input[id="${mission.ids.poiA}"]`).click();
    await expect.poll(async () => (await mission.read()).stations[uuid].poiUuids).toEqual([]);
    await expectUsage(page, count);
  }
  const after = await mission.read();
  expect(after.actions).toEqual(before.actions);
  expect(after.pois).toEqual(before.pois);
  expect(after.evas).toEqual(before.evas);
  for (const uuid of [mission.ids.stationA, mission.ids.stationB]) {
    expect(after.stations[uuid].actionOrderUuids).toEqual(before.stations[uuid].actionOrderUuids);
  }
  await mission.open();
  await expectUsage(page, 0);
  for (const name of ["Alpha station", "Bravo station"]) {
    await openStationLinks(page, name);
    await expect.poll(() => page.getByText("Reference POI", { exact: true }).length).toBe(0);
  }
});
