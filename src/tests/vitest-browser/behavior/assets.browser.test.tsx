import { vi } from "vitest";
import { commands } from "vitest/browser";
import type { BrowserPage, Locator } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";
import { selectPlanningEva } from "./planningHelpers";
import { waitForMapIdle } from "./mapInteractions";
import store from "store";

async function openAssets(page: BrowserPage): Promise<void> {
  const launcher = page.getByTestId("rex-menu-launcher");
  if (launcher.query()) await launcher.click();
  await page.getBySelector(".dv-tab").filter({ hasText: "Assets" }).click();
  await expect.element(page.getByTestId("assets-map-menu")).toBeVisible();
}

async function editAsset(row: Locator, page: BrowserPage): Promise<void> {
  await row.getByRole("button", { name: "Asset actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit Asset", exact: true }).click();
}

test("invalid asset drafts cannot save and Cancel removes their preview and pending map edit", async ({
  page,
  mission,
}) => {
  await mission.open();
  await openAssets(page);
  await page.getByTestId("assets-map-menu").getByLabelText("Asset", { exact: true }).click();
  const editor = page.getByTestId("asset-editor");
  const save = editor.getByLabelText("Save", { exact: true });
  await expect.element(save).toHaveAttribute("aria-disabled", "true");
  await editor.getByTestId("asset-editor-name").fill("Unsaved cache");
  await editor.getByTestId("asset-editor-coordinates").fill("0, 0");
  await editor.getByTestId("asset-editor-uncertainty").fill("1001");
  await expect.element(save).toHaveAttribute("aria-disabled", "true");
  expect((await mission.read()).assets).toEqual({});
  await editor.getByTestId("asset-editor-uncertainty").fill("15");
  await editor.getByText("Edit Pos.", { exact: true }).click();
  await expect.poll(() => store.getState().map.mapDirective?.mapItemType).toBe("asset");
  await expect
    .poll(() => readMapFeatures().filter((f) => f.name === "Unsaved cache" && !f.labelType))
    .toHaveLength(1);
  await editor.getByLabelText("Cancel", { exact: true }).click();
  await expect.element(editor).not.toBeInTheDocument();
  await expect.poll(() => store.getState().map.mapDirective).toBeNull();
  await expect.poll(() => readMapFeatures().filter((f) => f.name === "Unsaved cache")).toEqual([]);
  expect((await mission.read()).assets).toEqual({});
  expect(store.getState().asset.inEdit).toBeNull();
});

test("asset placement and Save/Cancel use one mission record across EVA switches and remount", async ({
  page,
  mission,
}) => {
  await mission.open();
  await openAssets(page);
  await page.getByTestId("assets-map-menu").getByLabelText("Asset", { exact: true }).click();
  const editor = page.getByTestId("asset-editor");
  await editor.getByTestId("asset-editor-name").fill("Survey cache");
  await editor.getByTestId("asset-editor-uncertainty").fill("15");
  await editor.getByTestId("asset-editor-notes").fill("Spare tools");
  await editor.getByText("Place on Map", { exact: true }).click();
  await expect.element(page.getByTestId("asset-editor-map-directive-hint")).toBeVisible();
  await waitForMapIdle();
  const bounds = page
    .getBySelector('[data-map-mode="editor"] .ol-viewport')
    .element()
    .getBoundingClientRect();
  await commands.mapPointer("click", bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.7);
  await expect.element(editor.getByTestId("asset-editor-coordinates")).not.toHaveValue("");
  expect((await mission.read()).assets).toEqual({});
  await editor.getByLabelText("Save", { exact: true }).click();
  await expect.poll(async () => Object.values((await mission.read()).assets).length).toBe(1);
  const asset = Object.values((await mission.read()).assets)[0];
  expect(asset).toMatchObject({
    name: "Survey cache",
    uncertaintyMeters: 15,
    notes: "Spare tools",
    visible: true,
  });
  expect(Number.isFinite(asset.location.lat)).toBe(true);
  expect(Number.isFinite(asset.location.lng)).toBe(true);
  const row = page.getByTestId(`asset-row-${asset.uuid}`);
  await expect.element(row).toBeVisible();
  await editAsset(row, page);
  await editor.getByLabelText("Radius in meters", { exact: true }).fill("99");
  await editor.getByLabelText("Cancel", { exact: true }).click();
  expect((await mission.read()).assets[asset.uuid]).toEqual(asset);
  await editAsset(row, page);
  await editor.getByLabelText("Radius in meters", { exact: true }).fill("20");
  await editor.getByLabelText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).assets[asset.uuid].uncertaintyMeters)
    .toBe(20);
  const saved = (await mission.read()).assets[asset.uuid];
  await row.getByLabelText("Collapse asset", { exact: true }).click();
  for (const name of ["Survey Alpha", "Survey Bravo"]) {
    await selectPlanningEva(page, name);
    await expect.element(row).toBeVisible();
  }
  await mission.open();
  await openAssets(page);
  await row.getByLabelText("Expand asset", { exact: true }).click();
  await expect
    .element(editor.getByLabelText("Radius in meters", { exact: true }))
    .toHaveTextContent("20");
  expect((await mission.read()).assets[asset.uuid]).toEqual(saved);
});

