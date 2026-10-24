import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function markerIds(page: Page, type: "poi" | "station"): Promise<string[]> {
  return (await readMapFeatures(page))
    .filter((feature) => feature.visible && feature.layerZIndex === (type === "poi" ? 15 : 14))
    .map((feature) => feature.id)
    .sort();
}

test.describe("Folder visibility contracts", () => {
  for (const type of ["poi", "station"] as const) {
    test(`hidden ${type} folders preserve selection exceptions, shared visibility and saved membership`, async ({
      page,
      context,
      mission,
    }) => {
      const folderUuid = "30000000-0000-4000-8000-000000000090";
      const items =
        type === "poi" ? [mission.ids.poiA] : [mission.ids.stationA, mission.ids.stationB];
      await mission.change((doc) => {
        doc.folders = {
          [folderUuid]: seedFolder({ uuid: folderUuid, name: "Hidden sites", type, items }),
        };
      });
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openPlanningSection(page, type);
      const peer = await context.newPage();
      await installMapObserver(peer);
      await mission.open(peer);
      await openPlanningSection(peer, type);
      await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
      await expect.poll(() => markerIds(peer, type)).toEqual([...items].sort());

      const folder = page.locator('[class*="folderContainer"]').filter({ hasText: "Hidden sites" });
      await folder.locator('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .locator("dialog[open]")
        .getByText("Hide Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(async () => (await mission.read()).folders[folderUuid].visible).toBe(false);
      await expect.poll(() => markerIds(page, type)).toEqual([]);
      await expect.poll(() => markerIds(peer, type)).toEqual([]);

      // Folder expansion is local presentation; visibility is a shared mission field.
      await folder.getByText("Hidden sites", { exact: true }).click();
      await expect(folder.getByLabel(`${type}List-item`, { exact: true })).toHaveCount(0);
      await folder.getByText("Hidden sites", { exact: true }).click();
      if (type === "poi") await selectPlanningPoi(page, "Reference POI");
      else await selectPlanningStation(page, "Alpha station");
      await expect.poll(() => markerIds(page, type)).toEqual([items[0]]);
      await expect.poll(() => markerIds(peer, type)).toEqual([]);
      await page
        .getByLabel(`${type}List-item`, { exact: true })
        .getByText(type === "poi" ? "Reference POI" : "Alpha station", { exact: true })
        .click();
      await expect.poll(() => markerIds(page, type)).toEqual([]);

      if (type === "station") {
        await selectPlanningEva(page, "Survey Alpha");
        await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
        await planningEvaRow(page, "Survey Alpha")
          .getByText("Survey Alpha", { exact: true })
          .click();
        await openPlanningSection(page, "station");
        await expect.poll(() => markerIds(page, type)).toEqual([]);
      }

      await mission.open(page);
      await openPlanningSection(page, type);
      await expect.poll(() => markerIds(page, type)).toEqual([]);
      await enablePlanningEditMode(page);
      await folder.locator('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .locator("dialog[open]")
        .getByText("Show Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
      await expect.poll(() => markerIds(peer, type)).toEqual([...items].sort());
      const after = await mission.read();
      expect(after.folders[folderUuid]).toMatchObject({ visible: true, items });
      for (const key of ["pois", "stations", "evas", "traverses", "actions"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
    });
  }
});
