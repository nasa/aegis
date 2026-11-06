/**
 * Asset tracking workflow on Mission 22: an asset created from the floating widget is mission
 * data, so it survives EVA switches and reloads, can be organized into folders, and responds to
 * the Map Item Visibility Assets / Labels toggles.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { waitForPageReady, minimizeRexMenu, displayField } from "../helpers";

const MISSION_URL = "http://localhost:4000/mission/22";

async function openAssetsTab(page: Page): Promise<void> {
  await page.goto(MISSION_URL);
  await waitForPageReady(page);
  await page.locator(".ol-viewport").first().waitFor({ state: "visible", timeout: 15000 });
  const launcher = page.getByTestId("rex-menu-launcher");
  if (await launcher.isVisible().catch(() => false)) await launcher.click();
  await page.locator(".dv-tab", { hasText: "Assets" }).click();
  await expect(page.getByTestId("assets-map-menu")).toBeVisible();
}

async function selectEva(page: Page, index: number): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const eva = page.getByLabel("evaList-item", { exact: true }).nth(index);
  await expect(eva).toBeVisible({ timeout: 5000 });
  await eva.click();
}

test.describe("Mission 22 — Asset tracking", () => {
  // Keep the lifecycle in one test so retries create and clean up their own data.
  test("create, place, organize, and delete an asset across EVAs and reloads", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const assetName = `Playwright Asset ${suffix}`;
    const folderName = `PW Assets ${suffix}`;
    const assetRow = page.locator("tr[data-testid^='asset-row-']", { hasText: assetName });
    await openAssetsTab(page);
    await expect(
      page.getByTestId("assets-map-menu").getByLabel("Asset", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByTestId("assets-map-menu").getByLabel("Folder", { exact: true })
    ).toBeVisible();
    await page.getByTestId("assets-map-menu").getByLabel("Asset", { exact: true }).click();
    const editor = page.getByTestId("asset-editor");
    await editor.getByTestId("asset-editor-name").fill(assetName);
    await editor.getByTestId("asset-editor-uncertainty").fill("15");
    await editor.getByText("Place on Map", { exact: true }).click();
    await expect(page.getByTestId("asset-editor-map-directive-hint")).toBeVisible();

    const map = page.locator(".ol-viewport").first();
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await expect(editor.getByTestId("asset-editor-coordinates")).not.toHaveValue("");
    const coordinates = await editor.getByTestId("asset-editor-coordinates").inputValue();
    await expect(editor.getByText("Edit Pos.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("asset-editor-elevation")).not.toContainText("Fetching");
    await editor.getByLabel("Save", { exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel("Save", { exact: true })).toBeHidden();
    await expect(assetRow).toBeVisible();
    await expect(assetRow).not.toContainText("Not placed");
    await expect(assetRow.getByLabel("Collapse asset", { exact: true })).toBeVisible();
    await expect(displayField(page, "Radius in meters")).toHaveText("15");
    await expect(displayField(page, "Asset coordinates")).toHaveText(coordinates);
    await expect(editor.getByLabel("assetEditToggle", { exact: true })).toBeHidden();

    await assetRow.getByRole("button", { name: "Asset actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit Asset", exact: true }).click();
    await expect(editor.getByLabel("Asset name", { exact: true })).toHaveValue(assetName);
    await editor.getByLabel("Radius in meters", { exact: true }).fill("99");
    await editor.getByLabel("Cancel", { exact: true }).click();
    await expect(displayField(page, "Radius in meters")).toHaveText("15");
    await assetRow.getByRole("button", { name: "Asset actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit Asset", exact: true }).click();
    await editor.getByLabel("Radius in meters", { exact: true }).fill("20");
    await editor.getByLabel("Save", { exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(displayField(page, "Radius in meters")).toHaveText("20");
    await expect(editor.getByLabel("Save", { exact: true })).toBeHidden();
    await assetRow.getByLabel("Collapse asset", { exact: true }).click();

    // Assets are mission data: they stay listed across EVA selection and reload.
    await selectEva(page, 0);
    await expect(assetRow).toBeVisible();
    await selectEva(page, 1);
    await expect(assetRow).toBeVisible();
    await openAssetsTab(page);
    await expect(assetRow).toBeVisible();
    await assetRow.getByLabel("Expand asset", { exact: true }).click();
    await expect(displayField(page, "Radius in meters")).toHaveText("20");
    await assetRow.getByLabel("Collapse asset", { exact: true }).click();

    await page.getByTestId("assets-map-menu").getByLabel("Folder", { exact: true }).click();
    await page.getByRole("textbox", { name: "Folder name", exact: true }).fill(folderName);
    await page.getByLabel("Save folder name", { exact: true }).click();
    const folder = page.locator("tbody[data-testid^='asset-folder-']", { hasText: folderName });
    await expect(folder).toBeVisible();

    const rowBox = (await assetRow.boundingBox())!;
    const folderBox = (await folder.boundingBox())!;
    await page.mouse.move(rowBox.x + 120, rowBox.y + rowBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rowBox.x + 125, rowBox.y - 5, { steps: 4 });
    await page.mouse.move(folderBox.x + 120, folderBox.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect(
      folder.locator("tr[data-testid^='asset-row-']", { hasText: assetName })
    ).toBeVisible();

    // Shared folder visibility marks the row as hidden through its folder.
    // dnd-kit suppresses clicks for 50 ms after a drop; hold this click past that window.
    await folder.locator("[data-testid^='asset-folder-visibility-']").click({ delay: 100 });
    await expect(folder).toHaveClass(/folderHidden/);
    await expect(assetRow).toHaveClass(/assetRowHidden/);
    await folder.locator("[data-testid^='asset-folder-visibility-']").click();
    await expect(folder).not.toHaveClass(/folderHidden/);

    // The viewer's own toggles live in Map Item Visibility.
    await minimizeRexMenu(page);
    await page.getByTestId("map-menu-launcher").click();
    await expect(page.getByTestId("map-menu-assets-toggle")).toBeVisible();
    await page.getByTestId("map-menu-asset-labels-toggle").click();
    await expect(page.getByTestId("map-menu-asset-labels-toggle")).not.toHaveClass(
      /toggleSelected/
    );
    const assetsToggle = page.getByTestId("map-menu-assets-toggle");
    const assetsEye = assetsToggle.locator("svg");
    const visibleColor = await assetsEye.evaluate((element) => getComputedStyle(element).color);
    await assetsToggle.click();
    await expect(assetsEye).not.toHaveCSS("color", visibleColor);
    await assetsToggle.click();
    await expect(assetsEye).toHaveCSS("color", visibleColor);
    await page.getByTestId("map-menu-asset-labels-toggle").click();
    await page.getByTestId("map-menu-floating-panel").locator("[class*='menuHeaderClose']").click();
    await page.getByTestId("rex-menu-launcher").click();
    await expect(page.getByTestId("assets-map-menu")).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    await assetRow.getByRole("button", { name: "Asset actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete Asset", exact: true }).click();
    await expect(assetRow).toHaveCount(0);

    await folder.getByLabel("Folder actions").click();
    await page.getByRole("menuitem", { name: "Delete Folder" }).click();
    await expect(folder).toHaveCount(0);
  });
});
