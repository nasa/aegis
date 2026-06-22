import { test, expect } from "@playwright/test";
import {
  toggleEditMode,
  displayField,
  editValidatedField,
  cancelValidatedFieldEdit,
} from "./helpers";

test("Station lifecycle", async ({ page }) => {
  // Use a unique suffix per run to avoid "Name must be unique" failures from
  // leftover automerge state
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const stationName = `Playwright Test Station ${suffix}`;
  const editedName = `${stationName} edited`;

  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // Turn on global edit mode.
  await toggleEditMode(page);

  // Go to Station section.
  await page.getByLabel("station Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");

  // Add Station.
  const startingNumStations = await page.getByLabel("stationList-item", { exact: true }).count();
  await page.getByLabel("addStation", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations + 1
  );

  // Wait for the Station name display field to render before editing.
  await displayField(page, "Station").first().waitFor({ state: "attached", timeout: 5000 });

  // Edit Station name via dialog and Save.
  await editValidatedField(page, "Station", stationName);
  await page.mouse.move(0, 0);
  await page.waitForLoadState("networkidle");
  await expect(displayField(page, "Station").first()).toContainText(stationName);
  await expect(page.getByLabel("stationList-item").filter({ hasText: stationName })).toHaveCount(1);

  // Edit Station name via dialog and Cancel.
  await cancelValidatedFieldEdit(page, "Station", editedName);
  await page.mouse.move(0, 0);
  await expect(displayField(page, "Station").first()).toContainText(stationName);

  // Duplicate Station.
  await page.getByLabel("duplicateStation", { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations + 2
  );

  // Select the original station so the delete button targets it.
  await page.getByLabel("stationList-item").filter({ hasText: stationName }).first().click();
  await page.waitForLoadState("networkidle");

  // Delete original Station.
  const dialogPromiseOriginal = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteStation", { exact: true }).click();
  await dialogPromiseOriginal;
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations + 1
  );

  // Select the duplicate station by its "(copy" name and delete it.
  await page
    .getByLabel("stationList-item")
    .filter({ hasText: stationName })
    .filter({ hasText: "(copy" })
    .first()
    .click();
  await page
    .getByLabel("deleteStation", { exact: true })
    .waitFor({ state: "visible", timeout: 15000 });

  // Delete the duplicate Station.
  const dialogPromiseDuplicate = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteStation", { exact: true }).click();
  await dialogPromiseDuplicate;
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations,
    { timeout: 15000 }
  );
});
