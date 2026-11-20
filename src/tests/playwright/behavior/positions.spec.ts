import type { Browser, Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import { selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

const SECOND_TYPE = "30000000-0000-4000-8000-000000000001";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000000002";

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
    rex.posSources.push({ uuid: SECOND_SOURCE, name: "Rover", abbr: "R", pathColor: "#0088ff" });
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
  const menu = page.getByTestId("positions-menu");
  await expect(menu).toContainText("Survey Bravo - Active Bravo");
  // The application defaults to Task/Crew sources; these cases also use Rover.
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  const allSources = visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" })
    .getByText("All", { exact: true });
  await allSources.click();
  await expect(allSources).toHaveClass(/toggleSelected/);
  await visibility.locator('svg[data-icon="xmark"]').click();
  return menu;
}

function positionRow(page: Page, pet: string): Locator {
  return page
    .getByTestId("position-table")
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: pet, exact: true }) });
}

function positionRowWithSource(page: Page, pet: string, source: string): Locator {
  return positionRow(page, pet).filter({
    has: page.getByRole("cell", { name: source, exact: true }),
  });
}

async function positionAction(page: Page, pet: string, action: string): Promise<void> {
  await positionRow(page, pet).getByLabel("Position actions", { exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

async function rowAction(row: Locator, page: Page, action: string): Promise<void> {
  await row.getByLabel("Position actions", { exact: true }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

function choice(menu: Locator, name: string): Locator {
  return menu.getByRole("button", { name, exact: true });
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
  await menu.getByLabel("Position", { exact: true }).click();
  await choice(menu, source).click();
  for (const name of ["EV1", "EV2"]) {
    const type = choice(menu, name);
    if ((await type.getAttribute("aria-pressed")) !== String(name === "EV2")) await type.click();
  }
  await menu.getByLabel("Place on Map", { exact: true }).click();
  await expect(menu.getByTestId("position-editor-map-directive-hint")).toBeVisible();
  await placePosition(page, location);
  await expect(menu.getByTestId("position-editor-map-directive-hint")).toHaveCount(0);
  await menu.getByLabel("Save", { exact: true }).click();
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

test.describe("Execution position contracts", () => {
  test("position geometry and marker metadata synchronize to a peer and persist after fresh loads", async ({
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
    await positionAction(page, "+00:02:00", "Edit Position");
    await choice(menu, "EV2").click();
    await choice(menu, "Rover").click();
    await menu.getByLabel("Edit Pos.", { exact: true }).click();
    await expect(menu.getByTestId("position-editor-map-directive-hint")).toBeVisible();
    const location = { lat: -0.0006, lng: 0.001 };
    await placePosition(page, location);
    await expect(menu.getByTestId("position-editor-map-directive-hint")).toHaveCount(0);
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([original]);
    await expectPositionMarker(peer, original.uuid, original.location);
    await page.clock.setFixedTime(new Date(Date.parse(BEHAVIORAL_NOW) + 120_000));
    await menu.getByLabel("Save", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries[0])
      .toMatchObject({
        uuid: original.uuid,
        location: { lat: expect.closeTo(location.lat, 7), lng: expect.closeTo(location.lng, 7) },
        posTypeUuids: [mission.ids.posType, SECOND_TYPE],
        posSourceUuid: SECOND_SOURCE,
        updatedAt: Date.parse(BEHAVIORAL_NOW) + 120_000,
      });
    for (const client of [page, peer]) {
      await expectPositionMarker(client, original.uuid, location);
      await expect(positionRowWithSource(client, "+00:02:00", "R")).toContainText("EV1, EV2");
    }
    const saved = await mission.read();

    for (const client of [page, peer]) {
      await openPositions(client, mission);
      await expectPositionMarker(client, original.uuid, location);
      await expect(positionRow(client, "+00:02:00")).toContainText("EV1, EV2");
    }
    expect(await mission.read()).toEqual(saved);
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
      await positionAction(page, "+00:02:00", "Edit Position");
      await choice(menu, "EV2").click();
      await choice(menu, "Rover").click();
      await menu.getByLabel("Save", { exact: true }).click();
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
      await rowAction(positionRowWithSource(page, "+00:05:00", "C"), page, "Delete Position");
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
      await rowAction(positionRowWithSource(page, "+00:05:00", "R"), page, "Edit Position");
      await rowAction(positionRowWithSource(peer, "+00:05:00", "R"), peer, "Edit Position");
      await choice(menu, "EV1").click();
      await choice(peerMenu, "Crew").click();
      await Promise.all([
        menu.getByLabel("Save", { exact: true }).click(),
        peerMenu.getByLabel("Save", { exact: true }).click(),
      ]);
      const retainedIds = [mission.ids.posB, mainEntry!.uuid].sort();
      await expect
        .poll(async () =>
          (await mission.read()).rexes[mission.ids.rexB].posEntries.find(
            (entry) => entry.uuid === mainEntry!.uuid
          )
        )
        .toMatchObject({
          location: mainEntry!.location,
          petSeconds: mainEntry!.petSeconds,
          createdAt: mainEntry!.createdAt,
          posTypeUuids: [SECOND_TYPE, mission.ids.posType],
          posSourceUuid: mission.ids.posSource,
        });
      const convergedRex = (await mission.read()).rexes[mission.ids.rexB];
      const concurrentEntries = convergedRex.posEntries;
      expect(concurrentEntries.map((entry) => entry.uuid).sort()).toEqual(retainedIds);
      expect(concurrentEntries.find((entry) => entry.uuid === mission.ids.posB)).toEqual(
        originalBeforeConcurrentSaves
      );
      const convergedEntry = concurrentEntries.find((entry) => entry.uuid === mainEntry!.uuid)!;
      for (const entry of concurrentEntries) {
        expect(entry.posTypeUuids.length).toBeGreaterThan(0);
        for (const typeUuid of entry.posTypeUuids) {
          expect(convergedRex.posTypes.map((type) => type.uuid)).toContain(typeUuid);
        }
        expect(convergedRex.posSources.map((source) => source.uuid)).toContain(entry.posSourceUuid);
      }
      for (const client of [page, peer]) {
        await expect(positionRowWithSource(client, "+00:05:00", "C")).toContainText("EV1, EV2");
      }

      peer.once("dialog", (dialog) => dialog.accept());
      await rowAction(positionRow(peer, "+00:02:00"), peer, "Delete Position");
      await expect(positionRow(page, "+00:02:00")).toHaveCount(0);
      const finalRex = (await mission.read()).rexes[mission.ids.rexB];
      expect(finalRex.posEntries).toHaveLength(1);
      expect(finalRex.posEntries[0]).toEqual(convergedEntry);
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
        await expect(positionRowWithSource(client, "+00:05:00", "C")).toContainText("EV1, EV2");
      }
      const afterReload = (await mission.read()).rexes[mission.ids.rexB].posEntries[0];
      expect(afterReload).toEqual(convergedEntry);
      await expectPositionMarker(page, mainEntry!.uuid, mainLocation);
      await expectPositionMarker(peer, mainEntry!.uuid, mainLocation);
    });
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toHaveLength(1);
  });
});
