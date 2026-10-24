import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";
import { selectExecution } from "./executionHelpers";

const SECOND_TYPE = "30000000-0000-4000-8000-000000000031";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000000032";
const OLDER_A = "30000000-0000-4000-8000-000000000033";
const NEWER_A = "30000000-0000-4000-8000-000000000034";
const ROVER_B = "30000000-0000-4000-8000-000000000035";

test.use({ scenario: "execution" });

async function openPositions(page: Page, mission: BehavioralMission): Promise<Locator> {
  await mission.open(page);
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const menu = page.getByTestId("rex-map-menu");
  await expect(menu).toContainText("Survey Bravo - Active Bravo");
  await menu.getByText("All Positions", { exact: true }).click();
  await expect(menu.locator("table")).toHaveCount(2);
  const handle = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2 + 180, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  await visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" })
    .getByText("All", { exact: true })
    .click();
  await visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Labels" })
    .getByText("All", { exact: true })
    .click();
  await visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Paths" })
    .getByText("All", { exact: true })
    .click();
  await visibility.locator('svg[data-icon="xmark"]').click();
  return menu;
}

async function setSourceFilter(page: Page, sourceName: string | "All"): Promise<void> {
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  const row = visibility.locator('[class*="toggleMenuItemRow"]').filter({ hasText: "Sources" });
  await row.getByText("All", { exact: true }).click();
  if (sourceName !== "All") {
    const source = row.locator(`[data-tooltip-content="${sourceName}"]`);
    await source.click();
    await expect(source).toHaveClass(/toggleSelected/);
  }
  await visibility.locator('svg[data-icon="xmark"]').click();
}

async function visiblePositionIds(page: Page, uuids: string[]): Promise<string[]> {
  return (await readMapFeatures(page))
    .filter(
      (feature) => uuids.includes(feature.id) && feature.geometryType === "Point" && feature.visible
    )
    .map((feature) => feature.id)
    .sort();
}

async function labelFor(page: Page, uuid: string): Promise<string | undefined> {
  return (await readMapFeatures(page)).find(
    (feature) => feature.id === `pos-${uuid}` && feature.labelType === "pos" && feature.visible
  )?.name;
}

function projected(point: AEGISPoint): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

test("historical source filters use that REX's own PET and do not leak into active or planned scope", async ({
  page,
  mission,
}) => {
  const older = seedPosEntry({
    uuid: OLDER_A,
    location: { lat: 0.0004, lng: 0.0012 },
    petSeconds: 6_805,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) - 120_000,
  });
  const newer = seedPosEntry({
    uuid: NEWER_A,
    location: { lat: 0.0008, lng: 0.0017 },
    petSeconds: 7_805,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
  });
  const roverB = seedPosEntry({
    uuid: ROVER_B,
    location: { lat: 0.0014, lng: 0.0022 },
    petSeconds: 240,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) + 60_000,
  });
  await mission.change((doc) => {
    for (const rexUuid of [mission.ids.rexA, mission.ids.rexB]) {
      doc.rexes[rexUuid].posTypes.push({
        uuid: SECOND_TYPE,
        name: "EV2",
        abbr: "2",
        icon: "1f469-200d-1f680",
        pathColor: "#0000ff",
      });
      doc.rexes[rexUuid].posSources.push({ uuid: SECOND_SOURCE, name: "Rover", abbr: "R" });
    }
    doc.rexes[mission.ids.rexA].posEntries.push(older, newer);
    doc.rexes[mission.ids.rexB].posEntries.push(roverB);
  });
  const persisted = await mission.read();
  const menu = await openPositions(page, mission);
  await expect
    .poll(() => visiblePositionIds(page, [mission.ids.posB, ROVER_B]))
    .toEqual([mission.ids.posB, ROVER_B].sort());
  await expect.poll(() => labelFor(page, ROVER_B)).toBe("+00:01:00 / 2 (R)");

  await setSourceFilter(page, "All");
  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await expect(menu).toContainText("Survey Alpha - Stopped Alpha");
  await expect
    .poll(() => visiblePositionIds(page, [mission.ids.posA, OLDER_A, NEWER_A, ROVER_B]))
    .toEqual([mission.ids.posA, OLDER_A, NEWER_A].sort());
  await expect.poll(() => labelFor(page, mission.ids.posA)).toBe("+00:15:00 / 1 (C)");
  await expect.poll(() => labelFor(page, OLDER_A)).toBe("+00:16:40 / 2 (R)");
  await expect.poll(() => labelFor(page, NEWER_A)).toBe("+00:00:00 / 2 (R)");
  const historicalPath = async () =>
    (await readMapFeatures(page))
      .filter((feature) => feature.id === `posPath-${SECOND_TYPE}` && feature.visible)
      .map((feature) => feature.coordinates);
  await expect
    .poll(historicalPath)
    .toEqual([
      [older.location, newer.location].map((point) =>
        projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
      ),
    ]);

  await setSourceFilter(page, "Crew");
  await expect
    .poll(() => visiblePositionIds(page, [mission.ids.posA, OLDER_A, NEWER_A]))
    .toEqual([mission.ids.posA]);
  await expect.poll(() => labelFor(page, mission.ids.posA)).toBe("+00:15:00 / 1 (C)");
  await expect.poll(() => labelFor(page, OLDER_A)).toBeUndefined();
  await expect.poll(historicalPath).toEqual([]);
  await setSourceFilter(page, "Rover");
  await expect
    .poll(() => visiblePositionIds(page, [mission.ids.posA, OLDER_A, NEWER_A]))
    .toEqual([OLDER_A, NEWER_A].sort());
  await expect.poll(() => labelFor(page, OLDER_A)).toBe("+00:16:40 / 2 (R)");
  await expect.poll(() => labelFor(page, NEWER_A)).toBe("+00:00:00 / 2 (R)");
  await expect
    .poll(historicalPath)
    .toEqual([
      [older.location, newer.location].map((point) =>
        projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
      ),
    ]);

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect(menu).toContainText("Survey Bravo - Active Bravo");
  await expect
    .poll(() => visiblePositionIds(page, [mission.ids.posA, OLDER_A, NEWER_A, ROVER_B]))
    .toEqual([ROVER_B]);
  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  await expect(page.locator('div[aria-label="EVA Title"]')).toHaveText("Survey Alpha");
  await expect
    .poll(async () =>
      (await readMapFeatures(page)).filter(
        (feature) =>
          [mission.ids.posA, mission.ids.posB, OLDER_A, NEWER_A, ROVER_B].includes(feature.id) ||
          feature.id.startsWith("posPath-")
      )
    )
    .toEqual([]);
  expect((await mission.read()).rexes).toEqual(persisted.rexes);
});
