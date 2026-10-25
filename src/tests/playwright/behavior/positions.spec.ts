import type { Browser, Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import { selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

const SECOND_TYPE = "30000000-0000-4000-8000-000000000001";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000000002";
const THIRD_SOURCE = "30000000-0000-4000-8000-000000000009";
const EARLIER_POSITION = "30000000-0000-4000-8000-000000000003";
const OTHER_POSITION = "30000000-0000-4000-8000-000000000004";

async function arrangePositionChoices(mission: BehavioralMission, ticking = false): Promise<void> {
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.petRunning = ticking;
    rex.petStartStopTimestamp = BEHAVIORAL_NOW;
    rex.posTypes.push({
      uuid: SECOND_TYPE,
      name: "EV2",
      abbr: "2",
      icon: "1f469-200d-1f680",
      pathColor: "#0000ff",
    });
    rex.posSources.push({ uuid: SECOND_SOURCE, name: "Rover", abbr: "R" });
  });
}

async function controlClock(page: Page): Promise<void> {
  // Keep native timers/animation and neutralize only the external server-clock correction.
  await page.context().addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      setItem.call(this, key, key === "timeOffsetMs" ? "0" : value);
    };
    sessionStorage.setItem("timeOffsetMs", "0");
  });
  await page.clock.setFixedTime(new Date(BEHAVIORAL_NOW));
}

async function openPositions(page: Page, mission: BehavioralMission): Promise<Locator> {
  await mission.open(page);
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const menu = page.getByTestId("rex-map-menu");
  await expect(menu).toContainText("Survey Bravo - Active Bravo");
  await menu.getByText("All Positions", { exact: true }).click();
  await expect(menu.locator("table")).toHaveCount(2);
  // The application defaults to Task/Crew sources; these cases also use Rover.
  // Move the position menu away from the visibility launcher using its drag handle.
  const handle = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2 + 180, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  const allSources = visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" })
    .getByText("All", { exact: true });
  await allSources.click();
  await expect(allSources).toHaveClass(/toggleSelected/);
  await visibility.locator('svg[data-icon="xmark"]').click();
  const moved = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(moved.x + 60, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2, { steps: 10 });
  await page.mouse.up();
  return menu;
}

function positionRow(page: Page, pet: string): Locator {
  return page
    .getByTestId("rex-map-menu")
    .locator("table")
    .last()
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: pet, exact: true }) });
}

function positionRowWithSource(page: Page, pet: string, source: string): Locator {
  return positionRow(page, pet).filter({
    has: page.getByRole("cell", { name: source, exact: true }),
  });
}

async function positionAction(page: Page, pet: string, action: string): Promise<void> {
  await positionRow(page, pet).locator('svg[data-icon="ellipsis-vertical"]').click();
  await page.locator("dialog[open]").getByText(action, { exact: true }).click();
}

async function rowAction(row: Locator, page: Page, action: string): Promise<void> {
  await row.locator('svg[data-icon="ellipsis-vertical"]').click();
  await page.locator("dialog[open]").getByText(action, { exact: true }).click();
}

function choice(menu: Locator, name: string): Locator {
  return menu.locator(`[data-tooltip-content="${name}"]`);
}

function projected(point: AEGISPoint): number[] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

async function expectPositionMarker(page: Page, uuid: string, point: AEGISPoint): Promise<void> {
  await expect
    .poll(
      async () =>
        (await readMapFeatures(page)).find(
          (feature) => feature.id === uuid && feature.geometryType === "Point" && feature.visible
        )?.coordinates
    )
    // Allow submillimeter differences from browser pointer coordinate precision.
    .toEqual(projected(point).map((coordinate) => expect.closeTo(coordinate, 3)));
}

async function placePosition(page: Page, point: AEGISPoint): Promise<void> {
  // Selecting an offscreen position can animate the view before editing starts.
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__aegisMaps
          .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
          .map.getView()
          .getAnimating()
      )
    )
    .toBe(false);
  const pixel = await page.evaluate((coordinate) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    const [x, y] = map.getPixelFromCoordinate(coordinate);
    const bounds = map.getTargetElement().getBoundingClientRect();
    return { x: bounds.left + x, y: bounds.top + y };
  }, projected(point));
  const hitIsMap = await page.evaluate(({ x, y }) => {
    return !!document.elementFromPoint(x, y)?.closest(".ol-viewport canvas");
  }, pixel);
  expect(hitIsMap, "The placement gesture must land on the map canvas, clear of menus").toBe(true);
  await page.mouse.click(pixel.x, pixel.y);
}

