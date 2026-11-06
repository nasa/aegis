import store from "store";
import { commands } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import LineString from "ol/geom/LineString.js";
import proj4 from "proj4";
import { test, expect } from "./missionHarness";
import {
  openPlanningSection,
  planningEvaRow,
  savePlanningField,
  selectPlanningEva,
} from "./planningHelpers";

async function sequenceRow(page: Page, evaName: string, itemIndex: number) {
  return planningEvaRow(page, evaName)
    .getBySelector('[class*="evaSequence"] > [class*="evaItem"]')
    .nth(itemIndex);
}

async function expandEvaSequence(page: Page, evaName: string): Promise<void> {
  const row = planningEvaRow(page, evaName);
  const collapsed = row.getBySelector('svg[data-icon="caret-right"]');
  if (await collapsed.length) await collapsed.click();
  await expect
    .element(row.getBySelector('[class*="evaSequence"] > [class*="evaItem"]').first())
    .toBeVisible();
}

async function hoverTimelineAt(page: Page, evaDurationMinutes: number, elapsedSeconds: number) {
  const canvas = page.getBySelector('[class*="canvasContainer"] canvas');
  await expect.element(canvas).toBeVisible();
  const bounds = await canvas.element().getBoundingClientRect();
  expect(bounds).not.toBeNull();
  const timelineWidth = bounds!.width - 150;
  const x = bounds!.x + 75 + (elapsedSeconds * timelineWidth) / (evaDurationMinutes * 60);
  const y = bounds!.y + 12;
  await commands.mapPointer("move", x - 2, y);
  await new Promise((resolve) => setTimeout(resolve, 35));
  await commands.mapPointer("move", x, y);
  return { x, y };
}

const LANDER = { lat: 0, lng: 0 };
const ALPHA = { lat: 0.001, lng: 0.001 };
const BRAVO = { lat: 0.001, lng: 0.003 };
const MIDDLE = { lat: 0.0015, lng: 0.002 };

function mapCoordinate(point: AEGISPoint): number[] {
  return proj4("EPSG:4326", "EPSG:3857", [point.lng, point.lat]);
}

function mapPathCoordinate(points: AEGISPoint[], fraction: number): number[] {
  return new LineString(points.map(mapCoordinate)).getCoordinateAt(fraction);
}

async function astronautPosition(): Promise<number[] | null> {
  const map = window.__aegisMaps?.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  const astronaut = map
    ?.getOverlays()
    .getArray()
    .find((overlay) => overlay.getElement()?.dataset.timelineMarker === "astronaut");
  return astronaut?.getPosition() ?? null;
}

async function expectAstronautAt(page: Page, expected: number[]): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await astronautPosition();
      return (
        actual != null &&
        Math.abs(actual[0] - expected[0]) < 1 &&
        Math.abs(actual[1] - expected[1]) < 1
      );
    })
    .toBe(true);
}

async function expectDateSourceNear(
  page: Page,
  evaName: string,
  expectedElapsedSeconds: number
): Promise<number> {
  const read = () => ({
    time: store.getState().hover.timelineTime,
    selected: store.getState().eva.selectedEvaUuid,
  });
  await expect
    .poll(
      async () => {
        const { time, selected } = await read();
        return (
          time?.evaUuid === selected && Math.abs(time.elapsedSeconds - expectedElapsedSeconds) <= 30
        );
      },
      { message: `Timeline hover follows ${evaName}` }
    )
    .toBe(true);
  const elapsedSeconds = (await read()).time.elapsedSeconds;
  return elapsedSeconds;
}

