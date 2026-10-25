import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import type VectorLayer from "ol/layer/Vector";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

const SECOND_TYPE = "30000000-0000-4000-8000-000000009101";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000009102";
const ACTIVE_OLDER = "30000000-0000-4000-8000-000000009103";
const ACTIVE_NEWER = "30000000-0000-4000-8000-000000009104";
const HISTORY_OLDER = "30000000-0000-4000-8000-000000009105";
const HISTORY_NEWER = "30000000-0000-4000-8000-000000009106";
const POS_A = "10000000-0000-4000-8000-000000000040";
const POS_B = "10000000-0000-4000-8000-000000000041";

async function openPositions(page: Page, mission: BehavioralMission): Promise<Locator> {
  await mission.open(page);
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const menu = page.getByTestId("rex-map-menu");
  await expect(menu).toContainText("Survey Bravo - Active Bravo");
  await menu.getByText("All Positions", { exact: true }).click();
  await expect(menu.locator("table")).toHaveCount(2);
  const handle = (await menu.getByTestId("rex-map-menu-drag-handle").boundingBox())!;
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2 + 180, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  for (const section of ["Sources", "Markers", "Labels", "Paths"]) {
    await visibility
      .locator('[class*="toggleMenuItemRow"]')
      .filter({ hasText: section })
      .getByText("All", { exact: true })
      .click();
  }
  await visibility.locator('svg[data-icon="xmark"]').click();
  return menu;
}

async function setMapChoice(page: Page, section: string, choice: string): Promise<void> {
  await page.getByTestId("map-menu-launcher").click();
  const row = page
    .getByTestId("map-menu-floating-panel")
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: section });
  await row.getByText(choice, { exact: true }).click();
  await page.getByTestId("map-menu-floating-panel").locator('svg[data-icon="xmark"]').click();
}

async function setSource(page: Page, source: "All" | "Crew" | "Rover"): Promise<void> {
  await page.getByTestId("map-menu-launcher").click();
  const row = page
    .getByTestId("map-menu-floating-panel")
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" });
  await row.getByText("All", { exact: true }).click();
  if (source !== "All") await row.locator(`[data-tooltip-content="${source}"]`).click();
  await page.getByTestId("map-menu-floating-panel").locator('svg[data-icon="xmark"]').click();
}

async function positionFeatures(page: Page) {
  return page.evaluate(
    (trackedIds) => {
      const map = window.__aegisMaps?.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) throw new Error("The editor map is not observed");
      return map
        .getLayers()
        .getArray()
        .flatMap((layer) => {
          const source = (layer as VectorLayer).getSource?.();
          if (!source || !("getFeatures" in source)) return [];
          return source.getFeatures().map((feature) => {
            const geometry = feature.getGeometry();
            return {
              id: String(feature.getId() ?? ""),
              geometryType: geometry?.getType() ?? null,
              coordinates: geometry?.getCoordinates?.() ?? null,
              markers: feature.get("posMarkers") as
                { emoji: string; isEV: boolean; color: string }[] | undefined,
              color: feature.get("color") as string | undefined,
              opacity: feature.get("opacity") as number | undefined,
            };
          });
        })
        .filter((feature) => trackedIds.includes(feature.id) || feature.id.startsWith("posPath-"));
    },
    [POS_A, POS_B, ACTIVE_OLDER, ACTIVE_NEWER, HISTORY_OLDER, HISTORY_NEWER]
  );
}

function projected(point: AEGISPoint): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