async function createPosition(
  page: Page,
  menu: Locator,
  location: AEGISPoint,
  source: string
): Promise<void> {
  // New Pos requires at least one type already selected before placement starts.
  await choice(menu, "EV1").click();
  await menu.getByLabel("New Pos.", { exact: true }).click();
  await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
  await choice(menu, "EV2").click();
  await choice(menu, "EV1").click();
  await choice(menu, source).click();
  await placePosition(page, location);
  await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
}

async function withPositionPeer(
  browser: Browser,
  page: Page,
  mission: BehavioralMission,
  baseURL: string | undefined,
  run: (peer: Page) => Promise<void>
): Promise<void> {
  const peerContext = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  await installMapObserver(peer);
  try {
    await mission.open(peer);
    await run(peer);
  } finally {
    await peerContext.close();
  }
}

async function withMapVisibility(
  page: Page,
  run: (panel: Locator) => Promise<void>
): Promise<void> {
  const menu = page.getByTestId("rex-map-menu");
  const original = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(original.x + 60, original.y + original.height / 2);
  await page.mouse.down();
  await page.mouse.move(original.x + 60, original.y + original.height / 2 + 180, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("map-menu-launcher").click();
  const panel = page.getByTestId("map-menu-floating-panel");
  await run(panel);
  await panel.locator('svg[data-icon="xmark"]').click();
  const moved = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(moved.x + 60, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(original.x + 60, original.y + original.height / 2, { steps: 10 });
  await page.mouse.up();
}

function positionSourceRow(page: Page, name: string): Locator {
  return page
    .locator('div[aria-label="Position Source Name"]')
    .filter({ hasText: name })
    .locator("xpath=ancestor::li");
}

async function updatePositionSourceField(
  page: Page,
  name: string,
  label: "Position Source Name" | "Position Source Abbr.",
  value: string
): Promise<void> {
  await positionSourceRow(page, name).locator(`div[aria-label="${label}"]`).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
}

async function deletePositionSource(
  page: Page,
  name: string,
  expectedAlert?: string
): Promise<void> {
  if (expectedAlert) {
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(expectedAlert);
      await dialog.accept();
    });
  }
  await positionSourceRow(page, name).locator('svg[data-icon="trash-can"]').click();
}

