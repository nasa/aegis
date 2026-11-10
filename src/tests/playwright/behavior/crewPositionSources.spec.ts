import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { selectExecution } from "./executionHelpers";
import { enablePlanningEditMode } from "./planningHelpers";
import { installMapObserver } from "../fixtures/mapAssertions";

const rover = "94000000-0000-4000-8000-000000000001";
const points = [
  { lat: 0, lng: 0.001 },
  { lat: 0, lng: 0.002 },
  { lat: 0.001, lng: 0.001 },
  { lat: 0.001, lng: 0.002 },
];

async function paths(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    return map
      .getLayers()
      .getArray()
      .flatMap((layer) => {
        const source = (layer as VectorLayer).getSource?.();
        return source && "getFeatures" in source
          ? source
              .getFeatures()
              .filter((feature) => String(feature.getId()).startsWith("posPath-"))
              .map((feature) => ({
                id: String(feature.getId()),
                color: feature.get("color"),
                coordinates: (feature.getGeometry() as LineString).getCoordinates(),
              }))
          : [];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  });
}

test.use({ scenario: "execution" });
test("position source color edits reach a live peer and persist after reload", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.posSources[0].pathColor = "#ff0000";
    rex.posSources.push({ uuid: rover, name: "Rover", abbr: "R", pathColor: "#00ff00" });
    rex.posEntries = points.map((location, index) =>
      seedPosEntry({
        uuid: `94000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        location,
        posTypeUuids: [mission.ids.posType],
        posSourceUuid: index < 2 ? mission.ids.posSource : rover,
        createdAt: 1000 + index,
        petSeconds: index * 60,
      })
    );
  });
  const before = await mission.read();
  await mission.open(page);
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  for (const label of ["Sources", "Paths"])
    await menu
      .locator('[class*="toggleMenuItemRow"]')
      .filter({ hasText: label })
      .getByText("All", { exact: true })
      .click();
  await menu.getByText("Separate", { exact: true }).click();
  await menu.locator('svg[data-icon="xmark"]').click();
  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await selectExecution(peer, "Survey Bravo", mission.ids.rexEvaB);
  await enablePlanningEditMode(page);
  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  const source = page
    .locator('div[aria-label="Position Source Name"]')
    .filter({ hasText: "Rover" })
    .locator("xpath=ancestor::li");
  await source.locator('[class*="propertyPathColor"]').click();
  await page.locator('[popover]:popover-open [title="#F44E3B"]').click();
  await page.keyboard.press("Escape");
  await expect
    .poll(
      async () =>
        (await paths(peer)).find((path) => path.id === `posPath-${rover}-${mission.ids.posType}`)
          ?.color
    )
    .toBe("#f44e3b");
  await expect
    .poll(
      async () =>
        (await mission.read()).rexes[mission.ids.rexB].posSources.find(
          (source) => source.uuid === rover
        )?.pathColor
    )
    .toBe("#f44e3b");
  const saved = await mission.read();
  expect(saved.rexes[mission.ids.rexB].posTypes).toEqual(before.rexes[mission.ids.rexB].posTypes);
  expect(saved.rexes[mission.ids.rexB].posEntries).toEqual(
    before.rexes[mission.ids.rexB].posEntries
  );
  await page.reload();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect
    .poll(
      async () =>
        (await paths(page)).find((path) => path.id === `posPath-${rover}-${mission.ids.posType}`)
          ?.color
    )
    .toBe("#f44e3b");
  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  await expect(page.getByTestId("positions-menu")).toHaveCount(0);
  await expect.poll(() => paths(page)).toEqual([]);
  expect(await mission.read()).toEqual(saved);
});
