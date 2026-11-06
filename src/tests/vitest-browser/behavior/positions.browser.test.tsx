import { vi } from "vitest";
import { commands } from "vitest/browser";
import { exactText } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { BEHAVIORAL_NOW } from "tests/playwright/fixtures/missionSeed";
import { seedPosEntry } from "tests/playwright/fixtures/entitySeeds";
import { readMapFeatures } from "./mapObserver";
import { selectExecution } from "./executionHelpers";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

const SECOND_TYPE = "30000000-0000-4000-8000-000000000001";
const SECOND_SOURCE = "30000000-0000-4000-8000-000000000002";
const THIRD_SOURCE = "30000000-0000-4000-8000-000000000009";
const EARLIER_POSITION = "30000000-0000-4000-8000-000000000003";
const OTHER_POSITION = "30000000-0000-4000-8000-000000000004";

async function arrangePositionChoices(mission: BrowserMission, ticking = false): Promise<void> {
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
function controlClock(): void {
  sessionStorage.setItem("timeOffsetMs", "0");
  vi.setSystemTime(new Date(BEHAVIORAL_NOW));
}

async function openPositions(page: Page, mission: BrowserMission): Promise<Locator> {
  await mission.open();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const menu = page.getByTestId("positions-menu");
  await expect.element(menu).toHaveTextContent("Survey Bravo - Active Bravo");
  await menu.getByText("All Positions", { exact: true }).click();
  await expect.poll(() => menu.getBySelector("table").length).toBe(2);
  // The application defaults to Task/Crew sources; these cases also use Rover.
  // Move the position menu away from the visibility launcher using its drag handle.
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  const allSources = visibility
    .getBySelector('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" })
    .getByText("All", { exact: true });
  await allSources.click();
  await expect.element(allSources).toHaveClass(/toggleSelected/);
  await visibility.getBySelector('svg[data-icon="xmark"]').click();
  return menu;
}

function positionRow(page: Page, pet: string): Locator {
  return page
    .getByTestId("positions-menu")
    .getBySelector("table")
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
  await positionRow(page, pet).getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText(action, { exact: true }).click();
}

async function rowAction(row: Locator, page: Page, action: string): Promise<void> {
  await row.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText(action, { exact: true }).click();
}

function choice(menu: Locator, name: string): Locator {
  return menu.getBySelector(`[data-tooltip-content="${name}"]`);
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
        (await readMapFeatures()).find(
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
      (() =>
        window.__aegisMaps
          .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
          .map.getView()
          .getAnimating())()
    )
    .toBe(false);
  const pixel = await ((coordinate) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    const [x, y] = map.getPixelFromCoordinate(coordinate);
    const bounds = map.getTargetElement().getBoundingClientRect();
    return { x: bounds.left + x, y: bounds.top + y };
  })(projected(point));
  const hitIsMap = await (({ x, y }) => {
    return !!document.elementFromPoint(x, y)?.closest(".ol-viewport canvas");
  })(pixel);
  expect(hitIsMap, "The placement gesture must land on the map canvas, clear of menus").toBe(true);
  await commands.mapPointer("click", pixel.x, pixel.y);
}

async function createPosition(
  page: Page,
  menu: Locator,
  location: AEGISPoint,
  source: string
): Promise<void> {
  // New Pos requires at least one type already selected before placement starts.
  await choice(menu, "EV1").click();
  await menu.getByLabelText("New Pos.", { exact: true }).click();
  await expect.element(menu.getByLabelText("Cancel Pos.", { exact: true })).toBeVisible();
  await choice(menu, "EV2").click();
  await choice(menu, "EV1").click();
  await choice(menu, source).click();
  await placePosition(page, location);
  await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
}

async function withMapVisibility(
  page: Page,
  run: (panel: Locator) => Promise<void>
): Promise<void> {
  await page.getByTestId("map-menu-launcher").click();
  const panel = page.getByTestId("map-menu-floating-panel");
  await run(panel);
  await panel.getBySelector('svg[data-icon="xmark"]').click();
}

function positionSourceRow(page: Page, name: string): Locator {
  return page
    .getBySelector('div[aria-label="Position Source Name"]')
    .filter({ hasText: name })
    .getBySelector("xpath=ancestor::li");
}

async function updatePositionSourceField(
  page: Page,
  name: string,
  label: "Position Source Name" | "Position Source Abbr.",
  value: string
): Promise<void> {
  await positionSourceRow(page, name).getBySelector(`div[aria-label="${label}"]`).click();
  const dialog = page.getBySelector("dialog[open]");
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
}

async function deletePositionSource(
  page: Page,
  name: string,
  expectedAlert?: string
): Promise<void> {
  if (expectedAlert) {
    vi.spyOn(window, "alert").mockImplementationOnce((message) => {
      expect(String(message)).toBe(expectedAlert);

      return true;
    });
  }
  await positionSourceRow(page, name).getBySelector('svg[data-icon="trash-can"]').click();
}

test.describe("Execution position contracts", () => {
  for (const ticking of [true, false]) {
    test(`New Pos captures ${ticking ? "ticking" : "paused"} PET before placement and saves the selected types and source`, async ({
      page,
      mission,
    }) => {
      await arrangePositionChoices(mission, ticking);
      await controlClock();
      const before = await mission.read();
      const menu = await openPositions(page, mission);
      await expect
        .element(page.getByTestId("header-pet-clock"))
        .toHaveTextContent(exactText("+00:05:00"));
      await choice(menu, "EV1").click();
      await menu.getByLabelText("New Pos.", { exact: true }).click();
      await expect.element(menu.getByLabelText("Cancel Pos.", { exact: true })).toBeVisible();
      expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
        before.rexes[mission.ids.rexB].posEntries
      );

      await vi.setSystemTime(new Date(Date.parse(BEHAVIORAL_NOW) + 90_000));
      await expect
        .element(page.getByTestId("header-pet-clock"))
        .toHaveTextContent(exactText(ticking ? "+00:06:30" : "+00:05:00"));
      // Changes made after New Pos belong to the draft; PET remains the captured value.
      await choice(menu, "EV2").click();
      await choice(menu, "EV1").click();
      await choice(menu, "Rover").click();
      const location = { lat: -0.0006, lng: 0.001 };
      await placePosition(page, location);
      await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
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
      await expect.element(positionRow(page, "+00:05:00")).toHaveTextContent("EV2");
      await expect
        .element(positionRow(page, "+00:05:00").getByRole("cell", { name: "R", exact: true }))
        .toBeVisible();
      await expectPositionMarker(page, created.uuid, location);

      await openPositions(page, mission);
      await expect.element(positionRow(page, "+00:05:00")).toHaveTextContent("EV2");
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
    await menu.getByLabelText("New Pos.", { exact: true }).click();
    await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
    await choice(menu, "EV2").click();
    await choice(menu, "Rover").click();
    await menu.getByLabelText("New Pos.", { exact: true }).click();
    await expect.element(menu.getByLabelText("Cancel Pos.", { exact: true })).toBeVisible();
    await menu.getByLabelText("Cancel Pos.", { exact: true }).click();
    await expect.element(menu.getByLabelText("New Pos.", { exact: true })).toBeVisible();
    await placePosition(page, { lat: -0.0006, lng: 0.001 });
    expect(await mission.read()).toEqual(before);
    await expect.poll(() => positionRow(page, "+00:02:00").length).toBe(1);
    await openPositions(page, mission);
    expect(await mission.read()).toEqual(before);
    await expectPositionMarker(
      page,
      mission.ids.posB,
      before.rexes[mission.ids.rexB].posEntries[0].location
    );
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
      (await readMapFeatures()).filter((feature) => feature.id.startsWith("posPath-"));
    await expect
      .poll(async () => (await paths()).map((feature) => feature.coordinates))
      .toEqual([
        [earlier.location, before.rexes[mission.ids.rexB].posEntries[0].location].map((point) =>
          projected(point).map((coordinate) => expect.closeTo(coordinate, 5))
        ),
      ]);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await positionAction(page, "+00:02:00", "Delete Entry");
    await expect.element(positionRow(page, "+00:02:00")).toBeVisible();
    expect(await mission.read()).toEqual(before);

    vi.spyOn(window, "confirm").mockImplementationOnce((message) => {
      expect(String(message)).toBe("Are you sure you want to delete this Crew Position?");

      return true;
    });
    await positionAction(page, "+00:02:00", "Delete Entry");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
      .toEqual([earlier, other]);
    await expect.poll(() => positionRow(page, "+00:02:00").length).toBe(0);
    await expect.poll(paths).toEqual([]);
    await expect
      .poll(async () =>
        (await readMapFeatures()).filter(
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
    await expect.poll(() => positionRow(page, "+00:02:00").length).toBe(0);
    await expect.element(positionRow(page, "+00:01:00")).toBeVisible();
    await expect.element(positionRow(page, "+00:01:30")).toBeVisible();
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
      (await readMapFeatures())
        .filter(
          (feature) =>
            [older.uuid, mission.ids.posB, newer.uuid].includes(feature.id) &&
            feature.geometryType === "Point" &&
            feature.visible
        )
        .map((feature) => feature.id)
        .sort();
    const paths = async () =>
      (await readMapFeatures()).filter(
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
        .getBySelector('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      const crewSource = sourceRow.getBySelector('[data-tooltip-content="Crew"]');
      await crewSource.click();
      await expect.element(crewSource).toHaveClass(/toggleSelected/);
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
        .getBySelector('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      await sourceRow.getByText("All", { exact: true }).click();
      const roverSource = sourceRow.getBySelector('[data-tooltip-content="Rover"]');
      await roverSource.click();
      await expect.element(roverSource).toHaveClass(/toggleSelected/);
    });
    await expect.poll(markers).toEqual([newer.uuid]);
    await expect.poll(paths).toEqual([]);
    await expectPositionMarker(page, newer.uuid, newer.location);

    // The selected historical execution owns a separate position stream.
    await withMapVisibility(page, async (visibility) => {
      const sourceRow = visibility
        .getBySelector('[class*="toggleMenuItemRow"]')
        .filter({ hasText: "Sources" });
      await sourceRow.getByText("All", { exact: true }).click();
    });
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expect.element(menu).toHaveTextContent("Survey Alpha - Stopped Alpha");
    await expectPositionMarker(
      page,
      mission.ids.posA,
      (await mission.read()).rexes[mission.ids.rexA].posEntries[0].location
    );
    await expect
      .poll(async () =>
        (await readMapFeatures())
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
    await expect
      .element(page.getBySelector('div[aria-label="EVA Title"]'))
      .toHaveTextContent(exactText("Survey Alpha"));
    await expect
      .poll(async () =>
        (await readMapFeatures()).filter(
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
    await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
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
        { uuid: SECOND_SOURCE, name: "Task", abbr: "T", pathColor: "#0088ff" },
        { uuid: THIRD_SOURCE, name: "SER", abbr: "S", pathColor: "#0088ff" }
      );
    });
    await mission.open();
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabelText("rex_positions_panel", { exact: true }).click();
    await expect
      .element(page.getByText("REX Position Types and Sources", { exact: true }))
      .toBeVisible();
    const editToggle = page.getByLabelText("globalEditToggle", { exact: true });
    await editToggle.click();
    await expect.element(editToggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");

    const rexBeforeAdd = (await mission.read()).rexes[mission.ids.rexB];
    expect(rexBeforeAdd.posSources).toHaveLength(3);
    await page.getByLabelText("Add Position Source", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posSources.length)
      .toBe(4);
    const blankSource = (await mission.read()).rexes[mission.ids.rexB].posSources.find(
      (source) => source.name === "(Blank)"
    );
    expect(blankSource).toMatchObject({ name: "(Blank)", abbr: "B" });

    vi.spyOn(window, "alert").mockImplementationOnce((message) => {
      expect(String(message)).toBe("You can only have a maximum of 4 Position Sources.");

      return true;
    });
    await page.getByLabelText("Add Position Source", { exact: true }).click();
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

    await mission.open();
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabelText("rex_positions_panel", { exact: true }).click();
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
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await rowAction(positionRowWithSource(page, "+00:02:00", "C"), page, "Delete Entry");
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await rowAction(positionRowWithSource(page, "+00:05:00", "F"), page, "Delete Entry");
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
      .toEqual([]);
    await expect.element(positionsMenu.getByLabelText("New Pos.", { exact: true })).toBeVisible();

    await mission.open();
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await page.getByLabelText("rex_positions_panel", { exact: true }).click();
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
      expect.objectContaining({
        uuid: mission.ids.posSource,
        name: "Crew",
        abbr: "C",
        pathColor: "#0088ff",
      }),
    ]);

    await deletePositionSource(page, "Crew", "You must have at least one Position Source.");
    expect((await mission.read()).rexes[mission.ids.rexB].posSources).toEqual([
      expect.objectContaining({
        uuid: mission.ids.posSource,
        name: "Crew",
        abbr: "C",
        pathColor: "#0088ff",
      }),
    ]);

    await mission.open();
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
    await mission.open();
    await openPositions(page, mission);
    await expect.element(positionRowWithSource(page, "+00:05:00", "C")).toBeVisible();
    expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual([
      expect.objectContaining({
        uuid: crewEntry!.uuid,
        posSourceUuid: mission.ids.posSource,
      }),
    ]);
  });
});
