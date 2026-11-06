import { readFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

test.describe("Planning contracts", () => {
  test("station names save to the mission, update the list, and survive a fresh page", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Sampling ridge");

    await expect(
      page.getByLabel("stationList-item").filter({ hasText: "Sampling ridge" })
    ).toHaveCount(1);
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Sampling ridge");
    expect((await mission.read()).stations[mission.ids.stationB].name).toBe("Bravo station");

    await mission.open(page);
    await selectPlanningStation(page, "Sampling ridge");
    await expect(planningField(page, "Station")).toHaveText("Sampling ridge");
  });

  test("JSON export contains the saved planning values and nested station/action relationships", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Exported sampling site");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Exported sampling site");
    await openPlanningSection(page, "mission");
    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-stations").check();
    await page.locator("#export-pois").check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await downloadPromise;
    const output: BehavioralPlanningExport = JSON.parse(
      await readFile(await download.path(), "utf8")
    );
    const station = output.stations.find((entry) => entry.uuid === mission.ids.stationA);
    expect(station.name).toBe("Exported sampling site");
    expect(station.actionsReadable.map((action) => action.uuid)).toContain(mission.ids.actionA);
    expect(station.poisAssociatedReadable).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Reference POI" })])
    );
    expect(output.pois.map((poi) => poi.uuid)).toContain(mission.ids.poiA);
    const eva = output.evas.find((entry) => entry.uuid === mission.ids.evaA);
    expect(eva.sequenceReadable.map((entry) => entry.uuid)).toEqual(
      (await mission.read()).evas[mission.ids.evaA].sequence.map((entry) => entry.uuid)
    );
    expect(eva.sequenceReadable.find((entry) => entry.uuid === mission.ids.stationA).name).toBe(
      "Exported sampling site"
    );
  });
});
