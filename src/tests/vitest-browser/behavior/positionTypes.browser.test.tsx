import { vi } from "vitest";
import { commands } from "vitest/browser";
import { isVisible } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import { test as base, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";
import { seedPosEntry } from "tests/playwright/fixtures/entitySeeds";
import { BEHAVIORAL_NOW } from "tests/playwright/fixtures/missionSeed";

const SECOND_TYPE = "30000000-0000-4000-8000-000000000021";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

async function selectExecution(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await page.getByLabelText("evas Section", { exact: true }).click();
  const showAll = page.getByLabelText("Show All EVAs", { exact: true });
  if (await isVisible(showAll)) await showAll.click();
  const eva = page.getByLabelText("evaList-item", { exact: true }).filter({ hasText: plannedName });
  await expect.poll(() => eva.length).toBe(1);
  await eva.getBySelector("select").selectOptions(evaUuid);
}

function typeRows(page: Page): Locator {
  return page
    .getBySelector('div[aria-label="Position Marker Name"]')
    .getBySelector("xpath=ancestor::li");
}

function namedTypeRow(page: Page, name: string): Locator {
  return page
    .getBySelector('div[aria-label="Position Marker Name"]')
    .filter({ hasText: name })
    .getBySelector("xpath=ancestor::li");
}

async function updateTypeField(
  page: Page,
  row: Locator,
  label: "Position Marker Name" | "Position Marker Abbr.",
  value: string
): Promise<void> {
  await row.getBySelector(`div[aria-label="${label}"]`).click();
  const dialog = page.getBySelector("dialog[open]");
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
}

async function openPositionTypes(page: Page): Promise<void> {
  await page.getByLabelText("rex_positions_panel", { exact: true }).click();
  await expect
    .element(page.getByText("REX Position Types and Sources", { exact: true }))
    .toBeVisible();
  const editToggle = page.getByLabelText("globalEditToggle", { exact: true });
  if ((await editToggle.element().getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await editToggle.click();
  }
  await expect.element(editToggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

async function openPositions(page: Page, mission: BrowserMission): Promise<Locator> {
  await mission.open();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  const menu = page.getByTestId("positions-menu");
  await expect.element(menu).toMatchTextContent("Survey Bravo - Active Bravo");
  await menu.getByText("All Positions", { exact: true }).click();
  await expect.poll(() => menu.getBySelector("table").length).toBe(2);
  await page.getByTestId("map-menu-launcher").click();
  const visibility = page.getByTestId("map-menu-floating-panel");
  const sourceRow = visibility
    .getBySelector('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" });
  await sourceRow.getByText("All", { exact: true }).click();
  await visibility.getBySelector('svg[data-icon="xmark"]').click();
  return menu;
}

async function createPositionWithBeacon(
  page: Page,
  menu: Locator,
  point: AEGISPoint
): Promise<void> {
  await choice(menu, "EV1").click();
  await menu.getByLabelText("New Pos.", { exact: true }).click();
  await expect.element(menu.getByLabelText("Cancel Pos.", { exact: true })).toBeVisible();
  await choice(menu, "Beacon").click();
  await choice(menu, "EV1").click();
  await placePosition(page, point);
  await expect.poll(() => menu.getByLabelText("Cancel Pos.", { exact: true }).length).toBe(0);
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

async function placePosition(page: Page, point: AEGISPoint): Promise<void> {
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
  expect(hitIsMap, "The placement click must hit the map canvas").toBe(true);
  await commands.mapPointer("click", pixel.x, pixel.y);
}

async function pathColor(page: Page, id: string): Promise<string | undefined> {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  for (const layer of map?.getLayers().getArray() ?? []) {
    const source = (layer as VectorLayer).getSource?.();
    const feature = source && "getFeatureById" in source ? source.getFeatureById(id) : null;
    if (feature) return feature.get("color");
  }
  return undefined;
}

test("position types create, rename, reorder, style, guard used deletion and update map labels and paths", async ({
  page,
  mission,
}) => {
  const older = seedPosEntry({
    uuid: "30000000-0000-4000-8000-000000000022",
    location: { lat: 0.0006, lng: 0.0012 },
    petSeconds: 60,
    posTypeUuids: [SECOND_TYPE],
    posSourceUuid: mission.ids.posSource,
    createdAt: Date.parse(BEHAVIORAL_NOW) - 60_000,
  });
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.posTypes.push({
      uuid: SECOND_TYPE,
      name: "EV2",
      abbr: "2",
      icon: "1f469-200d-1f680",
      pathColor: "#0000ff",
    });
    rex.posEntries[0].posTypeUuids.push(SECOND_TYPE);
    rex.posEntries.push(older);
  });
  const before = await mission.read();

  await mission.open();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await openPositionTypes(page);
  expect((await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)).toEqual([
    mission.ids.posType,
    SECOND_TYPE,
  ]);
  const secondType = namedTypeRow(page, "EV2");
  await updateTypeField(page, secondType, "Position Marker Name", "Tool");
  await updateTypeField(page, namedTypeRow(page, "Tool"), "Position Marker Abbr.", "T");

  const toolRow = namedTypeRow(page, "Tool");
  await toolRow.getBySelector('[class*="propertyIconDisplay"]').click();
  const iconDialog = page.getBySelector("dialog[open]");
  const emojiSearch = iconDialog.getBySelector('input[type="search"]');
  await emojiSearch.fill("rocket");
  await iconDialog.getByRole("button", { name: "🚀", exact: true }).click();
  await expect.poll(() => iconDialog.length).toBe(0);

  await namedTypeRow(page, "Tool").getBySelector('[class*="propertyPathColor"]').click();
  const swatch = page.getBySelector('[class*="colorPickerMenu"] [title="#F44E3B"]');
  await expect.element(swatch).toBeVisible();
  await swatch.click();
  await page.getBySelector('[class*="colorPickerCover"]').click();
  await expect
    .poll(async () =>
      (await mission.read()).rexes[mission.ids.rexB].posTypes
        .find((type) => type.uuid === SECOND_TYPE)
        ?.pathColor?.toLowerCase()
    )
    .toBe("#f44e3b");
  expect(
    (await mission.read()).rexes[mission.ids.rexB].posTypes.find(
      (type) => type.uuid === SECOND_TYPE
    )
  ).toMatchObject({ name: "Tool", abbr: "T", icon: "1f680" });

  const typeOrder = async () =>
    (await mission.read()).rexes[mission.ids.rexB].posTypes.map((t) => t.uuid);
  const currentRows = typeRows(page);
  const moveHandle = await currentRows
    .nth(1)
    .getBySelector("a.rexTypeReorder")
    .element()
    .getBoundingClientRect();
  const firstRow = await currentRows.nth(0).element().getBoundingClientRect();
  await commands.mapPointer(
    "move",
    moveHandle.x + moveHandle.width / 2,
    moveHandle.y + moveHandle.height / 2
  );
  await commands.mapPointer("down");
  await commands.mapPointer(
    "move",
    firstRow.x + firstRow.width / 2,
    firstRow.y + firstRow.height / 3,
    12
  );
  await commands.mapPointer("up");
  await expect.poll(typeOrder).toEqual([SECOND_TYPE, mission.ids.posType]);

  vi.spyOn(window, "alert").mockImplementationOnce((message) => {
    expect(String(message)).toContain("This Position Item Type is being used");

    return true;
  });
  await namedTypeRow(page, "Tool").getBySelector('svg[data-icon="trash-can"]').click();
  expect((await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)).toEqual([
    SECOND_TYPE,
    mission.ids.posType,
  ]);

  await page.getByLabelText("Add Position Marker", { exact: true }).click();
  await expect.poll(typeOrder).toHaveLength(3);
  const addedTypeId = (await mission.read()).rexes[mission.ids.rexB].posTypes[2].uuid;
  await updateTypeField(page, typeRows(page).nth(2), "Position Marker Name", "Beacon");
  await updateTypeField(page, namedTypeRow(page, "Beacon"), "Position Marker Abbr.", "B");
  expect(
    (await mission.read()).rexes[mission.ids.rexB].posTypes.find(
      (type) => type.uuid === addedTypeId
    )
  ).toMatchObject({ name: "Beacon", abbr: "B" });

  const menu = await openPositions(page, mission);
  const beaconLocation = { lat: -0.0004, lng: 0.0014 };
  await createPositionWithBeacon(page, menu, beaconLocation);
  const rexAfterPlacement = (await mission.read()).rexes[mission.ids.rexB];
  const beaconEntry = rexAfterPlacement.posEntries.find(
    (entry) => entry.posTypeUuids.length === 1 && entry.posTypeUuids[0] === addedTypeId
  );
  expect(beaconEntry).toMatchObject({
    posTypeUuids: [addedTypeId],
    posSourceUuid: mission.ids.posSource,
    location: {
      lat: expect.closeTo(beaconLocation.lat, 7),
      lng: expect.closeTo(beaconLocation.lng, 7),
    },
  });

  vi.spyOn(window, "alert").mockImplementationOnce((message) => {
    expect(String(message)).toContain("This Position Item Type is being used");

    return true;
  });
  await openPositionTypes(page);
  await namedTypeRow(page, "Beacon").getBySelector('svg[data-icon="trash-can"]').click();
  expect(
    (await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)
  ).toContain(addedTypeId);

  await page.getByLabelText("rex_positions_panel", { exact: true }).click();
  await page.getByLabelText("Add Position Marker", { exact: true }).click();
  await expect.poll(typeOrder).toHaveLength(4);
  const unusedTypeId = (await mission.read()).rexes[mission.ids.rexB].posTypes[3].uuid;
  await typeRows(page).nth(3).getBySelector('svg[data-icon="trash-can"]').click();
  await expect.poll(typeOrder).toHaveLength(3);
  expect(
    (await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)
  ).not.toContain(unusedTypeId);

  const afterTypeCrud = await mission.read();
  expect(afterTypeCrud.stations).toEqual(before.stations);
  expect(afterTypeCrud.traverses).toEqual(before.traverses);
  expect(afterTypeCrud.actions).toEqual(before.actions);
  expect(afterTypeCrud.evas).toEqual(before.evas);
  await openPositions(page, mission);
  await expect
    .poll(
      async () =>
        (await readMapFeatures()).find(
          (feature) => feature.id === `pos-${beaconEntry!.uuid}` && feature.labelType === "pos"
        )?.name
    )
    .toContain("B");
  await expect.poll(async () => pathColor(page, `posPath-${SECOND_TYPE}-latest`)).toBe("#f44e3b");

  await mission.open();
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect.element(page.getByLabelText("rex_positions_panel", { exact: true })).toBeVisible();
  await page.getByLabelText("rex_positions_panel", { exact: true }).click();
  await expect.element(namedTypeRow(page, "Tool")).toMatchTextContent("T");
  expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
    afterTypeCrud.rexes[mission.ids.rexB].posEntries
  );
});
