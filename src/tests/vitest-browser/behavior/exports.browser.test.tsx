import { vi } from "vitest";
import { setChecked } from "./browserAssertions";

import type { BrowserPage as Page } from "vitest/browser";
import type { FeatureCollection, Point } from "geojson";
import { test as base, expect } from "./missionHarness";
import { seedPosEntry } from "tests/playwright/fixtures/entitySeeds";
import { openPlanningSection } from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

const categories = [
  ["all-evas", "evas"],
  ["mission", "exportMission"],
  ["pois", "pois"],
  ["stations", "stations"],
  ["actions", "actions"],
  ["traverses", "traverses"],
  ["rexes", "rexes"],
] as const;

async function downloadJson<T>(
  page: Page,
  mission: BrowserMission,
  label: string
): Promise<BrowserJsonDownload<T>> {
  const download = await mission.captureDownload(() =>
    page.getByLabelText(label, { exact: true }).click()
  );
  return { name: download.filename, data: JSON.parse(await download.text()) as T };
}

async function openExport(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("export_panel", { exact: true }).click();
}

async function selectCategories(page: Page, selected: string[]): Promise<void> {
  for (const [id] of categories)
    await setChecked(page.getBySelector(`#export-${id}`), selected.includes(id));
}

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test.describe("Downloaded export contracts", () => {
  for (const [id, key] of categories) {
    test(`mission export includes only the selected ${key} category`, async ({ page, mission }) => {
      const before = await mission.read();
      await mission.open();
      await openExport(page);
      await selectCategories(page, [id]);
      const { name, data } = await downloadJson<BrowserMissionExport>(
        page,
        mission,
        "Export JSON File"
      );
      expect(name).toBe(`${mission.name}_${id === "all-evas" ? "evas" : id}_export.json`);
      expect(Object.keys(data)).toEqual([key]);
      if (key === "exportMission") {
        expect(data.exportMission).toMatchObject({ id: mission.id, name: mission.name });
        expect(data.exportMission.stations[mission.ids.stationA].name).toBe("Alpha station");
      } else {
        expect(data[key].map((entity) => entity.uuid).sort()).toEqual(
          Object.keys(before[key]).sort()
        );
      }
      if (key === "stations") {
        expect(data.stations.find((s) => s.uuid === mission.ids.stationA)).toMatchObject({
          actionsReadable: [
            expect.objectContaining({ uuid: mission.ids.actionA, name: "Sample regolith" }),
          ],
          poisAssociatedReadable: [{ name: "Reference POI", description: "A reference outcrop" }],
        });
      }
      expect(await mission.read()).toEqual(before);
    });
  }

  test("combined and empty export selections match their filenames and preserve mission state", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open();
    await openExport(page);
    for (const [id] of categories) {
      if (id === "all-evas")
        await expect.element(page.getBySelector(`#export-${id}`)).toBeChecked();
      else await expect.element(page.getBySelector(`#export-${id}`)).not.toBeChecked();
    }
    await selectCategories(
      page,
      categories.map(([id]) => id)
    );
    const all = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
    expect(all.name).toBe(
      `${mission.name}_evas_mission_pois_stations_actions_traverses_rexes_export.json`
    );
    expect(Object.keys(all.data).sort()).toEqual(categories.map(([, key]) => key).sort());
    expect(all.data.exportMission.id).toBe(mission.id);
    expect(all.data.actions.map((a) => a.uuid).sort()).toEqual(
      [mission.ids.actionA, mission.ids.rexActionA].sort()
    );
    await selectCategories(page, []);
    const empty = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
    expect(empty.name).toBe(`${mission.name}_export.json`);
    expect(empty.data).toEqual({});
    expect(await mission.read()).toEqual(before);
  });

  test("plan and execution exports preserve sequence lineage, sample values and execution ownership", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexA].actionEntries = {
        [mission.ids.rexActionA]: {
          rexStatus: "complete",
          mass: 0.75,
          markerId: "CORE-α",
          containerId: "BAG-1",
          secondaryContainerId: "BOX-2",
        },
      };
      doc.rexes[mission.ids.rexA].stationEntries = {
        [mission.ids.rexStationA]: { rexStatus: "skipped" },
      };
      doc.actions[mission.ids.rexActionA].mass = 0.5;
    });
    const before = await mission.read();
    await mission.open();
    await openExport(page);
    await selectCategories(page, ["all-evas", "rexes"]);
    const { data } = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
    const plan = data.evas.find((e) => e.uuid === mission.ids.evaA);
    const executed = data.evas.find((e) => e.uuid === mission.ids.rexEvaA);
    for (const eva of [plan, executed]) {
      expect(eva.sequenceReadable.map((e) => e.uuid)).toEqual(
        before.evas[eva.uuid].sequence.map((e) => e.uuid)
      );
      expect(eva.sequenceRefUuids.map((e) => e.refUuid)).toEqual([
        before.stations[mission.ids.egressA].refUuid,
        before.traverses[mission.ids.traverseOutbound].refUuid,
        before.stations[mission.ids.stationA].refUuid,
        before.traverses[mission.ids.traverseA].refUuid,
        before.stations[mission.ids.stationB].refUuid,
        before.traverses[mission.ids.traverseReturn].refUuid,
        before.stations[mission.ids.ingressA].refUuid,
      ]);
    }
    expect(plan.rexUuid).toBeNull();
    expect(executed.rexUuid).toBe(mission.ids.rexA);
    expect((plan.sequenceReadable[2] as ExportStation).actionsReadable[0]).toMatchObject({
      uuid: mission.ids.actionA,
      mass: null,
      rexUuid: null,
    });
    expect((executed.sequenceReadable[2] as ExportStation).actionsReadable[0]).toMatchObject({
      uuid: mission.ids.rexActionA,
      mass: 0.5,
      rexUuid: mission.ids.rexA,
    });
    expect(data.rexes.find((r) => r.uuid === mission.ids.rexA)).toMatchObject({
      actionEntries: {
        [mission.ids.rexActionA]: {
          rexStatus: "complete",
          mass: 0.75,
          markerId: "CORE-α",
          containerId: "BAG-1",
          secondaryContainerId: "BOX-2",
        },
      },
      stationEntries: { [mission.ids.rexStationA]: { rexStatus: "skipped" } },
    });
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabelText("export_panel", { exact: true }).click();
    const single = await downloadJson<{ rex: ExportRex[] }>(page, mission, "Export REX as JSON");
    expect(single.name).toBe("Stopped Alpha_rex_export.json");
    expect(single.data.rex).toEqual([data.rexes.find((r) => r.uuid === mission.ids.rexA)]);
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
    await mission.open();
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabelText("export_panel", { exact: true }).click();
    const { data } = await downloadJson<FeatureCollection<Point>>(
      page,
      mission,
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

  test("exports retain null and zero values, empty lists and Unicode without fabricated coordinates", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.pois[mission.ids.poiA].name = "氷 — α";
      doc.pois[mission.ids.poiA].location = null;
      doc.actions[mission.ids.actionA].duration = 0;
      doc.actions[mission.ids.actionA].mass = 0;
      doc.actions[mission.ids.actionA].location = null;
      doc.actions[mission.ids.rexActionA].mass = null;
      doc.actions[mission.ids.rexActionA].duration = null;
    });
    await mission.open();
    await openExport(page);
    await selectCategories(page, ["pois", "actions"]);
    const { data } = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
    expect(data.pois[0]).toMatchObject({
      name: "氷 — α",
      location: null,
      actionOrderUuids: [],
      actionsReadable: [],
    });
    expect(data.actions.find((a) => a.uuid === mission.ids.actionA)).toMatchObject({
      duration: 0,
      mass: 0,
      location: null,
      equipmentItemsUsage: {},
    });
    expect(data.actions.find((a) => a.uuid === mission.ids.rexActionA).mass).toBeNull();
    expect(data.actions.find((a) => a.uuid === mission.ids.rexActionA).duration).toBeNull();
    expect(JSON.stringify(data)).not.toContain("NaN");
  });
});

test("repeated exports preserve identical contents and recover after a download URL failure without document changes", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open();
  await openExport(page);
  await selectCategories(page, ["mission"]);
  const first = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
  const repeated = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
  expect(repeated).toEqual(first);
  const createURL = vi.spyOn(URL, "createObjectURL").mockImplementationOnce(() => {
    throw new Error("Synthetic export URL creation failure");
  });
  await page.getByLabelText("Export JSON File", { exact: true }).click();
  await expect.element(page.getByRole("alert").filter({ hasText: "Export failed" })).toBeVisible();
  createURL.mockRestore();
  const recovered = await downloadJson<BrowserMissionExport>(page, mission, "Export JSON File");
  expect(recovered).toEqual(first);
  expect(await mission.read()).toEqual(before);
});
