import { test, expect } from "../fixtures/behavioralTest";
import type { Page } from "@playwright/test";
import { mapFeaturePixel, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";
import { selectExecution } from "./executionHelpers";

async function mapCursor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    return map?.getTargetElement()?.style.cursor ?? "";
  });
}

function projectedPoint(point: { lat: number; lng: number }): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

async function clickProjectedPoint(page: Page, point: { lat: number; lng: number }): Promise<void> {
  const pixel = await page.evaluate((coordinate) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) throw new Error("Editor map is not available");
    return map.getPixelFromCoordinate(coordinate);
  }, projectedPoint(point));
  const bounds = await page.locator('[data-map-mode="editor"] .ol-viewport').boundingBox();
  if (!bounds || !pixel) throw new Error("Editor map pixel is not available");
  await page.mouse.click(bounds.x + pixel[0], bounds.y + pixel[1]);
}

type DirectiveTarget = "poi" | "station" | "action" | "walkback" | "traverse" | "position";
type DirectiveExit = "Escape" | "Edit off" | "navigation";

async function startDirective(page: Page, mission: BehavioralMission, target: DirectiveTarget) {
  if (target === "walkback") {
    await mission.change((doc) => {
      const path = doc.stations[mission.ids.stationA].walkbackPath;
      const lander = doc.landerLocation;
      if (path.at(0)?.lat === lander.lat && path.at(0)?.lng === lander.lng) {
        doc.stations[mission.ids.stationA].walkbackPath = [
          { ...doc.stations[mission.ids.stationA].location },
          ...path
            .slice(1, -1)
            .reverse()
            .map((point) => ({ ...point })),
          { lat: lander.lat, lng: lander.lng },
        ];
      }
    });
  }
  await mission.open(page);
  await enablePlanningEditMode(page);

  switch (target) {
    case "poi":
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabel("info_panel", { exact: true }).click();
      await page.getByLabel("Edit on Map", { exact: true }).click();
      break;
    case "station":
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabel("info_panel", { exact: true }).click();
      await page.getByLabel("Edit on Map", { exact: true }).click();
      break;
    case "action": {
      await selectPlanningStationActions(page, "Alpha station");
      const row = page.getByRole("listitem").filter({
        has: page.locator('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
      });
      if (!(await row.getByText("Location", { exact: true }).isVisible())) {
        await row.locator('svg[data-icon="caret-right"]').click();
      }
      await row.getByLabel("Edit on Map", { exact: true }).click();
      break;
    }
    case "walkback":
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabel("info_panel", { exact: true }).click();
      await page.getByLabel("Edit Path on Map", { exact: true }).click();
      break;
    case "traverse":
      await selectPlanningEva(page, "Survey Alpha");
      await planningEvaRow(page, "Survey Alpha")
        .getByText("Alpha to Bravo", { exact: true })
        .click();
      await page.getByLabel("Edit Path on Map", { exact: true }).click();
      break;
    case "position": {
      await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
      const menu = page.getByTestId("rex-map-menu");
      await menu.getByText("All Positions", { exact: true }).click();
      const row = menu.locator("table").last().getByRole("row").filter({ hasText: "00:02:00" });
      await row.locator('svg[data-icon="ellipsis-vertical"]').click();
      await page.locator("dialog[open]").getByText("Edit", { exact: true }).click();
      await menu.getByLabel("Edit Pos.", { exact: true }).click();
      break;
    }
  }
  await expect.poll(() => mapCursor(page)).toBe("crosshair");
}

async function directiveSnapshot(mission: BehavioralMission, target: DirectiveTarget) {
  const doc = await mission.read();
  switch (target) {
    case "poi":
      return doc.pois[mission.ids.poiA].location;
    case "station":
    case "walkback":
      return target === "station"
        ? doc.stations[mission.ids.stationA].location
        : doc.stations[mission.ids.stationA].walkbackPath;
    case "action":
      return doc.actions[mission.ids.actionA].location;
    case "traverse":
      return doc.traverses[mission.ids.traverseA].path;
    case "position":
      return doc.rexes[mission.ids.rexB].posEntries[0];
  }
}

async function navigateAway(page: Page, target: DirectiveTarget) {
  if (target === "station" || target === "walkback") {
    await selectPlanningStation(page, "Bravo station");
  } else if (target === "action") {
    await selectPlanningPoi(page, "Reference POI");
  } else {
    await selectPlanningStation(page, "Alpha station");
  }
}

async function exitDirective(
  page: Page,
  target: DirectiveTarget,
  exit: DirectiveExit
): Promise<void> {
  if (exit === "Escape") {
    await page.keyboard.press("Escape");
  } else if (exit === "Edit off") {
    await page.getByLabel("globalEditToggle", { exact: true }).click();
  } else {
    await navigateAway(page, target);
  }
  await expect.poll(() => mapCursor(page)).toBe("");
}

test("Escape dismisses a field dialog before cancelling the POI marker edit and preserving its point", async ({
  page,
  mission,
}) => {
  const before = (await mission.read()).pois[mission.ids.poiA];
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabel("info_panel", { exact: true }).click();
  await page.getByLabel("Edit on Map", { exact: true }).click();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");

  const fieldDialog = await openPlanningField(page, "POI");
  await page.keyboard.press("Escape");
  await expect(fieldDialog).toHaveCount(0);
  await expect.poll(() => mapCursor(page)).toBe("crosshair");

  await page.keyboard.press("Escape");

  await expect.poll(() => mapCursor(page)).toBe("");
  await expect(page.getByLabel("Cancel", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Edit on Map", { exact: true })).toBeVisible();
  expect((await mission.read()).pois[mission.ids.poiA]).toEqual(before);
  await page.getByLabel("station Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");
});

test("turning Edit off exits a pending POI placement without creating a coordinate", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.pois[mission.ids.poiA].location = null;
    doc.pois[mission.ids.poiA].elevation = null;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabel("info_panel", { exact: true }).click();
  await page.getByLabel("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");
  const before = (await mission.read()).pois[mission.ids.poiA];

  await page.getByLabel("globalEditToggle", { exact: true }).click();

  await expect.poll(() => mapCursor(page)).toBe("");
  await expect(page.getByLabel("Cancel", { exact: true })).toHaveCount(0);
  expect((await mission.read()).pois[mission.ids.poiA]).toEqual(before);
  await page.getByLabel("station Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");
});

test("station location can be cancelled, cleared, and recreated from a known map pixel", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  const originalStation = before.stations[mission.ids.stationA];
  expect(originalStation.location).not.toBeNull();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(page.getByLabel("Clear Location", { exact: true })).toBeVisible();

  const originalPixelCoordinates = projectedPoint(originalStation.location!);
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.stationA)
    )
    .toMatchObject({
      geometryType: "Point",
      coordinates: originalPixelCoordinates.map((coordinate) => expect.closeTo(coordinate, 4)),
    });

  await page.getByLabel("Edit on Map", { exact: true }).click();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");
  await page.getByLabel("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA]).toEqual(originalStation);

  await page.getByLabel("Clear Location", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
    .toBeNull();
  const clearedDoc = await mission.read();
  const cleared = clearedDoc.stations[mission.ids.stationA];
  expect(cleared.elevation).toBeNull();
  expect(cleared.walkbackPath).toBeNull();
  expect(cleared.walkbackPathSegmentDistances).toBeNull();
  expect(cleared.walkbackPathSegmentElevations).toBeNull();
  expect(clearedDoc.traverses[mission.ids.traverseA].path).toEqual(
    before.traverses[mission.ids.traverseA].path
  );
  await expect(page.getByLabel("Clear Location", { exact: true })).toHaveCount(0);
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.stationA)
    )
    .toBeUndefined();
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).find(
        (feature) => feature.id === `walkback-${mission.ids.stationA}`
      )
    )
    .toBeUndefined();

  await page.reload();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].location).toBeNull();
  await page.getByLabel("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");
  await page.getByLabel("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].location).toBeNull();

  const target = {
    lat: originalStation.location!.lat + 0.0002,
    lng: originalStation.location!.lng + 0.0002,
  };
  await page.getByLabel("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");
  await clickProjectedPoint(page, target);
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
    .toEqual({ lat: expect.closeTo(target.lat, 7), lng: expect.closeTo(target.lng, 7) });
  const recreated = (await mission.read()).stations[mission.ids.stationA];
  expect(recreated.walkbackPath?.[0]).toEqual(recreated.location);
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.stationA)
    )
    .toMatchObject({
      geometryType: "Point",
      coordinates: projectedPoint(target).map((coordinate) => expect.closeTo(coordinate, 4)),
    });
  await page.reload();
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA]).toEqual(recreated);
});

