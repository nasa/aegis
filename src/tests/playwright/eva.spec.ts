import { test, expect } from "@playwright/test";
import {
  toggleEditMode,
  displayField,
  editValidatedField,
  cancelValidatedFieldEdit,
} from "./helpers";

test("EVA lifecycle", async ({ page }) => {
  // Use a unique suffix per run to avoid "Name must be unique" failures from
  // leftover automerge state
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const evaName = `PlayWright Test Eva ${suffix}`;
  const editedName = `${evaName} edited`;

  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // Turn on global edit mode.
  await toggleEditMode(page);

  // Go to EVA section.
  await page.getByLabel("evas Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("EVAs");

  // Add EVA.
  const startingNumEvas = await page.getByLabel("evaList-item", { exact: true }).count();
  await page.getByLabel("addEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  // Wait for the loading overlay to disappear (it may appear and disappear quickly)
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 1);

  // Wait for the EVA Title display field to render before editing.
  await displayField(page, "EVA Title").first().waitFor({ state: "attached", timeout: 5000 });

  // Edit EVA name via dialog and Save.
  await editValidatedField(page, "EVA Title", evaName);
  await page.mouse.move(0, 0);
  await expect(displayField(page, "EVA Title").first()).toContainText(evaName);
  await expect(page.getByLabel("evaList-item").filter({ hasText: evaName })).toHaveCount(1);

  // Edit EVA name via dialog and Cancel.
  await cancelValidatedFieldEdit(page, "EVA Title", editedName);
  await page.mouse.move(0, 0);
  await expect(displayField(page, "EVA Title").first()).toContainText(evaName);

  // Duplicate EVA (without stations).
  await page.getByLabel("duplicateEva", { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 2);

  // Duplicate EVA with stations (triggers a confirm() dialog).
  // Re-select the original EVA first so the duplicate buttons target it.
  await page.getByLabel("evaList-item").filter({ hasText: evaName }).first().click();
  // Wait for the duplicate button to be ready (it's in the left panel, always visible in edit mode).
  await page
    .getByLabel("duplicateEvaWithStations", { exact: true })
    .waitFor({ state: "visible", timeout: 10000 });
  const dialogPromiseDupWithStations = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("duplicateEvaWithStations", { exact: true }).click();
  await dialogPromiseDupWithStations;
  await page.mouse.move(0, 0);
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 3);

  // Clean up: delete all EVAs created in this test (original + duplicates).
  // Use a reload-based loop: keep deleting any evaList-item containing evaName until
  // the count returns to startingNumEvas.
  let currentEvaCount = startingNumEvas + 3;
  while (currentEvaCount > startingNumEvas) {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });
    await toggleEditMode(page);
    await page.getByLabel("evas Section", { exact: true }).click();
    // Click the first evaList-item containing evaName (exact match or copy)
    await page.getByLabel("evaList-item").filter({ hasText: evaName }).first().click();
    await page
      .getByLabel("deleteEva", { exact: true })
      .waitFor({ state: "visible", timeout: 15000 });
    const deletePromise = new Promise<void>((resolve) => {
      page.once("dialog", async (dialog) => {
        await dialog.accept();
        resolve();
      });
    });
    await page.getByLabel("deleteEva", { exact: true }).click();
    await deletePromise;
    await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
    currentEvaCount--;
    await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(currentEvaCount);
  }
});
