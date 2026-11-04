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

function projected(point: AEGISPoint) {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ].map((value) => expect.closeTo(value, 5));
}

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
test("position tabs minimize and restore, separate paths keep source colors and filters, and preferences survive reload", async ({
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
  await expect(page.getByTestId("positions-menu")).toBeVisible();
  await page.locator(".dv-tab").filter({ hasText: "Assets" }).click();
  await expect(page.getByTestId("assets-map-menu")).toHaveText("Asset Management Coming Soon");
  await page.getByRole("button", { name: "Minimize Rex Menu", exact: true }).click();
  await expect(page.getByTestId("assets-map-menu")).toBeHidden();
  await page.getByTestId("rex-menu-launcher").locator('[data-tooltip-content="Rex Menu"]').click();
  await expect(page.getByTestId("assets-map-menu")).toBeVisible();
  await page.locator(".dv-tab").filter({ hasText: "Positions" }).click();
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  const initialBounds = await menu.boundingBox();
  // The fixed visibility window has no floating resize handles.
  await expect(menu.locator(".dv-resize-handle")).toHaveCount(0);
  await menu
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" })
    .getByText("All", { exact: true })
    .click();
  await menu
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Paths" })
    .getByText("All", { exact: true })
    .click();
  await menu.getByText("Separate", { exact: true }).click();
  await expect
    .poll(async () => paths(page))
    .toEqual(
      [
        {
          id: `posPath-${mission.ids.posSource}-${mission.ids.posType}`,
          color: "#ff0000",
          coordinates: points.slice(0, 2).map(projected),
        },
        {
          id: `posPath-${rover}-${mission.ids.posType}`,
          color: "#00ff00",
          coordinates: points.slice(2).map(projected),
        },
      ].sort((a, b) => a.id.localeCompare(b.id))
    );
  const sourceRow = menu.locator('[class*="toggleMenuItemRow"]').filter({ hasText: "Sources" });
  await sourceRow.locator('[data-tooltip-content="Rover"]').click();
  await expect
    .poll(async () => (await paths(page)).map((path) => path.id))
    .toEqual([`posPath-${rover}-${mission.ids.posType}`]);
  await sourceRow.getByText("All", { exact: true }).click();
  await menu.getByText("Merged", { exact: true }).click();
  await expect
    .poll(async () => paths(page))
    .toEqual([
      {
        id: `posPath-${mission.ids.posType}`,
        color: "#ff0000",
        coordinates: points.map(projected),
      },
    ]);
  await menu.getByText("Separate", { exact: true }).click();
  expect(await menu.boundingBox()).toEqual(initialBounds);
  await menu.locator('svg[data-icon="xmark"]').click();
  await page.reload();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect
    .poll(async () => (await paths(page)).map((path) => path.color).sort())
    .toEqual(["#00ff00", "#ff0000"]);
  expect(await mission.read()).toEqual(before);

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
  await page.locator('[class*="colorPickerMenu"] [title="#F44E3B"]').click();
  await page.locator('[class*="colorPickerCover"]').click();
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