test("Escape restores a dragged traverse and removes the modify interaction", async ({
  page,
  mission,
}) => {
  const original = (await mission.read()).traverses[mission.ids.traverseA].path;
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningEva(page, "Survey Alpha");
  await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
  await page.getByLabel("Edit Path on Map", { exact: true }).click();
  await expect(page.getByLabel("Cancel", { exact: true })).toBeVisible();
  await expect.poll(() => mapCursor(page)).toBe("crosshair");

  const vertex = await mapFeaturePixel(page, mission.ids.traverseA, "editor", 1);
  await page.mouse.move(vertex.x, vertex.y);
  await page.mouse.down();
  await page.mouse.move(vertex.x + 45, vertex.y - 35, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .not.toEqual(original);
  await page.keyboard.press("Escape");

  await expect.poll(() => mapCursor(page)).toBe("");
  await expect(page.getByLabel("Cancel", { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .toEqual(original);
  await expect
    .poll(
      async () =>
        (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.traverseA)
          ?.coordinates
    )
    .toHaveLength(original.length);
  await selectPlanningPoi(page, "Reference POI");
  await expect(page.locator('div[aria-label="POI"]')).toHaveText("Reference POI");
});

const planningDirectiveTargets = ["poi", "station", "action", "walkback", "traverse"] as const;
const directiveExits = ["Escape", "Edit off", "navigation"] as const;

for (const target of planningDirectiveTargets) {
  for (const exit of directiveExits) {
    test(`${target} edit exits cleanly through ${exit} without changing its saved geometry`, async ({
      page,
      mission,
    }) => {
      await startDirective(page, mission, target);
      const before = await directiveSnapshot(mission, target);
      await exitDirective(page, target, exit);
      expect(await directiveSnapshot(mission, target)).toEqual(before);
      await expect(page.getByLabel("Cancel", { exact: true })).toHaveCount(0);
      await selectPlanningStation(page, "Bravo station");
      await expect(page.locator('div[aria-label="Station"]')).toHaveText("Bravo station");
    });
  }
}

test.describe("execution position map directives", () => {
  test.use({ scenario: "execution" });

  test("Escape cancels an existing position edit without saving a map move", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    const menu = page.getByTestId("rex-map-menu");
    await menu.getByText("All Positions", { exact: true }).click();
    const row = menu.locator("table").last().getByRole("row").filter({ hasText: "00:02:00" });
    await row.locator('svg[data-icon="ellipsis-vertical"]').click();
    await page.locator("dialog[open]").getByText("Edit", { exact: true }).click();
    await menu.getByLabel("Edit Pos.", { exact: true }).click();
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
    await expect.poll(() => mapCursor(page)).toBe("crosshair");
    const before = await mission.read();

    await page.keyboard.press("Escape");

    await expect.poll(() => mapCursor(page)).toBe("");
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
    expect(await mission.read()).toEqual(before);
    await expect
      .poll(
        async () =>
          (await readMapFeatures(page)).find((feature) => feature.id === mission.ids.posB)
            ?.geometryType
      )
      .toBe("Point");
  });

  for (const exit of directiveExits) {
    test(`position edit exits cleanly through ${exit} without changing its saved position`, async ({
      page,
      mission,
    }) => {
      await startDirective(page, mission, "position");
      const before = await directiveSnapshot(mission, "position");
      await exitDirective(page, "position", exit);
      expect(await directiveSnapshot(mission, "position")).toEqual(before);
      await page.getByLabel("station Section", { exact: true }).click();
      await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");
    });
  }
});
