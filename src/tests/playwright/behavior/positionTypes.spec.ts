import type { Locator, Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { seedPosEntry } from "../fixtures/entitySeeds";
import { BEHAVIORAL_NOW } from "../fixtures/missionSeed";

const SECOND_TYPE = "30000000-0000-4000-8000-000000000021";

test.use({ scenario: "execution" });

async function selectExecution(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const eva = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: plannedName });
  await expect(eva).toHaveCount(1);
  await eva.locator("select").selectOption(evaUuid);
}

function typeRows(page: Page): Locator {
  return page.locator('div[aria-label="Position Marker Name"]').locator("xpath=ancestor::li");
}

function namedTypeRow(page: Page, name: string): Locator {
  return page
    .locator('div[aria-label="Position Marker Name"]')
    .filter({ hasText: name })
    .locator("xpath=ancestor::li");
}

async function updateTypeField(
  page: Page,
  row: Locator,
  label: "Position Marker Name" | "Position Marker Abbr.",
  value: string
): Promise<void> {
  await row.locator(`div[aria-label="${label}"]`).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
}

async function openPositionTypes(page: Page): Promise<void> {
  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  await expect(page.getByText("REX Position Types and Sources", { exact: true })).toBeVisible();
  const editToggle = page.getByLabel("globalEditToggle", { exact: true });
  if ((await editToggle.getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await editToggle.click();
  }
  await expect(editToggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

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
  const sourceRow = visibility
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Sources" });
  await sourceRow.getByText("All", { exact: true }).click();
  await visibility.locator('svg[data-icon="xmark"]').click();
  const moved = await menu.getByTestId("rex-map-menu-drag-handle").boundingBox();
  await page.mouse.move(moved.x + 60, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y + handle.height / 2, { steps: 10 });
  await page.mouse.up();
  return menu;
}

async function createPositionWithBeacon(
  page: Page,
  menu: Locator,
  point: AEGISPoint
): Promise<void> {
  await choice(menu, "EV1").click();
  await menu.getByLabel("New Pos.", { exact: true }).click();
  await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toBeVisible();
  await choice(menu, "Beacon").click();
  await choice(menu, "EV1").click();
  await placePosition(page, point);
  await expect(menu.getByLabel("Cancel Pos.", { exact: true })).toHaveCount(0);
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

async function placePosition(page: Page, point: AEGISPoint): Promise<void> {
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
  expect(hitIsMap, "The placement click must hit the map canvas").toBe(true);
  await page.mouse.click(pixel.x, pixel.y);
}

async function pathColor(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    for (const layer of map?.getLayers().getArray() ?? []) {
      const source = (layer as VectorLayer).getSource?.();
      const feature = source && "getFeatureById" in source ? source.getFeatureById(id) : null;
      if (feature) return feature.get("color");
    }
    return undefined;
  }, id);
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

  await mission.open(page);
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
  await toolRow.locator('[class*="propertyIconDisplay"]').click();
  const iconDialog = page.locator("dialog[open]");
  const emojiSearch = iconDialog.locator('input[type="search"]');
  await emojiSearch.fill("rocket");
  await iconDialog.getByRole("button", { name: "🚀", exact: true }).click();
  await expect(iconDialog).toHaveCount(0);

  await namedTypeRow(page, "Tool").locator('[class*="propertyPathColor"]').click();
  const swatch = page.locator('[class*="colorPickerMenu"] [title="#F44E3B"]');
  await expect(swatch).toBeVisible();
  await swatch.click();
  await page.locator('[class*="colorPickerCover"]').click();
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
  const moveHandle = await currentRows.nth(1).locator("a.rexTypeReorder").boundingBox();
  const firstRow = await currentRows.nth(0).boundingBox();
  await page.mouse.move(moveHandle.x + moveHandle.width / 2, moveHandle.y + moveHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstRow.x + firstRow.width / 2, firstRow.y + firstRow.height / 3, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(typeOrder).toEqual([SECOND_TYPE, mission.ids.posType]);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("This Position Item Type is being used");
    await dialog.accept();
  });
  await namedTypeRow(page, "Tool").locator('svg[data-icon="trash-can"]').click();
  expect((await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)).toEqual([
    SECOND_TYPE,
    mission.ids.posType,
  ]);

  await page.getByLabel("Add Position Marker", { exact: true }).click();
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

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("This Position Item Type is being used");
    await dialog.accept();
  });
  await openPositionTypes(page);
  await namedTypeRow(page, "Beacon").locator('svg[data-icon="trash-can"]').click();
  expect(
    (await mission.read()).rexes[mission.ids.rexB].posTypes.map((type) => type.uuid)
  ).toContain(addedTypeId);

  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  await page.getByLabel("Add Position Marker", { exact: true }).click();
  await expect.poll(typeOrder).toHaveLength(4);
  const unusedTypeId = (await mission.read()).rexes[mission.ids.rexB].posTypes[3].uuid;
  await typeRows(page).nth(3).locator('svg[data-icon="trash-can"]').click();
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
        (await readMapFeatures(page)).find(
          (feature) => feature.id === `pos-${beaconEntry!.uuid}` && feature.labelType === "pos"
        )?.name
    )
    .toContain("B");
  await expect.poll(async () => pathColor(page, `posPath-${SECOND_TYPE}-latest`)).toBe("#f44e3b");

  await mission.open(page);
  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect(page.getByLabel("rex_positions_panel", { exact: true })).toBeVisible();
  await page.getByLabel("rex_positions_panel", { exact: true }).click();
  await expect(namedTypeRow(page, "Tool")).toContainText("T");
  expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
    afterTypeCrud.rexes[mission.ids.rexB].posEntries
  );
});
