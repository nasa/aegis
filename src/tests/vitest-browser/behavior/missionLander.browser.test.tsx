import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  selectPlanningStation,
} from "./planningHelpers";

function comparisonCells(page: Page, label: string) {
  return page
    .getBySelector(`div[data-tooltip-html="${label}"]`)
    .getBySelector("..")
    .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

async function openMissionPreferences(page: Page) {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("prefs_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toMatchTextContent(exactText("Mission Preferences"));
}

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test("location-dependent controls and comparison values recover after the lander is restored", async ({
  page,
  mission,
}) => {
  const originalLander = { lat: 0, lng: 0 };
  const restoredLander = { lat: 0.0005, lng: -0.0005 };
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.planetRadius = 6378137;
    doc.landerLocation = originalLander;
    doc.landerElevationMeters = 70;
    doc.stations[mission.ids.stationA].elevation = 130;
  });

  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("View Station in QuickMap", { exact: true }))
    .toBeEnabled();
  await expect.element(page.getByLabelText("Set to Lander", { exact: true })).toBeVisible();

  // Null coordinates represent an explicitly cleared location while retaining the point shape.
  await mission.change((doc) => {
    doc.landerLocation = { lat: null, lng: null };
    delete doc.landerElevationMeters;
  });
  await expect
    .element(page.getByText("Mission lander location not set", { exact: true }))
    .toBeVisible();
  await expect.poll(() => page.getByLabelText("Set to Lander", { exact: true }).length).toBe(0);
  await expect
    .element(page.getByLabelText("View Station in QuickMap", { exact: true }))
    .toHaveClass(/buttonDisabled/);
  await expect.poll(() => page.getByText("NaN", { exact: true }).length).toBe(0);

  await openMissionPreferences(page);
  await expect.element(planningField(page, "LatitudePref")).toMatchTextContent(exactText("0"));
  await expect.element(planningField(page, "LongitudePref")).toMatchTextContent(exactText("0"));

  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect
    .poll(() =>
      comparisonCells(page, "Max distance from lander")
        .elements()
        .map((element) => element.textContent.trim().replace(/\s+/g, " "))
    )
    .toEqual(["0", "=", "=", "="]);
  await expect.poll(() => page.getByText("NaN", { exact: true }).length).toBe(0);

  // Restore a known point through the lander coordinate editor. The normal staging path
  // recomputes dependent walkbacks/traverses and elevation before publishing the location.
  await openMissionPreferences(page);
  const latitude = await openPlanningField(page, "LatitudePref");
  await latitude.getByLabelText("LatitudePref", { exact: true }).fill(String(restoredLander.lat));
  await latitude.getByLabelText("LongitudePref", { exact: true }).fill(String(restoredLander.lng));
  await latitude.getByText("Save", { exact: true }).click();
  await expect.poll(mission.read).toMatchObject({ landerLocation: restoredLander });
  await expect
    .element(planningField(page, "LatitudePref"))
    .toMatchTextContent(exactText(String(restoredLander.lat)));

  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("View Station in QuickMap", { exact: true }))
    .toBeEnabled();
  await expect.element(page.getByLabelText("Set to Lander", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.getByText("Mission lander location not set", { exact: true }).length)
    .toBe(0);
  await expect.poll(() => page.getByText("NaN", { exact: true }).length).toBe(0);

  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  const distances = comparisonCells(page, "Max distance from lander");
  await expect.poll(() => distances.length).toBe(4);
  const restoredDistanceValues = distances.elements().map((element) => element.textContent);
  expect(restoredDistanceValues[0]).not.toBe("0");
  expect(restoredDistanceValues.every((value) => value !== "NaN")).toBe(true);
  const after = await mission.read();
  expect(after.landerLocation).toEqual(restoredLander);
  for (const [uuid, landerEnd, neighboringStation] of [
    [mission.ids.traverseOutbound, "start", mission.ids.stationA],
    [mission.ids.traverseReturn, "end", mission.ids.stationB],
  ] as const) {
    const endpoints = after.traverses[uuid].path;
    expect(landerEnd === "start" ? endpoints[0] : endpoints.at(-1)).toEqual(restoredLander);
    expect(landerEnd === "start" ? endpoints.at(-1) : endpoints[0]).toEqual(
      after.stations[neighboringStation].location
    );
    for (const point of endpoints) {
      expect(Number.isFinite(point.lat)).toBe(true);
      expect(Number.isFinite(point.lng)).toBe(true);
    }
  }
});
