import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function markerIds(page: Page, type: "poi" | "station"): Promise<string[]> {
  return (await readMapFeatures(page))
    .filter((feature) => feature.visible && feature.layerZIndex === (type === "poi" ? 15 : 14))
    .map((feature) => feature.id)
    .sort();
}

test.describe("Folder visibility contracts", () => {
  for (const type of ["poi", "station"] as const) {
    test(`hidden ${type} folders preserve selection exceptions, shared visibility and saved membership`, async ({
      page,
      context,
      mission,
    }) => {
      const folderUuid = "30000000-0000-4000-8000-000000000090";
      const items =
        type === "poi" ? [mission.ids.poiA] : [mission.ids.stationA, mission.ids.stationB];
      await mission.change((doc) => {
        doc.folders = {
          [folderUuid]: seedFolder({ uuid: folderUuid, name: "Hidden sites", type, items }),
        };
      });
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openPlanningSection(page, type);
      const peer = await context.newPage();
      await installMapObserver(peer);
      await mission.open(peer);
      await openPlanningSection(peer, type);
      await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
      await expect.poll(() => markerIds(peer, type)).toEqual([...items].sort());

      const folder = page.locator('[class*="folderContainer"]').filter({ hasText: "Hidden sites" });
      await folder.locator('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .locator("dialog[open]")
        .getByText("Hide Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(async () => (await mission.read()).folders[folderUuid].visible).toBe(false);
      await expect.poll(() => markerIds(page, type)).toEqual([]);
      await expect.poll(() => markerIds(peer, type)).toEqual([]);

      // Folder expansion is local presentation; visibility is a shared mission field.
      await folder.getByText("Hidden sites", { exact: true }).click();
      await expect(folder.getByLabel(`${type}List-item`, { exact: true })).toHaveCount(0);
      await folder.getByText("Hidden sites", { exact: true }).click();
      if (type === "poi") await selectPlanningPoi(page, "Reference POI");
      else await selectPlanningStation(page, "Alpha station");
      await expect.poll(() => markerIds(page, type)).toEqual([items[0]]);
      await expect.poll(() => markerIds(peer, type)).toEqual([]);
      await page
        .getByLabel(`${type}List-item`, { exact: true })
        .getByText(type === "poi" ? "Reference POI" : "Alpha station", { exact: true })
        .click();
      await expect.poll(() => markerIds(page, type)).toEqual([]);

      if (type === "station") {
        await selectPlanningEva(page, "Survey Alpha");
        await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
        await planningEvaRow(page, "Survey Alpha")
          .getByText("Survey Alpha", { exact: true })
          .click();
        await openPlanningSection(page, "station");
        await expect.poll(() => markerIds(page, type)).toEqual([]);
      }

      await mission.open(page);
      await openPlanningSection(page, type);
      await expect.poll(() => markerIds(page, type)).toEqual([]);
      await enablePlanningEditMode(page);
      await folder.locator('svg[data-icon="ellipsis-vertical"]').click();
      await page
        .locator("dialog[open]")
        .getByText("Show Folder Contents on Map", { exact: true })
        .click();
      await expect.poll(() => markerIds(page, type)).toEqual([...items].sort());
      await expect.poll(() => markerIds(peer, type)).toEqual([...items].sort());
      const after = await mission.read();
      expect(after.folders[folderUuid]).toMatchObject({ visible: true, items });
      for (const key of ["pois", "stations", "evas", "traverses", "actions"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
    });
  }
});

const folderCases = [
  { type: "poi", section: "poi", rowLabel: "poiList-item", itemIds: ["poiA"] },
  {
    type: "station",
    section: "station",
    rowLabel: "stationList-item",
    itemIds: ["stationA", "stationB"],
  },
  { type: "eva", section: "evas", rowLabel: "evaList-item", itemIds: ["evaA", "evaB"] },
  { type: "preset", section: "preset", rowLabel: "mapPreset", itemIds: ["presetA", "presetB"] },
] as const;

async function openFolderSection(page: Page, section: (typeof folderCases)[number]["section"]) {
  if (section !== "preset") {
    await openPlanningSection(page, section);
    return;
  }
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toHaveText(
    "Map Display Presets"
  );
}

function folderRow(page: Page, rowLabel: string, name: string) {
  return page.getByLabel(rowLabel, { exact: true }).filter({ hasText: name });
}

function folderByName(page: Page, name: string) {
  return page.locator('[class*="folderContainer"]').filter({
    has: page.getByText(name, { exact: true }),
  });
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

test.describe("Folder drag membership", () => {
  for (const { type, section, rowLabel, itemIds } of folderCases) {
    test(`${type} items move between folders and root exactly once across peer and reload`, async ({
      page,
      context,
      mission,
    }) => {
      const typeIndex = String(folderCases.findIndex((entry) => entry.type === type) + 1).padStart(
        12,
        "0"
      );
      const firstUuid = `40000000-0000-4000-8000-${typeIndex}`;
      const secondUuid = `50000000-0000-4000-8000-${typeIndex}`;
      await mission.change((doc) => {
        doc.folders = {
          [firstUuid]: seedFolder({ uuid: firstUuid, name: "Alpha folder", type }),
          [secondUuid]: seedFolder({ uuid: secondUuid, name: "Bravo folder", type }),
        };
      });
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openFolderSection(page, section);

      const ids = itemIds.map((key) => mission.ids[key]);
      const itemNames = {
        poi: ["Reference POI"],
        station: ["Alpha station", "Bravo station"],
        eva: ["Survey Alpha", "Survey Bravo"],
        preset: ["Overview", "Detail"],
      }[type];
      const rows = itemNames.map((name) => folderRow(page, rowLabel, name));
      await dragPointerTo(
        rows[0].locator("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
        folderByName(page, "Alpha folder")
      );
      await expect
        .poll(async () => (await mission.read()).folders[firstUuid].items)
        .toEqual([ids[0]]);
      if (ids.length > 1) {
        await dragPointerTo(
          rows[1].locator("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
          folderByName(page, "Alpha folder")
        );
        await expect.poll(async () => (await mission.read()).folders[firstUuid].items).toEqual(ids);
        await dragPointerTo(
          folderRow(page, rowLabel, itemNames[0])
            .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
            .first(),
          folderByName(page, "Bravo folder")
        );
        await expect
          .poll(async () => (await mission.read()).folders[secondUuid].items)
          .toEqual([ids[0]]);
        await expect
          .poll(async () => (await mission.read()).folders[firstUuid].items)
          .toEqual([ids[1]]);
      } else {
        await dragPointerTo(
          folderRow(page, rowLabel, "Reference POI")
            .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
            .first(),
          folderByName(page, "Bravo folder")
        );
        await expect
          .poll(async () => (await mission.read()).folders[secondUuid].items)
          .toEqual([ids[0]]);
      }

      const peer = await context.newPage();
      await installMapObserver(peer);
      await mission.open(peer);
      await openFolderSection(peer, section);
      await expect
        .poll(async () => (await mission.read()).folders[secondUuid].items)
        .toEqual([ids[0]]);
      await expect(
        folderByName(peer, "Bravo folder").getByLabel(rowLabel, { exact: true }).filter({
          hasText: itemNames[0],
        })
      ).toHaveCount(1);
      if (ids.length > 1) {
        await dragPointerTo(
          rows[1].locator("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
          page.locator('[class*="rootDroppableArea"]')
        );
        await expect.poll(async () => (await mission.read()).folders[firstUuid].items).toEqual([]);
        await expect
          .poll(async () => (await mission.read()).folders[secondUuid].items)
          .toEqual([ids[0]]);
      } else {
        await dragPointerTo(
          folderRow(page, rowLabel, "Reference POI")
            .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
            .first(),
          page.locator('[class*="rootDroppableArea"]')
        );
        await expect.poll(async () => (await mission.read()).folders[secondUuid].items).toEqual([]);
      }

      const afterDrag = await mission.read();
      for (const key of ["pois", "stations", "evas", "presets", "traverses", "actions"] as const) {
        expect(afterDrag[key]).toEqual(before[key]);
      }
      const countMemberships = ids.map(
        (id) =>
          Object.values(afterDrag.folders).filter((folder) => folder.items.includes(id)).length
      );
      expect(countMemberships).toEqual(
        ids.map((_, index) => (ids.length > 1 ? (index === 0 ? 1 : 0) : 0))
      );

      // A connected peer observes the final move between root and folders before and after reload.
      if (ids.length > 1) {
        await expect(
          folderByName(peer, "Bravo folder").getByLabel(rowLabel, { exact: true }).filter({
            hasText: itemNames[0],
          })
        ).toHaveCount(1);
        await expect(
          folderByName(peer, "Alpha folder").getByLabel(rowLabel, { exact: true })
        ).toHaveCount(0);
        await expect(
          peer
            .locator('[class*="rootDroppableArea"]')
            .getByLabel(rowLabel, { exact: true })
            .filter({ hasText: itemNames[1] })
        ).toHaveCount(1);
      } else {
        await expect(
          folderByName(peer, "Bravo folder").getByLabel(rowLabel, { exact: true })
        ).toHaveCount(0);
        await expect(
          peer
            .locator('[class*="rootDroppableArea"]')
            .getByLabel(rowLabel, { exact: true })
            .filter({ hasText: itemNames[0] })
        ).toHaveCount(1);
      }

      await mission.open(peer);
      await openFolderSection(peer, section);
      await mission.open(page);
      await openFolderSection(page, section);
      const afterReload = await mission.read();
      expect(afterReload.folders[firstUuid].items).toEqual([]);
      expect(afterReload.folders[secondUuid].items).toEqual(ids.length > 1 ? [ids[0]] : []);
      for (const id of ids) {
        const occurrences = Object.values(afterReload.folders).reduce(
          (count, folder) => count + folder.items.filter((item) => item === id).length,
          0
        );
        expect(occurrences).toBe(ids.length > 1 && id === ids[0] ? 1 : 0);
      }
      if (ids.length > 1) {
        await expect(
          folderByName(peer, "Bravo folder").getByLabel(rowLabel, { exact: true }).filter({
            hasText: itemNames[0],
          })
        ).toHaveCount(1);
        await expect(
          folderByName(peer, "Alpha folder").getByLabel(rowLabel, { exact: true })
        ).toHaveCount(0);
        await expect(
          peer
            .locator('[class*="rootDroppableArea"]')
            .getByLabel(rowLabel, { exact: true })
            .filter({ hasText: itemNames[1] })
        ).toHaveCount(1);
      } else {
        await expect(
          folderByName(peer, "Bravo folder").getByLabel(rowLabel, { exact: true })
        ).toHaveCount(0);
        await expect(
          peer
            .locator('[class*="rootDroppableArea"]')
            .getByLabel(rowLabel, { exact: true })
            .filter({ hasText: itemNames[0] })
        ).toHaveCount(1);
      }
    });
  }
});
