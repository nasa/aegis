import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction, seedPoi, seedPosEntry } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  confirmPlanningDelete,
} from "./planningHelpers";

const equipment = "80000000-0000-4000-8000-000000000001";
const reusable = "80000000-0000-4000-8000-000000000002";
const point = (meters: number): AEGISPoint => ({
  lat: 0,
  lng: ((meters / 6378137) * 180) / Math.PI,
});

async function comparison(page: Page) {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect(page.getByText("Metric", { exact: true })).toBeVisible();
}

function cells(page: Page, label: string) {
  return page
    .locator(`div[data-tooltip-html="${label}"]`)
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

const expectedMetrics: Record<string, (number | null)[]> = {
  "Total EVA time (calculated)": [29, 22, 13, 16],
  "Total EVA time (allotted)": [60, 80, 40, 50],
  "EVA time margin (allotted − calculated)": [31, 58, 27, 34],
  "Traverse time": [12, 6, 6, 12],
  "Dwell time EV1": [10, 12, 0, 0],
  "Dwell time EV2": [7, 4, 7, 4],
  "Dwell time unassigned": [3, 2, 3, 2],
  "Total dwell time (max EV1/EV2)": [17, 16, 7, 4],
  "Total traverse distance": [600, 600, 600, 600],
  "Total ascent": [15, 15, 10, 10],
  "Total descent": [21, 21, 14, 14],
  "Max distance from lander": [300, 300, 300, 300],
  "Worst-case station walkback duration": [6, 6, 6, 6],
  "Station count": [4, 4, 3, 3],
  "Action count": [3, 3, 2, 2],
  "Total action time": [20, 18, 10, 6],
  "Planned sample mass": [1.5, 2.25, 0.5, 0.25],
  "Single-use consumables": [5, 5, 3, 1],
  "Actual sample mass": [null, 0.75, null, 0],
  "Actions complete": [null, 1, null, 0],
  "Actions skipped": [null, 1, null, 0],
  "Actual distance walked": [null, 100, null, 200],
};

function numberText(value: number | null) {
  return value == null
    ? ""
    : Number(value.toFixed(Math.abs(value) < 100 ? 1 : 0)).toLocaleString("en-US");
}

test.describe("Independent report metrics", () => {
  test.use({ scenario: "execution" });
  test.beforeEach(async ({ mission }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.planetRadius = 6378137;
      doc.landerLocation = point(0);
      doc.walkbackRate = 3;
      doc.equipmentItems = {
        [equipment]: { name: "Sample bags", quantity: 20, singleUse: true },
        [reusable]: { name: "Reusable hammer", quantity: 1, singleUse: false },
      };
      doc.actions = {};
      for (const station of Object.values(doc.stations)) {
        const meters =
          station.refUuid === doc.stations[mission.ids.stationA].refUuid
            ? 100
            : station.refUuid === doc.stations[mission.ids.stationB].refUuid
              ? 300
              : 0;
        station.location = point(meters);
        station.duration = null;
        station.actionOrderUuids = [];
        station.walkbackPath = [point(meters), point(0)];
        station.walkbackPathSegmentDistances = [meters];
        station.walkbackPathSegmentElevations = [[0, 0]];
      }
      const families = [
        {
          evaId: mission.ids.evaA,
          rex: null,
          duration: 60,
          rate: 3,
          crew: [10, 7, 3],
          mass: [1000, 500],
          quantity: [2, 3],
        },
        {
          evaId: mission.ids.rexEvaA,
          rex: mission.ids.rexA,
          duration: 80,
          rate: 6,
          crew: [12, 4, 2],
          mass: [2000, 250],
          quantity: [4, 1],
        },
        {
          evaId: mission.ids.evaB,
          rex: null,
          duration: 40,
          rate: 6,
          crew: [10, 7, 3],
          mass: [1000, 500],
          quantity: [2, 3],
        },
        {
          evaId: mission.ids.rexEvaB,
          rex: mission.ids.rexB,
          duration: 50,
          rate: 3,
          crew: [12, 4, 2],
          mass: [2000, 250],
          quantity: [4, 1],
        },
      ];
      let index = 10;
      const visited = new Set<string>();
      for (const family of families) {
        const eva = doc.evas[family.evaId];
        eva.duration = family.duration;
        eva.traverseRate = family.rate;
        for (let i = 0; i < eva.sequence.length; i++) {
          const item = eva.sequence[i];
          if (item.type === "traverse") {
            const before = doc.stations[eva.sequence[i - 1].uuid].location;
            const after = doc.stations[eva.sequence[i + 1].uuid].location;
            doc.traverses[item.uuid].path = [
              { lat: before.lat, lng: before.lng },
              { lat: after.lat, lng: after.lng },
            ];
            doc.traverses[item.uuid].pathSegmentDistances = [
              Math.round(((Math.abs(after.lng - before.lng) * Math.PI) / 180) * 6378137),
            ];
            doc.traverses[item.uuid].pathSegmentElevations = [[0, 5, -2]];
            doc.traverses[item.uuid].pathSegmentAbsoluteSlopes = [[0, 1, 2]];
            doc.traverses[item.uuid].duration = null;
            doc.traverses[item.uuid].actionOrderUuids = [];
          } else {
            const station = doc.stations[item.uuid];
            if (station.isLanderXgress || visited.has(station.uuid)) continue;
            visited.add(station.uuid);
            const isAlpha = station.refUuid === doc.stations[mission.ids.stationA].refUuid;
            for (const unassigned of isAlpha ? [false] : [false, true]) {
              const uuid = `80000000-0000-4000-8000-${String(index++).padStart(12, "0")}`;
              doc.actions[uuid] = seedAction({
                uuid,
                refUuid: uuid,
                name: `Known task ${index}`,
                stationUuid: station.uuid,
                duration: unassigned ? family.crew[2] : family.crew[isAlpha ? 0 : 1],
                crewAssigned: unassigned ? [] : [isAlpha ? "EV1" : "EV2"],
                mass: unassigned ? null : family.mass[isAlpha ? 0 : 1],
                equipmentItemsUsage: unassigned
                  ? {}
                  : {
                      [equipment]: { quantityUsed: family.quantity[isAlpha ? 0 : 1] },
                      [reusable]: { quantityUsed: 99 },
                    },
              });
              station.actionOrderUuids.push(uuid);
            }
          }
        }
        if (family.rex) {
          const rex = doc.rexes[family.rex];
          rex.isRunning = false;
          const actionIds = eva.sequence
            .filter((item) => item.type === "station")
            .flatMap((item) => doc.stations[item.uuid].actionOrderUuids);
          rex.actionEntries = {};
          actionIds.forEach((uuid, i) => {
            rex.actionEntries[uuid] = {
              rexStatus:
                family.rex === mission.ids.rexA
                  ? i === 0
                    ? "complete"
                    : i === 1
                      ? "skipped"
                      : "pending"
                  : "pending",
              mass: family.rex === mission.ids.rexA && i === 0 ? 750 : 0,
              markerId: null,
              containerId: null,
              secondaryContainerId: null,
            };
          });
          const distance = family.rex === mission.ids.rexA ? 100 : 200;
          const firstPositionIndex = index;
          index += 2;
          rex.posEntries = [0, distance].map((meters, i) =>
            seedPosEntry({
              uuid: `90000000-0000-4000-8000-${String(firstPositionIndex + i).padStart(12, "0")}`,
              location: point(meters),
              petSeconds: i * 60,
              posTypeUuids: [mission.ids.posType],
              posSourceUuid: mission.ids.posSource,
            })
          );
        }
      }
    });
  });
  test("equal travel totals have neutral cells and disappear from differences-only rows", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      for (const eva of Object.values(doc.evas)) eva.traverseRate = 3;
    });
    const before = await mission.read();
    await mission.open(page);
    await comparison(page);
    await page
      .locator('[data-tooltip-content="Column that other columns are compared against"] select')
      .selectOption(mission.ids.evaA);
    await expect(cells(page, "Traverse time")).toHaveText(["12", "=", "=", "="]);
    for (let index = 1; index < 4; index++) {
      await expect(cells(page, "Traverse time").nth(index)).toHaveAttribute(
        "data-tooltip-html",
        /same as baseline$/
      );
      await expect(cells(page, "Traverse time").nth(index)).toHaveClass(/cellDiffEqual/);
    }
    await page.getByText("Differences only", { exact: true }).click();
    await expect(cells(page, "Traverse time")).toHaveCount(0);
    await expect(cells(page, "Total dwell time (max EV1/EV2)")).toHaveCount(4);
    expect(await mission.read()).toEqual(before);
  });
  for (const baseline of ["Alpha plan", "Alpha execution", "Bravo plan", "Bravo execution"]) {
    test(`all comparison metrics use independent quantities and signed/null differences against ${baseline}`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open(page);
      await comparison(page);
      await page.getByText("Diff", { exact: true }).click();
      for (const [label, values] of Object.entries(expectedMetrics)) {
        await expect(cells(page, label)).toHaveText(values.map(numberText));
      }
      const baselineIndex = [
        "Alpha plan",
        "Alpha execution",
        "Bravo plan",
        "Bravo execution",
      ].indexOf(baseline);
      const baselineKey = [mission.ids.evaA, mission.ids.rexA, mission.ids.evaB, mission.ids.rexB][
        baselineIndex
      ];
      await page
        .locator('[data-tooltip-content="Column that other columns are compared against"] select')
        .selectOption(baselineKey);
      await page.getByText("Diff", { exact: true }).click();
      for (const [label, values] of Object.entries(expectedMetrics)) {
        const expected = values.map((value, index) => {
          const base = values[baselineIndex];
          if (value == null || base == null || index === baselineIndex) return numberText(value);
          const delta = value - base;
          return delta === 0 ? "=" : `${delta < 0 ? "−" : "+"}${numberText(Math.abs(delta))}`;
        });
        await expect(cells(page, label)).toHaveText(expected);
      }
      expect(await mission.read()).toEqual(before);
    });
  }
});

