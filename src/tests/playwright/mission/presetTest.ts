import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { waitForPageReady, toggleEditMode, displayField, editValidatedField } from "../helpers";

/** Click the delete button and accept the resulting confirm dialog. */
async function deleteSelectedPreset(page: Page): Promise<void> {
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteButton", { exact: true }).click();
  await dialogPromise;
}

export async function presetTest(page: Page): Promise<string> {
  // Use a unique suffix per run to avoid collisions with names left behind
  // by previously failed test runs.
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const presetBaseName = `Playwright Test Preset ${suffix}`;
  const copyName = `${presetBaseName} (copy`;

  await page.goto("http://localhost:4000/mission/22");
  //go to preset section
  await waitForPageReady(page);
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Map Display Presets"
  );

  // Add/Duplicate/Delete are only available in edit mode
  await toggleEditMode(page);

  // Add a new preset and make sure it appeared
  const presetCount = await page.getByLabel("leftPresetName", { exact: true }).count();
  await page.getByLabel("Add", { exact: true }).click();

  const newPresetQuery = page.getByLabel("selectedPreset", { exact: true });
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toBeVisible();
  await displayField(page, "Preset Title").waitFor({ timeout: 5000 });

  // Rename the preset to our unique name. "Preset Title" is a ValidatedInputField:
  // click its display <div> to open the dialog, fill the input, then Save.
  await editValidatedField(page, "Preset Title", presetBaseName);
  await expect(displayField(page, "Preset Title")).toContainText(presetBaseName);
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 1);
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toContainText(
    presetBaseName
  );

  // Duplicate preset
  await page.getByLabel("Duplicate", { exact: true }).click();
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toContainText(
    copyName
  );
  await expect(displayField(page, "Preset Title")).toContainText(copyName);

  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 2);

  // Delete the duplicate preset
  await deleteSelectedPreset(page);
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 1);

  // Delete the original preset to clean up after ourselves
  await page
    .getByLabel("leftPresetName", { exact: true })
    .filter({ hasText: presetBaseName })
    .click();
  await page.getByLabel("deleteButton", { exact: true }).waitFor({ timeout: 5000 });
  await deleteSelectedPreset(page);
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount);

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
