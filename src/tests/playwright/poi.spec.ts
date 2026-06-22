import { test, expect } from "@playwright/test";
import {
  toggleEditMode,
  displayField,
  editValidatedField,
  cancelValidatedFieldEdit,
} from "./helpers";

test("POI lifecycle", async ({ page }) => {
  // Use a unique suffix per run so leftover names from prior
  // failed runs would otherwise trip the "Name must be unique" validator.
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const poiName = `PlayWright Test POI ${suffix}`;
  const editedName = `${poiName} edited`;

  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // Turn on global edit mode (required to edit fields and to show the delete button).
  await toggleEditMode(page);

  // Go to POI section.
  await page.getByLabel("poi Section", { exact: true }).click();
  await page.getByLabel("leftPanelTitle", { exact: true }).waitFor({ timeout: 2000 });
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Points of Interest"
  );

  // Add POI.
  const startingNumPois = await page.getByLabel("poiList-item", { exact: true }).count();
  await page.getByLabel("addPoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips.
  await page.waitForLoadState("networkidle");
  await page.getByText("POI Information", { exact: true }).waitFor({ timeout: 5000 });
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois + 1);

  // Wait for the POI name display field to render before editing.
  await displayField(page, "POI").first().waitFor({ state: "attached", timeout: 5000 });

  // Edit POI name via the dialog and Save.
  await editValidatedField(page, "POI", poiName);
  await page.mouse.move(0, 0);
  await page.waitForLoadState("networkidle");
  await expect(displayField(page, "POI").first()).toContainText(poiName);
  await expect(page.getByLabel("poiList-item").filter({ hasText: poiName })).toHaveCount(1);

  // Edit POI name via the dialog and Cancel; verify the original value is preserved.
  await cancelValidatedFieldEdit(page, "POI", editedName);
  await page.mouse.move(0, 0);
  await expect(displayField(page, "POI").first()).toContainText(poiName);
  await expect(page.getByLabel("poiList-item").filter({ hasText: poiName })).toHaveCount(1);

  // Duplicate POI.
  await page.getByLabel("duplicatePoi", { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois + 2);

  // Delete the duplicated POI (the one not named poiName — select the other one first).
  // Select the original POI so the delete button targets it.
  await page.getByLabel("poiList-item").filter({ hasText: poiName }).first().click();
  await page.waitForLoadState("networkidle");

  // Delete original POI (browser confirm dialog).
  const dialogPromiseOriginal = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deletePoi", { exact: true }).click();
  await dialogPromiseOriginal;
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois + 1);

  // Select the duplicate POI by its "(copy" name and delete it.
  await page
    .getByLabel("poiList-item")
    .filter({ hasText: poiName })
    .filter({ hasText: "(copy" })
    .first()
    .click();
  await page.getByLabel("deletePoi", { exact: true }).waitFor({ state: "visible", timeout: 15000 });

  // Delete the duplicate POI.
  const dialogPromiseDuplicate = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deletePoi", { exact: true }).click();
  await dialogPromiseDuplicate;
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois);
});
