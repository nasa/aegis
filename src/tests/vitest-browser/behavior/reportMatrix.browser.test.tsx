import { vi } from "vitest";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedAction, seedPosEntry } from "tests/playwright/fixtures/entitySeeds";

const equipment = "80000000-0000-4000-8000-000000000001";
const reusable = "80000000-0000-4000-8000-000000000002";
const point = (meters: number): AEGISPoint => ({
  lat: 0,
  lng: ((meters / 6378137) * 180) / Math.PI,
});

async function comparison(page: Page) {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect.element(page.getByText("Metric", { exact: true })).toBeVisible();
}

function cells(page: Page, label: string) {
  return page
    .getBySelector(`div[data-tooltip-html="${label}"]`)
    .getBySelector("..")
    .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
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
  const scopedTest = test.extend({ scenario: "execution" as BehavioralScenario });
  scopedTest.beforeEach(async ({ mission }) => {
    await mission.change((doc) => {
      doc.demFilePath = "synthetic-report.tif";
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
    const traverses = (await mission.read()).traverses;
    const originalFetch = window.fetch;
    vi.spyOn(window, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
        if (url.pathname !== "/api/v1/terrain-profile/batch") return originalFetch(input, init);
        const profiles = JSON.parse(String(init?.body)).profiles as TerrainProfilePostData[];
        return Response.json({
          status: "success",
          data: profiles.map((profile) => ({
            status: "success",
            data: {
              elevationsMeters: profile.pathSegmentDistances.map(() =>
                Object.hasOwn(traverses, profile.entityUuid) ? [0, 5, -2] : [0, 0]
              ),
              terrainSlopesDegrees: profile.pathSegmentDistances.map(() =>
                Object.hasOwn(traverses, profile.entityUuid) ? [0, 1, 2] : [0, 0]
              ),
            },
          })),
        });
      }
    );
  });
  scopedTest(
    "equal travel totals have neutral cells and disappear from differences-only rows",
    async ({ page, mission }) => {
      await mission.change((doc) => {
        for (const eva of Object.values(doc.evas)) eva.traverseRate = 3;
      });
      const before = await mission.read();
      await mission.open();
      await comparison(page);
      await page
        .getBySelector(
          '[data-tooltip-content="Column that other columns are compared against"] select'
        )
        .selectOptions(mission.ids.evaA);
      await expect
        .poll(() =>
          cells(page, "Traverse time")
            .elements()
            .map((element) => element.textContent.trim().replace(/\s+/g, " "))
        )
        .toEqual(["12", "=", "=", "="]);
      for (let index = 1; index < 4; index++) {
        await expect
          .poll(() =>
            cells(page, "Traverse time").nth(index).element().getAttribute("data-tooltip-html")
          )
          .toMatch(/same as baseline$/);
        await expect.element(cells(page, "Traverse time").nth(index)).toHaveClass(/cellDiffEqual/);
      }
      await page.getByText("Differences only", { exact: true }).click();
      await expect.poll(() => cells(page, "Traverse time").length).toBe(0);
      await expect.poll(() => cells(page, "Total dwell time (max EV1/EV2)").length).toBe(4);
      expect(await mission.read()).toEqual(before);
    }
  );
  for (const baseline of ["Alpha plan", "Alpha execution", "Bravo plan", "Bravo execution"]) {
    scopedTest(
      `all comparison metrics use independent quantities and signed/null differences against ${baseline}`,
      async ({ page, mission }) => {
        const before = await mission.read();
        await mission.open();
        await comparison(page);
        await page.getByText("Diff", { exact: true }).click();
        for (const [label, values] of Object.entries(expectedMetrics)) {
          await expect
            .poll(() =>
              cells(page, label)
                .elements()
                .map((element) => element.textContent.trim().replace(/\s+/g, " "))
            )
            .toEqual(values.map(numberText));
        }
        const baselineIndex = [
          "Alpha plan",
          "Alpha execution",
          "Bravo plan",
          "Bravo execution",
        ].indexOf(baseline);
        const baselineKey = [
          mission.ids.evaA,
          mission.ids.rexA,
          mission.ids.evaB,
          mission.ids.rexB,
        ][baselineIndex];
        await page
          .getBySelector(
            '[data-tooltip-content="Column that other columns are compared against"] select'
          )
          .selectOptions(baselineKey);
        await page.getByText("Diff", { exact: true }).click();
        for (const [label, values] of Object.entries(expectedMetrics)) {
          const expected = values.map((value, index) => {
            const base = values[baselineIndex];
            if (value == null || base == null || index === baselineIndex) return numberText(value);
            const delta = value - base;
            return delta === 0 ? "=" : `${delta < 0 ? "−" : "+"}${numberText(Math.abs(delta))}`;
          });
          await expect
            .poll(() =>
              cells(page, label)
                .elements()
                .map((element) => element.textContent.trim().replace(/\s+/g, " "))
            )
            .toEqual(expected);
        }
        expect(await mission.read()).toEqual(before);
      }
    );
  }
});
