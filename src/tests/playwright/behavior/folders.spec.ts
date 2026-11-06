import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningSection,
  selectPlanningStation,
} from "./planningHelpers";

async function markerIds(page: Page) {
  return (await readMapFeatures(page))
    .filter((feature) => feature.visible && feature.layerZIndex === 14)
    .map((feature) => feature.id)
    .sort();
}
function folder(page: Page, name: string) {
  return page
    .locator('[class*="folderContainer"]')
    .filter({ has: page.getByText(name, { exact: true }) });
}
async function dragPointerTo(source: Locator, target: Locator) {
  // A completed drop can still animate its overlay over the next source row.
  await expect(source.page().locator('[class*="dragOverlay"]')).toHaveCount(0);
  await source.hover();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error("Folder drag source must be visible");
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const mouse = source.page().mouse;
  await mouse.move(start.x, start.y);
  await mouse.down();
  await mouse.move(start.x + 8, start.y);
  await expect(source).toHaveClass(/isDragging/);

  // Dnd-kit updates layout when the drag activates, so resolve the drop target afterward.
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Folder drag target must be visible");
  const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
  await mouse.move(end.x, end.y, { steps: 10 });
  await expect(target).toHaveClass(/droppable/);
  await mouse.up();
}

test("folder visibility reaches a peer while selection stays local and membership persists", async ({
  page,
  context,
  mission,
}) => {
  const items = [mission.ids.stationA, mission.ids.stationB];
  await mission.change((doc) => {
    doc.folders[mission.ids.folderA] = seedFolder({
      uuid: mission.ids.folderA,
      name: "Shared sites",
      type: "station",
      items,
    });
  });
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPlanningSection(page, "station");
  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await openPlanningSection(peer, "station");
  await folder(page, "Shared sites").locator('svg[data-icon="ellipsis-vertical"]').click();
  await page
    .locator("dialog[open]")
    .getByText("Hide Folder Contents on Map", { exact: true })
    .click();
  await expect.poll(() => markerIds(page)).toEqual([]);
  await expect.poll(() => markerIds(peer)).toEqual([]);
  await selectPlanningStation(page, "Alpha station");
  await expect.poll(() => markerIds(page)).toEqual([mission.ids.stationA]);
  await expect.poll(() => markerIds(peer)).toEqual([]);
  await mission.open(peer);
  await openPlanningSection(peer, "station");
  await expect.poll(() => markerIds(peer)).toEqual([]);
  await folder(page, "Shared sites").locator('svg[data-icon="ellipsis-vertical"]').click();
  await page
    .locator("dialog[open]")
    .getByText("Show Folder Contents on Map", { exact: true })
    .click();
  await expect.poll(() => markerIds(peer)).toEqual([...items].sort());
  expect((await mission.read()).folders[mission.ids.folderA]).toMatchObject({
    items,
    visible: true,
  });
  for (const key of ["pois", "stations", "evas", "traverses", "actions"] as const)
    expect((await mission.read())[key]).toEqual(before[key]);
});

test("folder drops publish one membership to a connected peer and survive a server-backed reload", async ({
  page,
  context,
  mission,
}) => {
  const first = "40000000-0000-4000-8000-000000000002";
  const second = "50000000-0000-4000-8000-000000000002";
  await mission.change((doc) => {
    doc.folders = {
      [first]: seedFolder({ uuid: first, name: "Alpha folder", type: "station" }),
      [second]: seedFolder({ uuid: second, name: "Bravo folder", type: "station" }),
    };
  });
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPlanningSection(page, "station");
  const peer = await context.newPage();
  await mission.open(peer);
  await openPlanningSection(peer, "station");
  const source = () =>
    page
      .getByLabel("stationList-item", { exact: true })
      .filter({ hasText: "Alpha station" })
      .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
      .first();
  for (const [name, uuid] of [
    ["Alpha folder", first],
    ["Bravo folder", second],
  ] as const) {
    await dragPointerTo(source(), folder(page, name));
    await expect
      .poll(async () => (await mission.read()).folders[uuid].items)
      .toEqual([mission.ids.stationA]);
    await expect(
      folder(peer, name)
        .getByLabel("stationList-item", { exact: true })
        .filter({ hasText: "Alpha station" })
    ).toHaveCount(1);
  }
  expect((await mission.read()).folders[first].items).toEqual([]);
  await dragPointerTo(source(), page.locator('[class*="rootDroppableArea"]'));
  await expect.poll(async () => (await mission.read()).folders[second].items).toEqual([]);
  await expect(
    folder(peer, "Bravo folder").getByLabel("stationList-item", { exact: true })
  ).toHaveCount(0);
  await expect(
    peer
      .locator('[class*="rootDroppableArea"]')
      .getByLabel("stationList-item", { exact: true })
      .filter({ hasText: "Alpha station" })
  ).toHaveCount(1);
  await mission.open(peer);
  await openPlanningSection(peer, "station");
  await expect(
    peer
      .locator('[class*="rootDroppableArea"]')
      .getByLabel("stationList-item", { exact: true })
      .filter({ hasText: "Alpha station" })
  ).toHaveCount(1);
  const after = await mission.read();
  expect(after.folders[first].items).toEqual([]);
  expect(after.folders[second].items).toEqual([]);
  for (const key of ["pois", "stations", "evas", "presets", "traverses", "actions"] as const)
    expect(after[key]).toEqual(before[key]);
});