test("marker types, source paths and PET ages remain scoped to active, historical and planned REX views", async ({
  page,
  mission,
}) => {
  const activeOldLocation = { lat: 0.0018, lng: 0.0021 };
  const activeNewLocation = { lat: 0.0022, lng: 0.0028 };
  const historyOldLocation = { lat: 0.0002, lng: 0.0012 };
  const historyNewLocation = { lat: 0.0008, lng: 0.0019 };
  const activeOld = seedPosEntry({
    uuid: ACTIVE_OLDER,
    location: activeOldLocation,
    petSeconds: 60,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) - 120_000,
  });
  const activeNew = seedPosEntry({
    uuid: ACTIVE_NEWER,
    location: activeNewLocation,
    petSeconds: 240,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
  });
  const historyOld = seedPosEntry({
    uuid: HISTORY_OLDER,
    location: historyOldLocation,
    petSeconds: 6_000,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) - 120_000,
  });
  const historyNew = seedPosEntry({
    uuid: HISTORY_NEWER,
    location: historyNewLocation,
    petSeconds: 7_700,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: SECOND_SOURCE,
    createdAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
  });
  await mission.change((doc) => {
    for (const rexUuid of [mission.ids.rexA, mission.ids.rexB]) {
      doc.rexes[rexUuid].posTypes.push({
        uuid: SECOND_TYPE,
        name: "EV2",
        abbr: "2",
        icon: "1f469-200d-1f680",
        pathColor: "#0055ff",
      });
      doc.rexes[rexUuid].posSources.push({ uuid: SECOND_SOURCE, name: "Rover", abbr: "R" });
    }
    doc.rexes[mission.ids.rexB].posEntries.push(activeOld, activeNew);
    doc.rexes[mission.ids.rexA].posEntries.push(historyOld, historyNew);
  });
  const menu = await openPositions(page, mission);

  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.posB, ACTIVE_OLDER, ACTIVE_NEWER].sort());
  const activeSnapshots = await positionFeatures(page);
  expect(activeSnapshots.find((feature) => feature.id === ACTIVE_NEWER)?.markers).toEqual([
    { emoji: "1f469-200d-1f680", isEV: true, color: "#0055ff" },
  ]);
  expect(
    activeSnapshots
      .filter((feature) => feature.id.startsWith("posPath-"))
      .map((feature) => ({
        id: feature.id,
        color: feature.color,
        opacity: feature.opacity,
        coordinates: feature.coordinates,
      }))
  ).toEqual([
    {
      id: `posPath-${SECOND_TYPE}`,
      color: "#0055ff",
      opacity: 0.6,
      coordinates: [activeOldLocation, activeNewLocation].map((point) =>
        projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
      ),
    },
  ]);
  await expect
    .poll(async () =>
      (await readMapFeatures(page))
        .filter((feature) => feature.labelType === "pos" && feature.visible)
        .map((feature) => feature.name)
        .sort()
    )
    .toEqual(["+00:01:00 / 2 (R)", "+00:03:00 / 1 (C)", "+00:04:00 / 2 (R)"].sort());

  await setMapChoice(page, "Markers", "Latest");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.posB, ACTIVE_NEWER].sort());
  await setMapChoice(page, "Markers", "All");
  await setSource(page, "Crew");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.posB]);
  await expect
    .poll(
      async () =>
        (await positionFeatures(page)).filter((feature) => feature.id.startsWith("posPath-")).length
    )
    .toBe(0);
  await setSource(page, "Rover");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([ACTIVE_OLDER, ACTIVE_NEWER].sort());
  await setMapChoice(page, "Paths", "None");
  await expect
    .poll(
      async () =>
        (await positionFeatures(page)).filter((feature) => feature.id.startsWith("posPath-")).length
    )
    .toBe(0);
  await setMapChoice(page, "Paths", "All");
  await setSource(page, "All");

  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await expect(menu).toContainText("Survey Alpha - Stopped Alpha");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.posA, HISTORY_OLDER, HISTORY_NEWER].sort());
  await expect
    .poll(async () =>
      (await readMapFeatures(page))
        .filter((feature) => feature.labelType === "pos" && feature.visible)
        .map((feature) => feature.name)
        .sort()
    )
    .toEqual(["+00:01:45 / 2 (R)", "+00:15:00 / 1 (C)", "+00:30:05 / 2 (R)"].sort());
  const historicalPath = (await positionFeatures(page)).find(
    (feature) => feature.id === `posPath-${SECOND_TYPE}`
  );
  expect(historicalPath).toMatchObject({
    color: "#0055ff",
    opacity: 0.6,
    coordinates: [historyOldLocation, historyNewLocation].map((point) =>
      projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
    ),
  });
  await setSource(page, "Crew");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.posA]);
  await expect
    .poll(
      async () =>
        (await positionFeatures(page)).filter((feature) => feature.id.startsWith("posPath-")).length
    )
    .toBe(0);
  await setSource(page, "Rover");
  await expect
    .poll(async () =>
      (await positionFeatures(page))
        .filter((feature) => feature.geometryType === "Point")
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([HISTORY_OLDER, HISTORY_NEWER].sort());
  await setMapChoice(page, "Paths", "None");
  await expect
    .poll(
      async () =>
        (await positionFeatures(page)).filter((feature) => feature.id.startsWith("posPath-")).length
    )
    .toBe(0);

  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  await expect(page.locator('div[aria-label="EVA Title"]')).toHaveText("Survey Alpha");
  await expect
    .poll(async () =>
      (await positionFeatures(page)).filter(
        (feature) => feature.geometryType === "Point" || feature.id.startsWith("posPath-")
      )
    )
    .toEqual([]);
  const unchanged = await mission.read();
  expect(unchanged.rexes[mission.ids.rexA].posEntries).toContainEqual(historyOld);
  expect(unchanged.rexes[mission.ids.rexB].posEntries).toContainEqual(activeNew);
});