test("asset folders, visibility controls and deletion reconcile the document and rendered map", async ({
  page,
  mission,
}) => {
  await mission.open();
  await openAssets(page);
  await page.getByTestId("assets-map-menu").getByLabelText("Asset", { exact: true }).click();
  const editor = page.getByTestId("asset-editor");
  await editor.getByTestId("asset-editor-name").fill("Folder cache");
  await editor.getByTestId("asset-editor-coordinates").fill("0, 0");
  await editor.getByLabelText("Save", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).assets).length).toBe(1);
  const asset = Object.values((await mission.read()).assets)[0];
  const row = page.getByTestId(`asset-row-${asset.uuid}`);
  await row.getByLabelText("Collapse asset", { exact: true }).click();
  await page.getByTestId("assets-map-menu").getByLabelText("Folder", { exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name", exact: true }).fill("Surface caches");
  await page.getByLabelText("Save folder name", { exact: true }).click();
  await expect
    .poll(
      async () =>
        Object.values((await mission.read()).folders).filter((f) => f.type === "asset").length
    )
    .toBe(1);
  const folder = Object.values((await mission.read()).folders).find((f) => f.type === "asset");
  const group = page.getByTestId(`asset-folder-${folder.uuid}`);
  const rowBox = row.element().getBoundingClientRect();
  const folderBox = group.element().getBoundingClientRect();
  await commands.mapPointer("move", rowBox.x + 120, rowBox.y + rowBox.height / 2);
  await commands.mapPointer("down");
  await commands.mapPointer("move", rowBox.x + 125, rowBox.y - 5, 4);
  await commands.mapPointer("move", folderBox.x + 120, folderBox.y + 10, 8);
  await commands.mapPointer("up");
  await expect
    .poll(async () => (await mission.read()).folders[folder.uuid].items)
    .toEqual([asset.uuid]);
  const markers = () =>
    readMapFeatures().filter(
      (f) => f.id === asset.uuid && f.geometryType === "Point" && !f.labelType
    );
  await expect.poll(markers).toHaveLength(1);
  await expect.element(group.getByTestId(`asset-folder-visibility-${folder.uuid}`)).toBeEnabled();
  await group.getByTestId(`asset-folder-visibility-${folder.uuid}`).click();
  await expect.poll(async () => (await mission.read()).folders[folder.uuid].visible).toBe(false);
  // Selection reveals this asset even in a hidden folder; remount clears selection.
  await expect.poll(markers).toHaveLength(1);
  await mission.open();
  await openAssets(page);
  await expect.poll(markers).toHaveLength(0);
  await group.getByTestId(`asset-folder-visibility-${folder.uuid}`).click();
  await expect.poll(markers).toHaveLength(1);
  await page.getByTestId("rex-menu-minimize").click();
  await page.getByTestId("map-menu-launcher").click();
  await page.getByTestId("map-menu-asset-labels-toggle").click();
  await expect.poll(() => readMapFeatures().filter((f) => f.labelType === "asset")).toHaveLength(0);
  await page.getByTestId("map-menu-assets-toggle").click();
  await expect.poll(markers).toHaveLength(0);
  expect((await mission.read()).assets[asset.uuid].visible).toBe(true);
  await page.getByTestId("map-menu-assets-toggle").click();
  await expect.poll(markers).toHaveLength(1);
  await page.getByTestId("map-menu-asset-labels-toggle").click();
  await page
    .getByTestId("map-menu-floating-panel")
    .getBySelector('[class*="menuHeaderClose"]')
    .click();
  await openAssets(page);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await row.getByRole("button", { name: "Asset actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete Asset", exact: true }).click();
  await expect.poll(async () => (await mission.read()).assets).toEqual({});
  expect((await mission.read()).folders[folder.uuid].items).toEqual([]);
  await expect.poll(markers).toHaveLength(0);
  await group.getByLabelText("Folder actions").click();
  await page.getByRole("menuitem", { name: "Delete Folder", exact: true }).click();
  await expect.poll(async () => (await mission.read()).folders[folder.uuid]).toBeUndefined();
});
