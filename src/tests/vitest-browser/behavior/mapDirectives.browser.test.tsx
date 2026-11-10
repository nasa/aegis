import { commands, userEvent } from "vitest/browser";
import { exactText, isVisible } from "./browserAssertions";
import { test as base, expect } from "./missionHarness";
const test = base;
import type { BrowserPage as Page } from "vitest/browser";
import { readMapFeatures } from "./mapObserver";
import { mapFeaturePixel, minimizeRexMenu } from "./mapInteractions";
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

async function mapCursor(): Promise<string> {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  return map?.getTargetElement()?.style.cursor ?? "";
}

function projectedPoint(point: { lat: number; lng: number }): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

async function clickProjectedPoint(page: Page, point: { lat: number; lng: number }): Promise<void> {
  const pixel = await ((coordinate) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) throw new Error("Editor map is not available");
    return map.getPixelFromCoordinate(coordinate);
  })(projectedPoint(point));
  const bounds = await page
    .getBySelector('[data-map-mode="editor"] .ol-viewport')
    .element()
    .getBoundingClientRect();
  if (!bounds || !pixel) throw new Error("Editor map pixel is not available");
  await commands.mapPointer("click", bounds.x + pixel[0], bounds.y + pixel[1]);
}

async function startDirective(page: Page, mission: BrowserMission, target: MapDirectiveTestTarget) {
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
  await mission.open();
  await enablePlanningEditMode(page);

  switch (target) {
    case "poi":
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await page.getByLabelText("Edit on Map", { exact: true }).click();
      break;
    case "station":
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await page.getByLabelText("Edit on Map", { exact: true }).click();
      break;
    case "action": {
      await selectPlanningStationActions(page, "Alpha station");
      const row = page.getByRole("listitem").filter({
        has: page
          .getBySelector('div[aria-label="Action Name"]')
          .filter({ hasText: "Sample regolith" }),
      });
      if (!(await isVisible(row.getByText("Location", { exact: true })))) {
        await row.getBySelector('svg[data-icon="caret-right"]').click();
      }
      await row.getByLabelText("Edit on Map", { exact: true }).click();
      break;
    }
    case "walkback":
      await selectPlanningStation(page, "Alpha station");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await page.getByLabelText("Edit Path on Map", { exact: true }).click();
      break;
    case "traverse":
      await selectPlanningEva(page, "Survey Alpha");
      await planningEvaRow(page, "Survey Alpha")
        .getByText("Alpha to Bravo", { exact: true })
        .click();
      await page.getByLabelText("Edit Path on Map", { exact: true }).click();
      break;
    case "position": {
      await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
      const menu = page.getByTestId("positions-menu");
      await menu.getByText("All Positions", { exact: true }).click();
      const row = menu
        .getBySelector("table")
        .last()
        .getByRole("row")
        .filter({ hasText: "00:02:00" });
      await row.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page.getBySelector("dialog[open]").getByText("Edit", { exact: true }).click();
      await menu.getByLabelText("Edit Pos.", { exact: true }).click();
      break;
    }
  }
  await expect.poll(() => mapCursor()).toBe("crosshair");
}

async function directiveSnapshot(mission: BrowserMission, target: MapDirectiveTestTarget) {
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

async function navigateAway(page: Page, target: MapDirectiveTestTarget) {
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
  target: MapDirectiveTestTarget,
  exit: MapDirectiveTestExit
): Promise<void> {
  if (exit === "Escape") {
    await userEvent.keyboard("{Escape}");
  } else if (exit === "Edit off") {
    await page.getByLabelText("globalEditToggle", { exact: true }).click();
  } else {
    await navigateAway(page, target);
  }
  await expect.poll(() => mapCursor()).toBe("");
}

test("Escape dismisses a field dialog before cancelling the POI marker edit and preserving its point", async ({
  page,
  mission,
}) => {
  const before = (await mission.read()).pois[mission.ids.poiA];
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await page.getByLabelText("Edit on Map", { exact: true }).click();
  await expect.poll(() => mapCursor()).toBe("crosshair");

  const fieldDialog = await openPlanningField(page, "POI");
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => fieldDialog.length).toBe(0);
  await expect.poll(() => mapCursor()).toBe("crosshair");

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => mapCursor()).toBe("");
  await expect.poll(() => page.getByLabelText("Cancel", { exact: true }).length).toBe(0);
  await expect.element(page.getByLabelText("Edit on Map", { exact: true })).toBeVisible();
  expect((await mission.read()).pois[mission.ids.poiA]).toEqual(before);
  await page.getByLabelText("station Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }))
    .toMatchTextContent("Stations");
});

test("turning Edit off exits a pending POI placement without creating a coordinate", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.pois[mission.ids.poiA].location = null;
    doc.pois[mission.ids.poiA].elevation = null;
  });
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await page.getByLabelText("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor()).toBe("crosshair");
  const before = (await mission.read()).pois[mission.ids.poiA];

  await page.getByLabelText("globalEditToggle", { exact: true }).click();

  await expect.poll(() => mapCursor()).toBe("");
  await expect.poll(() => page.getByLabelText("Cancel", { exact: true }).length).toBe(0);
  expect((await mission.read()).pois[mission.ids.poiA]).toEqual(before);
  await page.getByLabelText("station Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }))
    .toMatchTextContent("Stations");
});

