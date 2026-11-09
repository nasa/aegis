import { exactText } from "./browserAssertions";
import { commands } from "vitest/browser";
import type { BrowserPage as Page, Locator } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedFolder } from "tests/playwright/fixtures/entitySeeds";
import { enablePlanningEditMode, openPlanningSection } from "./planningHelpers";
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
  await page.getByLabelText("preset Section", { exact: true }).click();
  await expect
    .element(page.getByLabelText("leftPanelTitle", { exact: true }))
    .toMatchTextContent(exactText("Map Display Presets"));
}

function folderRow(page: Page, rowLabel: string, name: string) {
  return page.getByLabelText(rowLabel, { exact: true }).filter({ hasText: name });
}

function folderByName(page: Page, name: string) {
  return page.getBySelector('[class*="folderContainer"]').filter({
    has: page.getByText(name, { exact: true }),
  });
}

async function dragPointerTo(source: Locator, target: Locator) {
  await expect.poll(() => document.querySelectorAll('[class*="dragOverlay"]').length).toBe(0);
  await source.hover();
  const sourceBox = source.element().getBoundingClientRect();
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  await commands.mapPointer("move", start.x, start.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", start.x + 8, start.y);
  await expect.element(source).toHaveClass(/isDragging/);
  const targetBox = target.element().getBoundingClientRect();
  await commands.mapPointer(
    "move",
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    10
  );
  await expect.element(target).toHaveClass(/droppable/);
  await commands.mapPointer("up");
}

test.describe("Folder drag membership", () => {
  for (const { type, section, rowLabel, itemIds } of folderCases) {
    test(`${type} items move between folders and root exactly once across remount`, async ({
      page,
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
      await mission.open();
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
        rows[0].getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
        folderByName(page, "Alpha folder")
      );
      await expect
        .poll(async () => (await mission.read()).folders[firstUuid].items)
        .toEqual([ids[0]]);
      if (ids.length > 1) {
        await dragPointerTo(
          rows[1].getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
          folderByName(page, "Alpha folder")
        );
        await expect.poll(async () => (await mission.read()).folders[firstUuid].items).toEqual(ids);
        await dragPointerTo(
          folderRow(page, rowLabel, itemNames[0])
            .getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]")
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
            .getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]")
            .first(),
          folderByName(page, "Bravo folder")
        );
        await expect
          .poll(async () => (await mission.read()).folders[secondUuid].items)
          .toEqual([ids[0]]);
      }

      if (ids.length > 1) {
        await dragPointerTo(
          rows[1].getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]").first(),
          page.getBySelector('[class*="rootDroppableArea"]')
        );
        await expect.poll(async () => (await mission.read()).folders[firstUuid].items).toEqual([]);
        await expect
          .poll(async () => (await mission.read()).folders[secondUuid].items)
          .toEqual([ids[0]]);
      } else {
        await dragPointerTo(
          folderRow(page, rowLabel, "Reference POI")
            .getBySelector("xpath=ancestor::div[contains(@class, 'draggableItem')]")
            .first(),
          page.getBySelector('[class*="rootDroppableArea"]')
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

      await mission.open();
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
        await expect
          .poll(
            () =>
              folderByName(page, "Bravo folder").getByLabelText(rowLabel, { exact: true }).filter({
                hasText: itemNames[0],
              }).length
          )
          .toBe(1);
        await expect
          .poll(
            () =>
              folderByName(page, "Alpha folder").getByLabelText(rowLabel, { exact: true }).length
          )
          .toBe(0);
        await expect
          .poll(
            () =>
              page
                .getBySelector('[class*="rootDroppableArea"]')
                .getByLabelText(rowLabel, { exact: true })
                .filter({ hasText: itemNames[1] }).length
          )
          .toBe(1);
      } else {
        await expect
          .poll(
            () =>
              folderByName(page, "Bravo folder").getByLabelText(rowLabel, { exact: true }).length
          )
          .toBe(0);
        await expect
          .poll(
            () =>
              page
                .getBySelector('[class*="rootDroppableArea"]')
                .getByLabelText(rowLabel, { exact: true })
                .filter({ hasText: itemNames[0] }).length
          )
          .toBe(1);
      }
    });
  }
});
