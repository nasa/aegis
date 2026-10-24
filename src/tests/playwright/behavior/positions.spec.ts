import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import { selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

const SECOND_TYPE = "30000000-0000-4000-8000-000000000001";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000000002";
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

async function positionAction(page: Page, pet: string, action: string): Promise<void> {
  await positionRow(page, pet).locator('svg[data-icon="ellipsis-vertical"]').click();
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
});