test("station location can be cancelled, cleared, and recreated from a known map pixel", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  const originalStation = before.stations[mission.ids.stationA];
  expect(originalStation.location).not.toBeNull();
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(page.getByLabelText("Clear Location", { exact: true })).toBeVisible();

  const originalPixelCoordinates = projectedPoint(originalStation.location!);
  await expect
    .poll(async () =>
      (await readMapFeatures()).find((feature) => feature.id === mission.ids.stationA)
    )
    .toMatchObject({
      geometryType: "Point",
      coordinates: originalPixelCoordinates.map((coordinate) => expect.closeTo(coordinate, 4)),
    });

  await page.getByLabelText("Edit on Map", { exact: true }).click();
  await expect.poll(() => mapCursor()).toBe("crosshair");
  await page.getByLabelText("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA]).toEqual(originalStation);

  await page.getByLabelText("Clear Location", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
    .toBeNull();
  const clearedDoc = await mission.read();
  const cleared = clearedDoc.stations[mission.ids.stationA];
  expect(cleared.elevation).toBeNull();
  expect(cleared.walkbackPath).toBeNull();
  expect(cleared.walkbackPathSegmentDistances).toBeNull();
  expect(cleared).not.toHaveProperty("walkbackPathSegmentElevations");
  expect(clearedDoc.traverses[mission.ids.traverseA].path).toEqual(
    before.traverses[mission.ids.traverseA].path
  );
  await expect.poll(() => page.getByLabelText("Clear Location", { exact: true }).length).toBe(0);
  await expect
    .poll(async () =>
      (await readMapFeatures()).find((feature) => feature.id === mission.ids.stationA)
    )
    .toBeUndefined();
  await expect
    .poll(async () =>
      (await readMapFeatures()).find((feature) => feature.id === `walkback-${mission.ids.stationA}`)
    )
    .toBeUndefined();

  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].location).toBeNull();
  await page.getByLabelText("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor()).toBe("crosshair");
  await page.getByLabelText("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].location).toBeNull();

  const target = {
    lat: originalStation.location!.lat + 0.0002,
    lng: originalStation.location!.lng + 0.0002,
  };
  await page.getByLabelText("Create Location", { exact: true }).click();
  await expect.poll(() => mapCursor()).toBe("crosshair");
  await clickProjectedPoint(page, target);
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationA].location)
    .toEqual({ lat: expect.closeTo(target.lat, 7), lng: expect.closeTo(target.lng, 7) });
  const recreated = (await mission.read()).stations[mission.ids.stationA];
  expect(recreated.walkbackPath?.[0]).toEqual(recreated.location);
  await expect
    .poll(async () =>
      (await readMapFeatures()).find((feature) => feature.id === mission.ids.stationA)
    )
    .toMatchObject({
      geometryType: "Point",
      coordinates: projectedPoint(target).map((coordinate) => expect.closeTo(coordinate, 4)),
    });
  await mission.open();
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("info_panel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA]).toEqual(recreated);
});

test("Escape restores a dragged traverse and removes the modify interaction", async ({
  page,
  mission,
}) => {
  const original = (await mission.read()).traverses[mission.ids.traverseA].path;
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningEva(page, "Survey Alpha");
  await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
  await page.getByLabelText("Edit Path on Map", { exact: true }).click();
  await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
  await expect.poll(() => mapCursor()).toBe("crosshair");

  const vertex = await mapFeaturePixel(mission.ids.traverseA, "editor", 1);
  await minimizeRexMenu(page);
  await commands.mapPointer("move", vertex.x, vertex.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", vertex.x + 45, vertex.y - 35, 12);
  await commands.mapPointer("up");
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .not.toEqual(original);
  await userEvent.keyboard("{Escape}");

  await expect.poll(() => mapCursor()).toBe("");
  await expect.poll(() => page.getByLabelText("Cancel", { exact: true }).length).toBe(0);
  await expect
    .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
    .toEqual(original);
  await expect
    .poll(
      async () =>
        (await readMapFeatures()).find((feature) => feature.id === mission.ids.traverseA)
          ?.coordinates
    )
    .toHaveLength(original.length);
  await selectPlanningPoi(page, "Reference POI");
  await expect
    .element(page.getBySelector('div[aria-label="POI"]'))
    .toMatchTextContent(exactText("Reference POI"));
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
      await expect.poll(() => page.getByLabelText("Cancel", { exact: true }).length).toBe(0);
      await selectPlanningStation(page, "Bravo station");
      await expect
        .element(page.getBySelector('div[aria-label="Station"]'))
        .toMatchTextContent(exactText("Bravo station"));
    });
  }
}

test.describe("execution position map directives", () => {
  const test = base.extend({ scenario: "execution" as BehavioralScenario });

  test("Escape cancels an existing position edit without saving a map move", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    const menu = page.getByTestId("positions-menu");
    await menu.getByText("All Positions", { exact: true }).click();
    const row = menu.getBySelector("table").last().getByRole("row").filter({ hasText: "00:02:00" });
    await row.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
    await page.getBySelector("dialog[open]").getByText("Edit", { exact: true }).click();
    await menu.getByLabelText("Edit Pos.", { exact: true }).click();
    await expect.element(menu.getByLabelText("Cancel Pos.", { exact: true })).toBeVisible();
    await expect.poll(() => mapCursor()).toBe("crosshair");
    const before = await mission.read();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => mapCursor()).toBe("");
    await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
    expect(await mission.read()).toEqual(before);
    await expect
      .poll(
        async () =>
          (await readMapFeatures()).find((feature) => feature.id === mission.ids.posB)?.geometryType
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
      await page.getByLabelText("station Section", { exact: true }).click();
      await expect
        .element(page.getByLabelText("leftPanelTitle", { exact: true }))
        .toMatchTextContent("Stations");
    });
  }
});