for (const remainingPoi of [false, true]) {
  test(`empty reports and remote deletion recover ${remainingPoi ? "to another POI" : "to an explicit empty state"} without incidental mutations`, async ({
    page,
    context,
    mission,
  }) => {
    const second = "90000000-0000-4000-8000-000000000099";
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.evas = {};
      doc.traverses = {};
      doc.rexes = {};
      doc.reportCampaigns = remainingPoi
        ? {
            "83000000-0000-4000-8000-000000000001": {
              uuid: "83000000-0000-4000-8000-000000000001",
              name: "Empty campaign",
              description: null,
              memberEvaUuids: [],
              executionRexUuidByEvaUuid: null,
              createdAt: 1,
              updatedAt: null,
            },
          }
        : {};
      if (remainingPoi) doc.pois[second] = seedPoi({ uuid: second, name: "Surviving outcrop" });
    });
    const before = await mission.read();
    await mission.open(page);
    await page.getByLabel("reports Section", { exact: true }).click();
    await expect(page.getByText(/No STM objectives are configured/)).toBeVisible();
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect(cells(page, "Station count")).toHaveText(remainingPoi ? ["", ""] : []);
    await page.getByRole("button", { name: /^View/ }).click();
    const selector = page.getByRole("dialog", { name: "Visible report columns" });
    if (remainingPoi)
      await expect(selector.getByLabel("Show Empty campaign", { exact: true })).toBeChecked();
    else await expect(selector.getByText("No columns available.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close column selector" }).click();
    await page.getByText("Campaigns…", { exact: true }).click();
    const campaigns = page.locator("dialog[open]");
    if (remainingPoi) {
      await campaigns.getByRole("button", { name: "Empty campaign", exact: true }).click();
      await expect(
        campaigns.getByText("No as-planned EVAs are available.", { exact: true })
      ).toBeVisible();
      await expect(campaigns.getByText("0 of 0 executed", { exact: true })).toBeVisible();
    } else await expect(campaigns.getByText("No campaigns yet.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close campaigns" }).click();
    await page.getByText("POI Traceability", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Reference POI action trace" })).toBeVisible();
    expect(await mission.read()).toEqual(before);
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningPoi(peer, "Reference POI");
    await confirmPlanningDelete(peer, "deletePoi");
    await expect(page.getByRole("region", { name: "Reference POI action trace" })).toHaveCount(0);
    if (remainingPoi)
      await expect(
        page.getByRole("region", { name: "Surviving outcrop action trace" })
      ).toBeVisible();
    else {
      await expect(page.getByText("No POIs in this mission.", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Choose a POI to trace its actions.", { exact: true })
      ).toBeVisible();
    }
    const after = await mission.read();
    expect(after.pois[mission.ids.poiA]).toBeUndefined();
    expect(after.evas).toEqual(before.evas);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.rexes).toEqual(before.rexes);
    expect(after.reportCampaigns).toEqual(before.reportCampaigns);
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect(cells(page, "Station count")).toHaveText(remainingPoi ? ["", ""] : []);
    await page.getByText("POI Traceability", { exact: true }).click();
    expect(await mission.read()).toEqual(after);
  });
}