test.describe("Execution position contracts", () => {
  for (const ticking of [true, false]) {
    test(`New Pos captures ${ticking ? "ticking" : "paused"} PET before placement and saves the selected types and source`, async ({
      page,
      mission,
    }) => {
      await arrangePositionChoices(mission, ticking);
      await controlClock(page);
      const before = await mission.read();
      const menu = await openPositions(page, mission);
      await expect(page.getByTestId("header-pet-clock")).toHaveText("+00:05:00");
      await choice(menu, "EV1").click();
      await menu.getByLabel("New Pos.", { exact: true }).click();
      await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
      expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
        before.rexes[mission.ids.rexB].posEntries
      );

      await page.clock.setFixedTime(new Date(Date.parse(BEHAVIORAL_NOW) + 90_000));
      await expect(page.getByTestId("header-pet-clock")).toHaveText(
        ticking ? "+00:06:30" : "+00:05:00"
      );
      // Changes made after New Pos belong to the draft; PET remains the captured value.
      await choice(menu, "EV2").click();
      await choice(menu, "EV1").click();
      await choice(menu, "Rover").click();
      const location = { lat: -0.0006, lng: 0.001 };
      await placePosition(page, location);
      await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries.length)
        .toBe(2);
      const after = await mission.read();
      const created = after.rexes[mission.ids.rexB].posEntries.find(
        (entry) => entry.uuid !== mission.ids.posB
      );
      expect(created).toMatchObject({
        location: { lat: expect.closeTo(location.lat, 7), lng: expect.closeTo(location.lng, 7) },
        petSeconds: 300,
        posTypeUuids: [SECOND_TYPE],
        posSourceUuid: SECOND_SOURCE,
        createdAt: Date.parse(BEHAVIORAL_NOW),
        updatedAt: Date.parse(BEHAVIORAL_NOW) + 90_000,
      });
      expect(after.rexes[mission.ids.rexB].posEntries[0]).toEqual(
        before.rexes[mission.ids.rexB].posEntries[0]
      );
      expect(after.rexes[mission.ids.rexA]).toEqual(before.rexes[mission.ids.rexA]);
      expect(after.evas).toEqual(before.evas);
      await expect(positionRow(page, "+00:05:00")).toContainText("EV2");
      await expect(
        positionRow(page, "+00:05:00").getByRole("cell", { name: "R", exact: true })
      ).toBeVisible();
      await expectPositionMarker(page, created.uuid, location);

      await openPositions(page, mission);
      await expect(positionRow(page, "+00:05:00")).toContainText("EV2");
      await expectPositionMarker(page, created.uuid, location);
      expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
        after.rexes[mission.ids.rexB].posEntries
      );
    });
  }

  test("Cancel Pos abandons a new entry and removes the pending map placement", async ({
    page,
    mission,
  }) => {
    await arrangePositionChoices(mission);
    const before = await mission.read();
    const menu = await openPositions(page, mission);
    // With no marker types selected, New Pos cannot begin a placement.
    await menu.getByLabel("New Pos.", { exact: true }).click();
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
    await choice(menu, "EV2").click();
    await choice(menu, "Rover").click();
    await menu.getByLabel("New Pos.", { exact: true }).click();
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
    await menu.getByLabel("Cancel Pos.", { exact: true }).click();
    await expect(menu.getByLabel("New Pos.", { exact: true })).toBeVisible();
    await placePosition(page, { lat: -0.0006, lng: 0.001 });
    expect(await mission.read()).toEqual(before);
    await expect(positionRow(page, "+00:02:00")).toHaveCount(1);
    await openPositions(page, mission);
    expect(await mission.read()).toEqual(before);
    await expectPositionMarker(
      page,
      mission.ids.posB,
      before.rexes[mission.ids.rexB].posEntries[0].location
    );
  });

  test("moving an existing position commits coordinates only while Save and Cancel control metadata drafts", async ({
    page,
    context,
    mission,
  }) => {
    await arrangePositionChoices(mission);
    await controlClock(page);
    const before = await mission.read();
    const original = before.rexes[mission.ids.rexB].posEntries[0];
    const menu = await openPositions(page, mission);
    const peer = await context.newPage();
    await installMapObserver(peer);
    await openPositions(peer, mission);
    await positionAction(page, "+00:02:00", "Edit");
    await choice(menu, "EV2").click();
    await choice(menu, "EV1").click();
    await choice(menu, "Rover").click();
    await menu.getByLabel("Edit Pos.", { exact: true }).click();
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([original]);
    await page.clock.setFixedTime(new Date(Date.parse(BEHAVIORAL_NOW) + 60_000));
    const location = { lat: -0.0006, lng: 0.001 };
    await placePosition(page, location);
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries[0])
      .toEqual({
        ...original,
        location: { lat: expect.closeTo(location.lat, 7), lng: expect.closeTo(location.lng, 7) },
        updatedAt: Date.parse(BEHAVIORAL_NOW) + 60_000,
      });
    for (const client of [page, peer]) {
      await expectPositionMarker(client, original.uuid, location);
      await expect(positionRow(client, "+00:02:00")).toContainText("EV1");
      await expect(
        positionRow(client, "+00:02:00").getByRole("cell", { name: "C", exact: true })
      ).toBeVisible();
    }
    const moved = (await mission.read()).rexes[mission.ids.rexB].posEntries[0];

    // Reopen the saved record: map finish discarded the earlier metadata draft.
    await positionAction(page, "+00:02:00", "Edit");
    await expect(choice(menu, "EV1")).toHaveClass(/toggleSelected/);
    await expect(choice(menu, "EV2")).not.toHaveClass(/toggleSelected/);
    await choice(menu, "EV2").click();
    await choice(menu, "Rover").click();
    await menu.locator('[data-tooltip-content="Cancel Edit"]').click();
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([moved]);

    await positionAction(page, "+00:02:00", "Edit");
    await choice(menu, "EV2").click();
    await choice(menu, "Rover").click();
    await page.clock.setFixedTime(new Date(Date.parse(BEHAVIORAL_NOW) + 120_000));
    await menu.locator('[data-tooltip-content^="Save Position Markers"]').click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries[0])
      .toEqual({
        ...moved,
        posTypeUuids: [mission.ids.posType, SECOND_TYPE],
        posSourceUuid: SECOND_SOURCE,
        updatedAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
      });
    await expect(positionRow(peer, "+00:02:00")).toContainText("EV1, EV2");
    await expect(
      positionRow(peer, "+00:02:00").getByRole("cell", { name: "R", exact: true })
    ).toBeVisible();
    const saved = await mission.read();

    await positionAction(page, "+00:02:00", "Edit");
    await choice(menu, "EV2").click();
    await choice(menu, "Crew").click();
    await menu.getByLabel("Edit Pos.", { exact: true }).click();
    await menu.getByLabel("Cancel Pos.", { exact: true }).click();
    await placePosition(page, { lat: 0, lng: 0.0015 });
    expect(await mission.read()).toEqual(saved);
    expect(saved.rexes[mission.ids.rexA]).toEqual(before.rexes[mission.ids.rexA]);
    expect(saved.evas).toEqual(before.evas);
    for (const client of [page, peer]) {
      await openPositions(client, mission);
      await expectPositionMarker(client, original.uuid, location);
      await expect(positionRow(client, "+00:02:00")).toContainText("EV1, EV2");
    }
    expect(await mission.read()).toEqual(saved);
  });

  test("position deletion honors Cancel and removes only its entry, marker and obsolete path after confirmation", async ({
    page,
    mission,
  }) => {
    await arrangePositionChoices(mission);
    const earlier = seedPosEntry({
      uuid: EARLIER_POSITION,
      petSeconds: 60,
      location: { lat: 0.0005, lng: 0.0015 },
      posTypeUuids: [mission.ids.posType],
      posSourceUuid: mission.ids.posSource,
      createdAt: Date.parse(BEHAVIORAL_NOW) - 60_000,
    });
    const other = seedPosEntry({
      uuid: OTHER_POSITION,
      petSeconds: 90,
      location: { lat: -0.0005, lng: 0.0015 },
      posTypeUuids: [SECOND_TYPE],
      posSourceUuid: SECOND_SOURCE,
      createdAt: Date.parse(BEHAVIORAL_NOW) - 30_000,
    });
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].posEntries.push(earlier, other);
    });
    const before = await mission.read();
    await openPositions(page, mission);
    const paths = async () =>
      (await readMapFeatures(page)).filter((feature) => feature.id.startsWith("posPath-"));
    await expect
      .poll(async () => (await paths()).map((feature) => feature.coordinates))
      .toEqual([
        [earlier.location, before.rexes[mission.ids.rexB].posEntries[0].location].map((point) =>
          projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
        ),
      ]);
    page.once("dialog", (dialog) => dialog.dismiss());
    await positionAction(page, "+00:02:00", "Delete Entry");
    await expect(positionRow(page, "+00:02:00")).toBeVisible();
    expect(await mission.read()).toEqual(before);

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("Are you sure you want to delete this Crew Position?");
      await dialog.accept();
    });
    await positionAction(page, "+00:02:00", "Delete Entry");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
      .toEqual([earlier, other]);
    await expect(positionRow(page, "+00:02:00")).toHaveCount(0);
    await expect.poll(paths).toEqual([]);
    await expect
      .poll(async () =>
        (await readMapFeatures(page)).filter(
          (feature) => feature.id === mission.ids.posB || feature.id === `pos-${mission.ids.posB}`
        )
      )
      .toEqual([]);
    for (const entry of [earlier, other])
      await expectPositionMarker(page, entry.uuid, entry.location);
    const after = await mission.read();
    expect(after.rexes[mission.ids.rexA]).toEqual(before.rexes[mission.ids.rexA]);
    expect(after.rexes[mission.ids.rexB].posTypes).toEqual(before.rexes[mission.ids.rexB].posTypes);
    expect(after.rexes[mission.ids.rexB].posSources).toEqual(
      before.rexes[mission.ids.rexB].posSources
    );
    await openPositions(page, mission);
    await expect(positionRow(page, "+00:02:00")).toHaveCount(0);
    await expect(positionRow(page, "+00:01:00")).toBeVisible();
    await expect(positionRow(page, "+00:01:30")).toBeVisible();
    await expect.poll(paths).toEqual([]);
    expect(await mission.read()).toEqual(after);
  });

  test("source filters and equal-PET chronology stay scoped to active, historical and planned views", async ({
    page,
    mission,
  }) => {
    await arrangePositionChoices(mission);
    const older = seedPosEntry({
      uuid: "30000000-0000-4000-8000-000000000005",
      petSeconds: 120,
      location: { lat: 0.0007, lng: 0.0014 },
      posTypeUuids: [mission.ids.posType],
      posSourceUuid: mission.ids.posSource,
      createdAt: Date.parse(BEHAVIORAL_NOW) - 120_000,
    });
    const newer = seedPosEntry({
      uuid: "30000000-0000-4000-8000-000000000006",
      petSeconds: 120,
      location: { lat: 0.0003, lng: 0.0018 },
      posTypeUuids: [mission.ids.posType, SECOND_TYPE],
      posSourceUuid: SECOND_SOURCE,
      createdAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
    });
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].posEntries.push(older, newer);
    });
    const menu = await openPositions(page, mission);
    const original = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
      (entry) => entry.uuid === mission.ids.posB
    );
    expect(original?.petSeconds).toBe(120);

    const markers = async () =>
      (await readMapFeatures(page))
        .filter(
          (feature) =>
            [older.uuid, mission.ids.posB, newer.uuid].includes(feature.id) &&
            feature.geometryType === "Point" &&
            feature.visible
        )
        .map((feature) => feature.id)
        .sort();
    const paths = async () =>
      (await readMapFeatures(page)).filter(
        (feature) => feature.id.startsWith("posPath-") && feature.visible
      );
    const projectedPath = (points: AEGISPoint[]) =>
      points.map((point) => projected(point).map((coordinate) => expect.closeTo(coordinate, 5)));

    await expect.poll(markers).toEqual([older.uuid, mission.ids.posB, newer.uuid].sort());
    // All entries have the same PET; the visible path proves chronology follows creation time.
    await expect
      .poll(async () => (await paths()).map((feature) => [feature.id, feature.coordinates]))
      .toEqual([
        [
          `posPath-${mission.ids.posType}-faded`,
          projectedPath([older.location, original!.location]),
        ],
        [
          `posPath-${mission.ids.posType}-latest`,
          projectedPath([original!.location, newer.location]),
        ],
      ]);

    await withMapVisibility(page, async (visibility) => {
      const sourceRow = visibility
        .locator('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      const crewSource = sourceRow.locator('[data-tooltip-content="Crew"]');
      await crewSource.click();
      await expect(crewSource).toHaveClass(/toggleSelected/);
    });
    await expect.poll(markers).toEqual([older.uuid, mission.ids.posB].sort());
    await expect
      .poll(async () => (await paths()).map((feature) => [feature.id, feature.coordinates]))
      .toEqual([
        [
          `posPath-${mission.ids.posType}-latest`,
          projectedPath([older.location, original!.location]),
        ],
      ]);

    await withMapVisibility(page, async (visibility) => {
      const sourceRow = visibility
        .locator('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      await sourceRow.getByText("All", { exact: true }).click();
      const roverSource = sourceRow.locator('[data-tooltip-content="Rover"]');
      await roverSource.click();
      await expect(roverSource).toHaveClass(/toggleSelected/);
    });
    await expect.poll(markers).toEqual([newer.uuid]);
    await expect.poll(paths).toEqual([]);
    await expectPositionMarker(page, newer.uuid, newer.location);

    // The selected historical execution owns a separate position stream.
    await withMapVisibility(page, async (visibility) => {
      const sourceRow = visibility
        .locator('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      await sourceRow.getByText("All", { exact: true }).click();
    });
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expect(menu).toContainText("Survey Alpha - Stopped Alpha");
    await expectPositionMarker(
      page,
      mission.ids.posA,
      (await mission.read()).rexes[mission.ids.rexA].posEntries[0].location
    );
    await expect
      .poll(async () =>
        (await readMapFeatures(page))
          .filter(
            (feature) =>
              [mission.ids.posA, mission.ids.posB, older.uuid, newer.uuid].includes(feature.id) &&
              feature.geometryType === "Point" &&
              feature.visible
          )
          .map((feature) => feature.id)
      )
      .toEqual([mission.ids.posA]);

    // A planned EVA has no selected REX, so no execution positions or paths are drawn.
    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await expect(page.locator('div[aria-label="EVA Title"]')).toHaveText("Survey Alpha");
    await expect
      .poll(async () =>
        (await readMapFeatures(page)).filter(
          (feature) =>
            feature.id === mission.ids.posA ||
            feature.id === mission.ids.posB ||
            feature.id === older.uuid ||
            feature.id === newer.uuid ||
            feature.id.startsWith("posPath-")
        )
      )
      .toEqual([]);

    // Filtering the live map does not reorder or mutate the selected REX's persisted entries.
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([
      original,
      older,
      newer,
    ]);
    await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
  });

  test("two clients converge on position additions, edits and deletions across a disconnect", async ({
    page,
    browser,
    baseURL,
    mission,
  }) => {
    await arrangePositionChoices(mission);
    const menu = await openPositions(page, mission);
    const fixtureOriginal = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
      (entry) => entry.uuid === mission.ids.posB
    )!;
    const mainLocation = { lat: -0.0004, lng: 0.0012 };
    await createPosition(page, menu, mainLocation, "Rover");
    const mainEntry = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
      (entry) => entry.posSourceUuid === SECOND_SOURCE
    );
    expect(mainEntry).toBeDefined();
    expect(mainEntry?.posTypeUuids).toEqual([SECOND_TYPE]);

    await withPositionPeer(browser, page, mission, baseURL, async (peer) => {
      const peerMenu = await openPositions(peer, mission);
      const peerLocation = { lat: -0.0008, lng: 0.0017 };
      await createPosition(peer, peerMenu, peerLocation, "Crew");
      const peerEntry = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
        (entry) => entry.uuid !== mission.ids.posB && entry.uuid !== mainEntry?.uuid
      );
      expect(peerEntry).toMatchObject({
        location: {
          lat: expect.closeTo(peerLocation.lat, 7),
          lng: expect.closeTo(peerLocation.lng, 7),
        },
        posTypeUuids: [SECOND_TYPE],
        posSourceUuid: mission.ids.posSource,
      });
      await expectPositionMarker(page, peerEntry!.uuid, peerLocation);

      await peer.context().setOffline(true);
      await expect(peer.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
        "data-tooltip-content",
        "Offline: Editing Disabled"
      );
      await expect(positionRowWithSource(peer, "+00:05:00", "C")).toBeVisible();

      // The connected client changes the original entry and removes the peer's entry.
      await positionAction(page, "+00:02:00", "Edit");
      await choice(menu, "EV2").click();
      await choice(menu, "Rover").click();
      await menu.locator('[data-tooltip-content^="Save Position Markers"]').click();
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries[0])
        .toMatchObject({
          uuid: mission.ids.posB,
          posTypeUuids: [mission.ids.posType, SECOND_TYPE],
          posSourceUuid: SECOND_SOURCE,
        });
      const offlineEditedOriginal = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
        (entry) => entry.uuid === mission.ids.posB
      )!;
      expect(offlineEditedOriginal).toMatchObject({
        uuid: fixtureOriginal.uuid,
        location: fixtureOriginal.location,
        petSeconds: fixtureOriginal.petSeconds,
        createdAt: fixtureOriginal.createdAt,
        posTypeUuids: [mission.ids.posType, SECOND_TYPE],
        posSourceUuid: SECOND_SOURCE,
      });
      page.once("dialog", (dialog) => dialog.accept());
      await rowAction(positionRowWithSource(page, "+00:05:00", "C"), page, "Delete Entry");
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries.length)
        .toBe(2);
      await expect(positionRowWithSource(page, "+00:05:00", "C")).toHaveCount(0);

      await peer.context().setOffline(false);
      await expect(peer.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
        "data-tooltip-content",
        "Turn On Edit Mode"
      );
      await expect(positionRowWithSource(peer, "+00:02:00", "R")).toContainText("EV1, EV2");
      await expect(positionRowWithSource(peer, "+00:05:00", "C")).toHaveCount(0);
      await expectPositionMarker(peer, mainEntry!.uuid, mainLocation);
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
        .toEqual([
          expect.objectContaining({
            uuid: mission.ids.posB,
            posTypeUuids: [mission.ids.posType, SECOND_TYPE],
            posSourceUuid: SECOND_SOURCE,
          }),
          mainEntry,
        ]);
      const originalBeforeConcurrentSaves = (await mission.read()).rexes[
        mission.ids.rexB
      ].posEntries.find((entry) => entry.uuid === mission.ids.posB)!;

      // Both clients edit the same surviving entry from the same committed state.
      await rowAction(positionRowWithSource(page, "+00:05:00", "R"), page, "Edit");
      await rowAction(positionRowWithSource(peer, "+00:05:00", "R"), peer, "Edit");
      await choice(menu, "EV1").click();
      await choice(peerMenu, "Crew").click();
      await Promise.all([
        menu.locator('[data-tooltip-content^="Save Position Markers"]').click(),
        peerMenu.locator('[data-tooltip-content^="Save Position Markers"]').click(),
      ]);
      const targetPayload = (entry: PosEntry) => ({
        uuid: entry.uuid,
        location: entry.location,
        petSeconds: entry.petSeconds,
        createdAt: entry.createdAt,
        posTypeUuids: entry.posTypeUuids,
        posSourceUuid: entry.posSourceUuid,
      });
      const mainCandidate = {
        uuid: mainEntry!.uuid,
        location: mainEntry!.location,
        petSeconds: mainEntry!.petSeconds,
        createdAt: mainEntry!.createdAt,
        posTypeUuids: [SECOND_TYPE, mission.ids.posType],
        posSourceUuid: SECOND_SOURCE,
      };
      const peerCandidate = {
        ...targetPayload(mainEntry!),
        posTypeUuids: [SECOND_TYPE],
        posSourceUuid: mission.ids.posSource,
      };
      const retainedIds = [mission.ids.posB, mainEntry!.uuid].sort();
      await expect
        .poll(async () =>
          (await mission.read()).rexes[mission.ids.rexB].posEntries.map((e) => e.uuid).sort()
        )
        .toEqual(retainedIds);
      await expect
        .poll(async () => {
          const rex = (await mission.read()).rexes[mission.ids.rexB];
          const entry = rex.posEntries.find((candidate) => candidate.uuid === mainEntry!.uuid);
          if (
            !entry ||
            ![mainCandidate, peerCandidate].some(
              (candidate) => JSON.stringify(targetPayload(entry)) === JSON.stringify(candidate)
            )
          ) {
            return false;
          }
          const sourceAbbr = rex.posSources.find(
            (source) => source.uuid === entry.posSourceUuid
          )?.abbr;
          const typeNames = entry.posTypeUuids
            .map((uuid) => rex.posTypes.find((type) => type.uuid === uuid)?.name)
            .join(", ");
          if (!sourceAbbr || !typeNames) return false;
          for (const client of [page, peer]) {
            const row = await positionRowWithSource(client, "+00:05:00", sourceAbbr)
              .innerText()
              .catch(() => "");
            if (!row.includes(sourceAbbr) || !row.includes(typeNames)) return false;
          }
          return true;
        })
        .toBe(true);
      const concurrentEntries = (await mission.read()).rexes[mission.ids.rexB].posEntries;
      expect(concurrentEntries.map((entry) => entry.uuid).sort()).toEqual(retainedIds);
      const changedOriginal = concurrentEntries.find((entry) => entry.uuid === mission.ids.posB)!;
      expect(changedOriginal).toEqual(originalBeforeConcurrentSaves);
      const convergedEntry = concurrentEntries.find((entry) => entry.uuid === mainEntry!.uuid)!;
      expect([mainCandidate, peerCandidate]).toContainEqual(targetPayload(convergedEntry));
      const convergedRex = (await mission.read()).rexes[mission.ids.rexB];
      const convergedSourceAbbr = convergedRex.posSources.find(
        (source) => source.uuid === convergedEntry.posSourceUuid
      )!.abbr;
      const convergedTypeNames = convergedEntry.posTypeUuids
        .map((uuid) => convergedRex.posTypes.find((type) => type.uuid === uuid)?.name)
        .join(", ");
      for (const entry of concurrentEntries) {
        expect(entry.posTypeUuids.length).toBeGreaterThan(0);
        for (const typeUuid of entry.posTypeUuids) {
          expect(convergedRex.posTypes.map((type) => type.uuid)).toContain(typeUuid);
        }
        expect(convergedRex.posSources.map((source) => source.uuid)).toContain(entry.posSourceUuid);
      }
      for (const client of [page, peer]) {
        await expect(positionRowWithSource(client, "+00:05:00", convergedSourceAbbr)).toContainText(
          convergedTypeNames
        );
      }

      peer.once("dialog", (dialog) => dialog.accept());
      await rowAction(positionRow(peer, "+00:02:00"), peer, "Delete Entry");
      await expect(positionRow(page, "+00:02:00")).toHaveCount(0);
      const finalRex = (await mission.read()).rexes[mission.ids.rexB];
      expect(finalRex.posEntries).toHaveLength(1);
      expect(targetPayload(finalRex.posEntries[0])).toEqual(targetPayload(convergedEntry));
      for (const entry of finalRex.posEntries) {
        for (const typeUuid of entry.posTypeUuids) {
          expect(finalRex.posTypes.map((type) => type.uuid)).toContain(typeUuid);
        }
        expect(finalRex.posSources.map((source) => source.uuid)).toContain(entry.posSourceUuid);
      }

      await mission.open(page);
      await openPositions(page, mission);
      await mission.open(peer);
      await openPositions(peer, mission);
      for (const client of [page, peer]) {
        await expect(positionRowWithSource(client, "+00:05:00", convergedSourceAbbr)).toContainText(
          convergedTypeNames
        );
      }
      const afterReload = (await mission.read()).rexes[mission.ids.rexB].posEntries[0];
      expect(targetPayload(afterReload)).toEqual(targetPayload(convergedEntry));
      await expectPositionMarker(page, mainEntry!.uuid, mainLocation);
      await expectPositionMarker(peer, mainEntry!.uuid, mainLocation);
    });
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toHaveLength(1);
  });

  test("position sources enforce the count and usage guards and persist renames and surviving-source entries", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      const rex = doc.rexes[mission.ids.rexB];
      rex.posTypes.push({
        uuid: SECOND_TYPE,
        name: "EV2",
        abbr: "2",
        icon: "1f469-200d-1f680",
        pathColor: "#0000ff",
      });
      rex.posSources.push(
        { uuid: SECOND_SOURCE, name: "Task", abbr: "T" },
        { uuid: THIRD_SOURCE, name: "SER", abbr: "S" }
      );
    });
    await mission.open(page);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabel("rex_positions_panel", { exact: true }).click();
    await expect(page.getByText("REX Position Types and Sources", { exact: true })).toBeVisible();
    const editToggle = page.getByLabel("globalEditToggle", { exact: true });
    await editToggle.click();
    await expect(editToggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");

    const rexBeforeAdd = (await mission.read()).rexes[mission.ids.rexB];
    expect(rexBeforeAdd.posSources).toHaveLength(3);
    await page.getByLabel("Add Position Source", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posSources.length)
      .toBe(4);
    const blankSource = (await mission.read()).rexes[mission.ids.rexB].posSources.find(
      (source) => source.name === "(Blank)"
    );
    expect(blankSource).toMatchObject({ name: "(Blank)", abbr: "B" });

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe("You can only have a maximum of 4 Position Sources.");
      await dialog.accept();
    });
    await page.getByLabel("Add Position Source", { exact: true }).click();
    expect((await mission.read()).rexes[mission.ids.rexB].posSources).toHaveLength(4);

    await updatePositionSourceField(page, "(Blank)", "Position Source Name", "Field Team");
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexB].posSources.find(
            (source) => source.uuid === blankSource!.uuid
          )?.name
      )
      .toBe("Field Team");
    await updatePositionSourceField(page, "Field Team", "Position Source Abbr.", "F");
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexB].posSources.find(
            (source) => source.uuid === blankSource!.uuid
          )?.abbr
      )
      .toBe("F");

    await deletePositionSource(
      page,
      "Crew",
      "This Position Source is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Source."
    );
    expect((await mission.read()).rexes[mission.ids.rexB].posSources).toHaveLength(4);

    const menu = await openPositions(page, mission);
    const fieldTeamLocation = { lat: -0.0002, lng: 0.0011 };
    await createPosition(page, menu, fieldTeamLocation, "Field Team");
    const fieldTeamEntry = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
      (entry) => entry.posSourceUuid === blankSource!.uuid
    );
    expect(fieldTeamEntry).toMatchObject({
      posSourceUuid: blankSource!.uuid,
      posTypeUuids: [SECOND_TYPE],
      location: {
        lat: expect.closeTo(fieldTeamLocation.lat, 7),
        lng: expect.closeTo(fieldTeamLocation.lng, 7),
      },
    });

    await mission.open(page);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabel("rex_positions_panel", { exact: true }).click();
    await editToggle.click();
    await deletePositionSource(
      page,
      "Field Team",
      "This Position Source is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Source."
    );
    expect(
      (await mission.read()).rexes[mission.ids.rexB].posSources.find(
        (source) => source.uuid === blankSource!.uuid
      )
    ).toMatchObject({ name: "Field Team", abbr: "F" });

    const positionsMenu = await openPositions(page, mission);
    page.once("dialog", (dialog) => dialog.accept());
    await rowAction(positionRowWithSource(page, "+00:02:00", "C"), page, "Delete Entry");
    page.once("dialog", (dialog) => dialog.accept());
    await rowAction(positionRowWithSource(page, "+00:05:00", "F"), page, "Delete Entry");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
      .toEqual([]);
    await expect(positionsMenu.getByLabel("New Pos.", { exact: true })).toBeVisible();

    await mission.open(page);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabel("rex_positions_panel", { exact: true }).click();
    await editToggle.click();
    for (const name of ["Task", "SER", "Field Team"]) {
      await deletePositionSource(page, name);
      await expect
        .poll(async () =>
          (await mission.read()).rexes[mission.ids.rexB].posSources.some(
            (source) => source.name === name
          )
        )
        .toBe(false);
    }
    expect((await mission.read()).rexes[mission.ids.rexB].posSources).toEqual([
      expect.objectContaining({ uuid: mission.ids.posSource, name: "Crew", abbr: "C" }),
    ]);

    await deletePositionSource(page, "Crew", "You must have at least one Position Source.");
    expect((await mission.read()).rexes[mission.ids.rexB].posSources).toEqual([
      expect.objectContaining({ uuid: mission.ids.posSource, name: "Crew", abbr: "C" }),
    ]);

    await mission.open(page);
    const survivingMenu = await openPositions(page, mission);
    const crewLocation = { lat: -0.0002, lng: 0.0016 };
    await createPosition(page, survivingMenu, crewLocation, "Crew");
    const crewEntry = (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
      (entry) => entry.posSourceUuid === mission.ids.posSource
    );
    expect(crewEntry).toMatchObject({
      posSourceUuid: mission.ids.posSource,
      location: {
        lat: expect.closeTo(crewLocation.lat, 7),
        lng: expect.closeTo(crewLocation.lng, 7),
      },
    });
    await mission.open(page);
    await openPositions(page, mission);
    await expect(positionRowWithSource(page, "+00:05:00", "C")).toBeVisible();
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([
      expect.objectContaining({
        uuid: crewEntry!.uuid,
        posSourceUuid: mission.ids.posSource,
      }),
    ]);
  });
});
