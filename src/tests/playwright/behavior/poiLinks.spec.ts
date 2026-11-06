import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function openStationLinks(page: Page, name: string): Promise<void> {
  await selectPlanningStation(page, name);
  await page.getByLabel("poi_panel", { exact: true }).click();
  await expect(page.getByText("Station POIs", { exact: true })).toBeVisible();
}

async function expectUsage(page: Page, count: number): Promise<void> {
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(
    page
      .getByText("Stations using this POI:", { exact: true })
      .locator("../..")
      .locator('[class*="displayFieldValue"]')
  ).toHaveText(String(count));
}

test("linking a POI across stations updates peers and counters without adopting source actions", async ({
  page,
  context,
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
  await mission.open(page);
  await enablePlanningEditMode(page);
  const peer = await context.newPage();
  await mission.open(peer);
  await expectUsage(peer, 1);

  await openStationLinks(page, "Bravo station");
  await page.locator(`input[id="${mission.ids.poiA}"]`).check();
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationB].poiUuids)
    .toEqual([mission.ids.poiA]);
  await expectUsage(peer, 2);
  await expectUsage(page, 2);

  await openStationLinks(page, "Bravo station");
  await page.locator(`input[id="${mission.ids.poiA}"]`).uncheck();
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationB].poiUuids)
    .toEqual([]);
  await expectUsage(peer, 1);
  const after = await mission.read();
  expect(after.actions).toEqual(before.actions);
  expect(after.pois).toEqual(before.pois);
  expect(after.evas).toEqual(before.evas);
  for (const uuid of [mission.ids.stationA, mission.ids.stationB]) {
    expect(after.stations[uuid].actionOrderUuids).toEqual(before.stations[uuid].actionOrderUuids);
  }
  await mission.open(page);
  await expectUsage(page, 1);
  await openStationLinks(page, "Bravo station");
  await expect(page.getByText("Reference POI", { exact: true })).toHaveCount(0);
});
