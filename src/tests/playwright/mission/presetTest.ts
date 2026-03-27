import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function presetTest(page: Page): Promise<string> {
  await page.goto("http://localhost:4000/mission/22");
  //go to preset section
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Map Display Presets"
  );

  // Add a new preset and make sure it appeared
  const presetCount = await page.getByLabel("leftPresetName", { exact: true }).count();
  await page.getByLabel("Add", { exact: true }).click();

  const newPresetQuery = page.getByLabel("selectedPreset", { exact: true });
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toBeVisible();
  await expect(newPresetQuery.getByLabel("Unsaved changes", { exact: true })).toBeVisible();
  const newPresetName = await newPresetQuery
    .getByLabel("leftPresetName", { exact: true })
    .textContent();
  await page.getByLabel("Preset Title", { exact: true }).waitFor({ timeout: 5000 });
  await expect(page.getByLabel("Preset Title", { exact: true })).toHaveValue(newPresetName, {
    timeout: 500,
  });
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 1);

  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  // Duplicate preset
  await page.getByLabel("Duplicate", { exact: true }).click();
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toContainText(
    newPresetName + " (copy"
  );
  await page.getByLabel("Preset Title", { exact: true }).waitFor({ timeout: 5000 });

  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 2);

  // Delete preset
  await page.getByLabel("Edit", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("deleteButton", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByLabel("deleteButton", { exact: true }).click();
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 1);

  // Add and cancel preset
  await page.getByLabel("Add", { exact: true }).click();

  await page.getByLabel("cancelButton", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByLabel("cancelButton", { exact: true }).click();
  await expect(page.getByLabel("leftPresetName", { exact: true })).toHaveCount(presetCount + 1);

  return "success";
}
