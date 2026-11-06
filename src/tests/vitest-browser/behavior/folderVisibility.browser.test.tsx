import { test, expect } from "./missionHarness";
import { seedFolder } from "tests/playwright/fixtures/entitySeeds";
import { readMapFeatures } from "./mapObserver";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function markerIds(type: "poi" | "station"): Promise<string[]> {
  return readMapFeatures()
    .filter((feature) => feature.visible && feature.layerZIndex === (type === "poi" ? 15 : 14))
    .map((feature) => feature.id)
    .sort();
}

test.describe("Folder visibility contracts", () => {
  for (const type of ["poi", "station"] as const) {
    test(`hidden ${type} folders preserve selection exceptions, saved membership and visibility exceptions across remount`, async ({
      page,
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
      await mission.open();
      await enablePlanningEditMode(page);
      await openPlanningSection(page, type);
      await expect.poll(() => markerIds(type)).toEqual([...items].sort());

      const folder = page
        .getBySelector('[class*="folderContainer"]')
        .filter({ hasText: "Hidden sites" });
      await folder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .getBySelector("dialog[open]")
        .getByText("Hide Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(async () => (await mission.read()).folders[folderUuid].visible).toBe(false);
      await expect.poll(() => markerIds(type)).toEqual([]);

      // Folder expansion is local presentation; visibility is a shared mission field.
      await folder.getByText("Hidden sites", { exact: true }).click();
      await expect
        .poll(() => folder.getByLabelText(`${type}List-item`, { exact: true }).length)
        .toBe(0);
      await folder.getByText("Hidden sites", { exact: true }).click();
      if (type === "poi") await selectPlanningPoi(page, "Reference POI");
      else await selectPlanningStation(page, "Alpha station");
      await expect.poll(() => markerIds(type)).toEqual([items[0]]);
      await page
        .getByLabelText(`${type}List-item`, { exact: true })
        .getByText(type === "poi" ? "Reference POI" : "Alpha station", { exact: true })
        .click();
      await expect.poll(() => markerIds(type)).toEqual([]);

      if (type === "station") {
        await selectPlanningEva(page, "Survey Alpha");
        await expect.poll(() => markerIds(type)).toEqual([...items].sort());
        await planningEvaRow(page, "Survey Alpha")
          .getByText("Survey Alpha", { exact: true })
          .click();
        await openPlanningSection(page, "station");
        await expect.poll(() => markerIds(type)).toEqual([]);
      }

      await mission.open();
      await openPlanningSection(page, type);
      await expect.poll(() => markerIds(type)).toEqual([]);
      await enablePlanningEditMode(page);
      await folder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .getBySelector("dialog[open]")
        .getByText("Show Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(() => markerIds(type)).toEqual([...items].sort());
      const after = await mission.read();
      expect(after.folders[folderUuid]).toMatchObject({ visible: true, items });
      for (const key of ["pois", "stations", "evas", "traverses", "actions"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
    });
  }
});
