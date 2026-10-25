import type { Page } from "@playwright/test";
import LineString from "ol/geom/LineString.js";
import proj4 from "proj4";
import { test, expect } from "../fixtures/behavioralTest";
import {
  openPlanningSection,
  planningEvaRow,
  savePlanningField,
  selectPlanningEva,
} from "./planningHelpers";

async function sequenceRow(page: Page, evaName: string, itemIndex: number) {
  return planningEvaRow(page, evaName)
    .locator('[class*="evaSequence"] > [class*="evaItem"]')
    .nth(itemIndex);
}

async function expandEvaSequence(page: Page, evaName: string): Promise<void> {
  const row = planningEvaRow(page, evaName);
  const collapsed = row.locator('svg[data-icon="caret-right"]');
  if (await collapsed.count()) await collapsed.click();
  await expect(row.locator('[class*="evaSequence"] > [class*="evaItem"]').first()).toBeVisible();
}

async function hoverTimelineAt(page: Page, evaDurationMinutes: number, elapsedSeconds: number) {
  const canvas = page.locator('[class*="canvasContainer"] canvas');
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const timelineWidth = bounds!.width - 150;
  const x = bounds!.x + 75 + (elapsedSeconds * timelineWidth) / (evaDurationMinutes * 60);
  const y = bounds!.y + 12;
  await page.mouse.move(x - 2, y);
  await page.waitForTimeout(35);
  await page.mouse.move(x, y);
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

async function astronautPosition(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const map = window.__aegisMaps?.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const astronaut = map
      ?.getOverlays()
      .getArray()
      .find((overlay) => overlay.getElement()?.textContent?.includes("🧑‍🚀"));
    return astronaut?.getPosition() ?? null;
  });
}

async function expectAstronautAt(page: Page, expected: number[]): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await astronautPosition(page);
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
  const source = page.getByLabel("sunEarthDateSource", { exact: true });
  await expect(source).toContainText(`Timeline hover: ${evaName} (+`);
  const text = await source.innerText();
  const match = text.match(/\+(\d+) s/);
  expect(match, `Timeline time is shown for ${evaName}: ${text}`).not.toBeNull();
  const elapsedSeconds = Number(match![1]);
  expect(Math.abs(elapsedSeconds - expectedElapsedSeconds)).toBeLessThanOrEqual(30);
  return elapsedSeconds;
}

async function openPresetSection(page: Page): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Presets");
}

async function enableSunEarthOverlay(page: Page): Promise<void> {
  const source = page.getByRole("button", { name: "Sun/Earth value source", exact: true });
  if (await source.count()) return;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await expect(menu).toBeVisible();
  await menu.getByText("Sun/Earth Directions", { exact: true }).click();
  await menu.locator('svg[data-icon="xmark"]').click();
  await expect(source).toBeVisible();
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
    doc.presets[mission.ids.presetA].sunEnabled = true;
    doc.presets[mission.ids.presetA].earthEnabled = true;
    doc.presets[mission.ids.presetA].sunEarthFromDate = true;
  });
  const beforePreview = await mission.read();

  await mission.open(page);
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Alpha");
  await expandEvaSequence(page, "Survey Alpha");

  await openPresetSection(page);
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  await enableSunEarthOverlay(page);
  await expect(
    page.getByRole("button", { name: "Sun/Earth value source", exact: true })
  ).toHaveAttribute("data-status", "Calculated");
  await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
    "Selected EVA: Survey Alpha"
  );

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
  await expect(page.getByText("Traverse Information", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="duration"]')).toHaveValue("5");

  // Selecting Survey Bravo changes both the timeline's identity and the map's EVA date.
  await openPlanningSection(page, "evas");
  await selectPlanningEva(page, "Survey Bravo");
  await openPresetSection(page);
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  await hoverTimelineAt(page, beforePreview.evas[mission.ids.evaB].duration, 12.5 * 60);
  const bravoTraverseElapsed = await expectDateSourceNear(page, "Survey Bravo", 12.5 * 60);
  await expectAstronautAt(
    page,
    mapPathCoordinate([LANDER, BRAVO], (bravoTraverseElapsed - 10 * 60) / (8 * 60))
  );
  await openPlanningSection(page, "evas");
  await (await sequenceRow(page, "Survey Bravo", 1)).click();
  await expect(page.getByText("Traverse Information", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="duration"]')).toHaveValue("8");

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
  await expect(page.getByText("Station Information", { exact: true })).toBeVisible();
  await page.getByLabel("globalEditToggle", { exact: true }).click();
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
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
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
