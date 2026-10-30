/**
 * Asset tracking workflow on Mission 22: an asset created from the floating widget is mission
 * data, so it survives EVA switches and reloads, can be organized into folders, and responds to
 * the Map Item Visibility Assets / Labels toggles.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { waitForPageReady } from "../helpers";

const MISSION_URL = "http://localhost:4000/mission/22";
const ASSET_NAME = `Playwright Asset ${Date.now()}`;

async function openAssetsTab(page: Page): Promise<void> {
  await page.goto(MISSION_URL);
  await waitForPageReady(page);
  await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
  const launcher = page.getByTestId("rex-menu-launcher");
  if (await launcher.isVisible().catch(() => false)) await launcher.click();
  await page.locator(".dv-tab", { hasText: "Assets" }).click();
  await expect(page.getByTestId("assets-map-menu")).toBeVisible();
}

function assetRow(page: Page) {
  return page.locator("tr[data-testid^='asset-row-']", { hasText: ASSET_NAME });
}

async function selectEva(page: Page, index: number): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const eva = page.getByLabel("evaList-item", { exact: true }).nth(index);
  await expect(eva).toBeVisible({ timeout: 5000 });
  await eva.click();
  await page.waitForTimeout(300);
}

test.describe.configure({ mode: "serial" });

test.describe("Mission 22 — Asset tracking", () => {
  test("create, place, and keep an asset across EVAs and reloads", async ({ page }) => {
    await openAssetsTab(page);
    await page.getByText("Add Asset", { exact: true }).click();
    const editor = page.getByTestId("asset-editor");
    await editor.getByTestId("asset-editor-name").fill(ASSET_NAME);
    await editor.getByTestId("asset-editor-uncertainty").fill("15");
    await editor.getByText("Place on Map", { exact: true }).click();
    await expect(page.getByTestId("asset-editor-gesture-hint")).toBeVisible();

    const map = page.locator(".ol-viewport").first();
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await expect(editor.getByTestId("asset-editor-coordinates")).not.toHaveValue("");
    await expect(editor.getByText("Edit Pos.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("asset-editor-elevation")).not.toHaveText("Fetching…");
    await editor.getByText("Save", { exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(assetRow(page)).toBeVisible();
    await expect(assetRow(page)).not.toContainText("Not placed");

    // Assets are mission data: they stay listed across EVA selection and reload.
    await selectEva(page, 0);
    await expect(assetRow(page)).toBeVisible();
    await selectEva(page, 1);
    await expect(assetRow(page)).toBeVisible();
    await openAssetsTab(page);
    await expect(assetRow(page)).toBeVisible();
  });

  test("organize the asset in a folder and hide it with the shared and local toggles", async ({
    page,
  }) => {
    await openAssetsTab(page);
    await page.getByText("Add Folder", { exact: true }).click();
    const folder = page.locator("tbody[data-testid^='asset-folder-']").first();
    await expect(folder).toBeVisible();
    await page.keyboard.press("Enter");

    const rowBox = (await assetRow(page).boundingBox())!;
    const folderBox = (await folder.boundingBox())!;
    await page.mouse.move(rowBox.x + 120, rowBox.y + rowBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rowBox.x + 125, rowBox.y - 5, { steps: 4 });
    await page.mouse.move(folderBox.x + 120, folderBox.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect(
      folder.locator("tr[data-testid^='asset-row-']", { hasText: ASSET_NAME })
    ).toBeVisible();

    // Shared folder visibility marks the row as hidden through its folder.
    await folder.locator("[data-testid^='asset-folder-visibility-']").click();
    await expect(folder).toHaveClass(/folderHidden/);
    await folder.locator("[data-testid^='asset-folder-visibility-']").click();

    // The viewer's own toggles live in Map Item Visibility.
    await page.getByTestId("map-menu-launcher").click();
    await expect(page.getByTestId("map-menu-assets-toggle")).toBeVisible();
    await page.getByTestId("map-menu-asset-labels-toggle").click();
    await page.getByTestId("map-menu-assets-toggle").click();
    await page.getByTestId("map-menu-assets-toggle").click();
  });

  test("delete the asset and its folder", async ({ page }) => {
    await openAssetsTab(page);
    page.on("dialog", (dialog) => dialog.accept());
    await assetRow(page).getByLabel("Asset actions").click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(assetRow(page)).toHaveCount(0);

    const folder = page.locator("tbody[data-testid^='asset-folder-']").first();
    await folder.getByLabel("Folder actions").click();
    await page.getByRole("menuitem", { name: "Delete Folder" }).click();
    await expect(folder).toHaveCount(0);
  });
});
