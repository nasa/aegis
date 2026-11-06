import { userEvent } from "vitest/browser";
import store from "store";
import { vi } from "vitest";
import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
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
    .toHaveTextContent(exactText("Map Display Presets"));
}

function folderByName(page: Page, name: string) {
  return page.getBySelector('[class*="folderContainer"]').filter({
    has: page.getByText(name, { exact: true }),
  });
}

test.describe("Folder lifecycle", () => {
  for (const { type, section, itemIds } of folderCases) {
    test(`${type} folder creation, rename validation, cancellation and guarded deletion persist`, async ({
      page,
      mission,
    }) => {
      const typeIndex = String(folderCases.findIndex((entry) => entry.type === type) + 1).padStart(
        12,
        "0"
      );
      const populatedFolderUuid = `30000000-0000-4000-8000-${typeIndex}`;
      const itemUuid = mission.ids[itemIds[0]];
      await mission.change((doc) => {
        doc.folders = {
          [populatedFolderUuid]: seedFolder({
            uuid: populatedFolderUuid,
            name: "Occupied folder",
            type,
            items: [itemUuid],
          }),
        };
      });
      const before = await mission.read();

      await mission.open();
      await enablePlanningEditMode(page);
      await openFolderSection(page, section);
      await page.getByLabelText("addFolder", { exact: true }).click();

      await expect
        .poll(async () => (await mission.read()).folders)
        .toMatchObject({
          [populatedFolderUuid]: { name: "Occupied folder", items: [itemUuid] },
        });
      const nameInput = page.getByRole("textbox", { name: "Drag/drop items to folder" });
      await expect.element(nameInput).toHaveValue("New Folder");
      const newFolder = page.getBySelector('[class*="folderContainer"]').filter({ has: nameInput });
      // Wait for the debounced Redux value before Save reads it.

      await nameInput.fill("Lifecycle folder");
      await expect
        .poll(() =>
          Object.values(store.getState().interface.foldersInterface).map(
            (folder) => folder.editingNameValue
          )
        )
        .toContain("Lifecycle folder");
      await newFolder.getBySelector("button").click();
      await expect
        .poll(async () => (await mission.read()).folders)
        .toMatchObject({
          [populatedFolderUuid]: { name: "Occupied folder", items: [itemUuid] },
        });
      await expect
        .poll(async () => Object.values((await mission.read()).folders).map((f) => f.name))
        .toContain("Lifecycle folder");
      await mission.open();
      await enablePlanningEditMode(page);
      await openFolderSection(page, section);
      const lifecycleFolder = folderByName(page, "Lifecycle folder");
      const editingFolder = page
        .getBySelector('[class*="folderContainer"]')
        .filter({ has: nameInput });
      await expect.element(lifecycleFolder).toBeVisible();

      // Cancel discards the in-progress name before a later invalid Save attempt.
      await lifecycleFolder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page.getBySelector("dialog[open]").getByText("Rename Folder", { exact: true }).click();
      await nameInput.fill("Unsaved rename");
      await editingFolder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page.getBySelector("dialog[open]").getByText("Cancel", { exact: true }).click();
      await expect
        .poll(async () => Object.values((await mission.read()).folders).map((f) => f.name))
        .toContain("Lifecycle folder");
      await expect
        .element(lifecycleFolder.getByText("Lifecycle folder", { exact: true }))
        .toBeVisible();

      // Duplicate, blank and overlong names fail validation; Save cannot persist them.
      await lifecycleFolder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
      await page.getBySelector("dialog[open]").getByText("Rename Folder", { exact: true }).click();
      await nameInput.fill("Occupied folder");
      await userEvent.tab();
      await expect
        .element(page.getBySelector('[data-tooltip-content="Name must be unique"]'))
        .toBeVisible();
      await editingFolder.getBySelector("button").click();
      for (const [invalidName, validationMessage] of [
        ["", "Required"],
        [
          "A folder name that is longer than twenty-four chars",
          "Must be at no more than 24 characters",
        ],
      ]) {
        await lifecycleFolder.getBySelector('svg[data-icon="ellipsis-vertical"]').click();
        await page
          .getBySelector("dialog[open]")
          .getByText("Rename Folder", { exact: true })
          .click();
        await nameInput.fill(invalidName);
        await userEvent.tab();
        await expect
          .element(page.getBySelector(`[data-tooltip-content="${validationMessage}"]`))
          .toBeVisible();
        await editingFolder.getBySelector("button").click();
        await expect
          .poll(async () => Object.values((await mission.read()).folders).map((f) => f.name))
          .toContain("Lifecycle folder");
      }
      await expect
        .poll(async () => (await mission.read()).folders[populatedFolderUuid].items)
        .toEqual([itemUuid]);

      // Populated deletion is rejected before confirmation and leaves entity membership intact.
      const occupied = folderByName(page, "Occupied folder");
      await occupied
        .getBySelector('[class*="folderMenu"] svg[data-icon="ellipsis-vertical"]')
        .click();
      const alertText = new Promise<string>((resolve) => {
        vi.spyOn(window, "alert").mockImplementationOnce((message) => {
          resolve(String(message));

          return true;
        });
      });
      await page.getBySelector("dialog[open]").getByText("Delete Folder", { exact: true }).click();
      expect(await alertText).toBe("Cannot delete folder with items in it");
      await expect
        .poll(async () => (await mission.read()).folders[populatedFolderUuid].items)
        .toEqual([itemUuid]);

      // Cancel and then accept the confirmation for the empty folder.
      const emptyUuid = Object.entries((await mission.read()).folders).find(
        ([uuid, folder]) => uuid !== populatedFolderUuid && folder.name === "Lifecycle folder"
      )?.[0];
      expect(emptyUuid).toBeTruthy();
      const emptyFolder = folderByName(page, "Lifecycle folder");
      await emptyFolder
        .getBySelector('[class*="folderMenu"] svg[data-icon="ellipsis-vertical"]')
        .click();
      vi.spyOn(window, "confirm").mockReturnValueOnce(false);
      await page.getBySelector("dialog[open]").getByText("Delete Folder", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).folders[emptyUuid!]).toBeTruthy();
      await emptyFolder
        .getBySelector('[class*="folderMenu"] svg[data-icon="ellipsis-vertical"]')
        .click();
      vi.spyOn(window, "confirm").mockReturnValueOnce(true);
      await page.getBySelector("dialog[open]").getByText("Delete Folder", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).folders[emptyUuid!]).toBeUndefined();

      await mission.open();
      await openFolderSection(page, section);
      const afterReload = await mission.read();
      expect(afterReload.folders[populatedFolderUuid]).toMatchObject({
        name: "Occupied folder",
        type,
        items: [itemUuid],
      });
      expect(
        Object.values(afterReload.folders).some((folder) => folder.name === "Lifecycle folder")
      ).toBe(false);
      for (const key of ["pois", "stations", "evas", "presets", "traverses", "actions"] as const) {
        expect(afterReload[key]).toEqual(before[key]);
      }
      for (const id of itemIds)
        expect(
          afterReload[
            type === "poi"
              ? "pois"
              : type === "station"
                ? "stations"
                : type === "eva"
                  ? "evas"
                  : "presets"
          ][mission.ids[id]]
        ).toBeTruthy();
    });
  }
});