async function openPresetSection(page: Page): Promise<void> {
  await page.getByLabelText("preset Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }))
    .toHaveTextContent("Presets");
}

async function enableSunEarthOverlay(page: Page): Promise<void> {
  const source = page.getByRole("group", { name: "Sun/Earth value source", exact: true });
  if (await source.length) return;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await expect.element(menu).toBeVisible();
  await menu.getByText("Sun/Earth Directions", { exact: true }).click();
  await menu.getBySelector('svg[data-icon="xmark"]').click();
  await expect.element(source).toBeVisible();
}

test("timeline selection and scrubbing preview the selected EVA and refresh after duration edits", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.evas[mission.ids.evaA].datetime = Date.parse("2026-01-15T00:00:00.000Z");
    doc.evas[mission.ids.evaB].datetime = Date.parse("2026-07-15T00:00:00.000Z");
    doc.traverses[mission.ids.traverseOutbound].duration = 5;
    doc.traverses[mission.ids.traverseA].duration = 5;
    doc.traverses[mission.ids.traverseReturn].duration = 5;
    doc.traverses[mission.ids.traverseB].duration = 8;
    doc.traverses[mission.ids.traverseBReturn].duration = 5;
    doc.planetRadius = 1737400;
    doc.evas[mission.ids.evaA].sunEarthFromDate = true;
    doc.evas[mission.ids.evaB].sunEarthFromDate = true;
  });
  const beforePreview = await mission.read();

  await mission.open();
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Alpha");
  await expandEvaSequence(page, "Survey Alpha");

  await openPresetSection(page);
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("info_panel", { exact: true }).click();
  await enableSunEarthOverlay(page);
  await expect
    .poll(() =>
      page
        .getByRole("group", { name: "Sun/Earth value source", exact: true })
        .element()
        .getAttribute("aria-description")
    )
    .toMatch(/Calculated at EVA start/);

  // Survey Alpha's selected station begins at 15 minutes and lasts 15 minutes.
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaA].duration, 22.5 * 60);
  await expectDateSourceNear(page, "Survey Alpha", 22.5 * 60);
  await expectAstronautAt(page, mapCoordinate(ALPHA));

  // The first traverse begins at 30 minutes; its midpoint is the known middle vertex.
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaA].duration, 32.5 * 60);
  const alphaTraverseElapsed = await expectDateSourceNear(page, "Survey Alpha", 32.5 * 60);
  await expectAstronautAt(
    page,
    mapPathCoordinate([ALPHA, MIDDLE, BRAVO], (alphaTraverseElapsed - 30 * 60) / (5 * 60))
  );
  await openPlanningSection(page, "evas");
  await (await sequenceRow(page, "Survey Alpha", 3)).click();
  await expect.element(page.getByText("Traverse Information", { exact: true })).toBeVisible();
  await expect.element(page.getBySelector('input[name="duration"]')).toHaveValue("5");

  // Selecting Survey Bravo changes both the timeline's identity and the map's EVA date.
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Bravo");
  await openPresetSection(page);
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("info_panel", { exact: true }).click();
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaB].duration, 12.5 * 60);
  const bravoTraverseElapsed = await expectDateSourceNear(page, "Survey Bravo", 12.5 * 60);
  await expectAstronautAt(
    page,
    mapPathCoordinate([LANDER, BRAVO], (bravoTraverseElapsed - 10 * 60) / (8 * 60))
  );
  await openPlanningSection(page, "evas");
  await (await sequenceRow(page, "Survey Bravo", 1)).click();
  await expect.element(page.getByText("Traverse Information", { exact: true })).toBeVisible();
  await expect.element(page.getBySelector('input[name="duration"]')).toHaveValue("8");

  // Selection and hover preview are view state only.
  expect(await mission.read()).toEqual(beforePreview);

  // A real station-duration edit moves the later traverse's timeline/map position.
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Alpha");
  await expandEvaSequence(page, "Survey Alpha");
  await (
    await sequenceRow(page, "Survey Alpha", 2)
  )
    .getByText("Alpha station", { exact: true })
    .click();
  await expect.element(page.getByText("Station Information", { exact: true })).toBeVisible();
  await page.getByLabelText("globalEditToggle", { exact: true }).click();
  await savePlanningField(page, "Time in minutes", "25");
  await expect
    .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
    .toBe(25);
  const afterDurationEdit = await mission.read();
  expect({
    ...afterDurationEdit.stations[mission.ids.stationA],
    updatedAt: beforePreview.stations[mission.ids.stationA].updatedAt,
  }).toEqual({
    ...beforePreview.stations[mission.ids.stationA],
    duration: 25,
  });
  expect(afterDurationEdit.stations[mission.ids.stationB]).toEqual(
    beforePreview.stations[mission.ids.stationB]
  );
  expect(afterDurationEdit.traverses).toEqual(beforePreview.traverses);
  expect(afterDurationEdit.actions).toEqual(beforePreview.actions);
  expect(afterDurationEdit.evas).toEqual(beforePreview.evas);

  await openPresetSection(page);
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("info_panel", { exact: true }).click();
  // The old traversal midpoint is now within Alpha's longer station interval.
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaA].duration, 32.5 * 60);
  await expectDateSourceNear(page, "Survey Alpha", 32.5 * 60);
  await expectAstronautAt(page, mapCoordinate(ALPHA));
  // Its refreshed midpoint moved ten minutes later, after the edited station interval.
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaA].duration, 42.5 * 60);
  const editedTraverseElapsed = await expectDateSourceNear(page, "Survey Alpha", 42.5 * 60);
  await expectAstronautAt(
    page,
    mapPathCoordinate([ALPHA, MIDDLE, BRAVO], (editedTraverseElapsed - 40 * 60) / (5 * 60))
  );
});
