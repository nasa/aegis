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
  await menu.getByText("All Positions", { exact: true }).click();
  await expect(menu.locator("table")).toHaveCount(2);
  // The application defaults to Task/Crew sources; these cases also use Rover.
  // Move the position menu away from the visibility launcher using its drag handle.
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
    .getByTestId("positions-menu")
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

test.describe("Execution position contracts", () => {
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
});
