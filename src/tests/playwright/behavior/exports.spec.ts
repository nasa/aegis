import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { FeatureCollection, Point } from "geojson";
import { test, expect } from "../fixtures/behavioralTest";
import { seedPosEntry } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  openPlanningSection,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

type MissionExport = {
  exportMission?: ExportMission;
  evas?: ExportEva[];
  pois?: ExportPOI[];
  stations?: ExportStation[];
  actions?: ExportAction[];
  traverses?: ExportTraverse[];
  rexes?: ExportRex[];
};

const categories = [
  ["all-evas", "evas"],
  ["mission", "exportMission"],
  ["pois", "pois"],
  ["stations", "stations"],
  ["actions", "actions"],
  ["traverses", "traverses"],
  ["rexes", "rexes"],
] as const;

async function downloadJson<T>(page: Page, label: string): Promise<{ name: string; data: T }> {
  const pending = page.waitForEvent("download");
  await page.getByLabel(label, { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return {
    name: download.suggestedFilename(),
    data: JSON.parse(await readFile(await download.path(), "utf8")) as T,
  };
}

async function openExport(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabel("export_panel", { exact: true }).click();
}

async function selectCategories(page: Page, selected: string[]): Promise<void> {
  for (const [id] of categories)
    await page.locator(`#export-${id}`).setChecked(selected.includes(id));
}

test.use({ scenario: "execution" });

test.describe("Downloaded export contracts", () => {
  test("combined export delivers saved planning values and nested relationships to its named filesystem JSON", async ({
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
    const before = await mission.read();
    await openExport(page);
    await selectCategories(
      page,
      categories.map(([id]) => id)
    );
    const all = await downloadJson<MissionExport>(page, "Export JSON File");
    expect(all.name).toBe(
      `${mission.name}_evas_mission_pois_stations_actions_traverses_rexes_export.json`
    );
    expect(Object.keys(all.data).sort()).toEqual(categories.map(([, key]) => key).sort());
    expect(all.data.exportMission.id).toBe(mission.id);
    expect(all.data.actions.map((a) => a.uuid).sort()).toEqual(
      [mission.ids.actionA, mission.ids.rexActionA].sort()
    );
    const station = all.data.stations.find((entry) => entry.uuid === mission.ids.stationA);
    expect(station.name).toBe("Exported sampling site");
    expect(station.actionsReadable.map((action) => action.uuid)).toContain(mission.ids.actionA);
    expect(station.poisAssociatedReadable).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Reference POI" })])
    );
    expect(all.data.pois.map((poi) => poi.uuid)).toContain(mission.ids.poiA);
    const eva = all.data.evas.find((entry) => entry.uuid === mission.ids.evaA);
    expect(eva.sequenceReadable.map((entry) => entry.uuid)).toEqual(
      before.evas[mission.ids.evaA].sequence.map((entry) => entry.uuid)
    );
    expect(eva.sequenceReadable.find((entry) => entry.uuid === mission.ids.stationA).name).toBe(
      "Exported sampling site"
    );
    expect(await mission.read()).toEqual(before);
  });

  test("position GeoJSON preserves longitude latitude order, PET, type and source for the selected execution", async ({
    page,
    mission,
  }) => {
    const secondType = "30000000-0000-4000-8000-000000000001";
    const secondSource = "30000000-0000-4000-8000-000000000002";
    await mission.change((doc) => {
      const rex = doc.rexes[mission.ids.rexA];
      rex.posTypes.push({
        uuid: secondType,
        name: "EV2",
        abbr: "2",
        icon: "1f468-200d-1f680",
        pathColor: "#00ff00",
      });
      rex.posSources.push({
        uuid: secondSource,
        name: "Navigation",
        abbr: "N",
        pathColor: "#0088ff",
      });
      rex.posEntries.push(
        seedPosEntry({
          uuid: "30000000-0000-4000-8000-000000000003",
          location: { lat: 0.002, lng: 0.004 },
          petSeconds: 7000,
          posTypeUuids: [mission.ids.posType, secondType],
          posSourceUuid: secondSource,
        })
      );
      doc.evas[mission.ids.rexEvaA].datetime = Date.parse("2026-10-24T10:00:00Z");
    });
    const before = await mission.read();
    await mission.open(page);
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabel("export_panel", { exact: true }).click();
    const { data } = await downloadJson<FeatureCollection<Point>>(
      page,
      "Export Position Entries as GeoJSON"
    );
    expect(data).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0.0015, 0.0005] },
          properties: { types: ["EV1"], petSeconds: 6905, source: "Crew" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0.004, 0.002] },
          properties: { types: ["EV1", "EV2"], petSeconds: 7000, source: "Navigation" },
        },
      ],
    });
    expect(await mission.read()).toEqual(before);
  });
});
