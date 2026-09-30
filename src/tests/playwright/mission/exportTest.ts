import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { goToV2MissionSection } from "./missionTestHelpers";

export async function exportTest(page: Page): Promise<string> {
  await goToV2MissionSection(page);

  // Navigate to export panel
  await page.getByLabel("export_panel", { exact: true }).click();

  // Verify we're on the export page
  await expect(page.locator("text=Export AEGIS Data")).toBeVisible();

  // Verify all checkboxes are present
  const evasCheckbox = page.locator("#export-all-evas");
  const poisCheckbox = page.locator("#export-pois");
  const stationsCheckbox = page.locator("#export-stations");
  const actionsCheckbox = page.locator("#export-actions");
  const traversesCheckbox = page.locator("#export-traverses");
  const missionCheckbox = page.locator("#export-mission");
  const rexesCheckbox = page.locator("#export-rexes");

  await expect(evasCheckbox).toBeVisible();
  await expect(poisCheckbox).toBeVisible();
  await expect(stationsCheckbox).toBeVisible();
  await expect(actionsCheckbox).toBeVisible();
  await expect(traversesCheckbox).toBeVisible();
  await expect(missionCheckbox).toBeVisible();
  await expect(rexesCheckbox).toBeVisible();

  // Verify default checkbox states (EVAs is checked by default, rest unchecked)
  await expect(evasCheckbox).toBeChecked();
  await expect(poisCheckbox).not.toBeChecked();
  await expect(stationsCheckbox).not.toBeChecked();
  await expect(actionsCheckbox).not.toBeChecked();
  await expect(traversesCheckbox).not.toBeChecked();
  await expect(missionCheckbox).not.toBeChecked();
  await expect(rexesCheckbox).not.toBeChecked();

  // Toggle some checkboxes
  await poisCheckbox.setChecked(true);
  await missionCheckbox.setChecked(true);
  await evasCheckbox.setChecked(false);

  // Verify toggled states
  await expect(evasCheckbox).not.toBeChecked();
  await expect(poisCheckbox).toBeChecked();
  await expect(missionCheckbox).toBeChecked();

  // Test export button triggers a download
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Export JSON File").click();
  const download = await downloadPromise;

  // Verify the download filename contains expected segments
  const filename = download.suggestedFilename();
  expect(filename).toContain("pois_");
  expect(filename).toContain("mission_");
  expect(filename).not.toContain("evas_");
  expect(filename).toContain("export.json");

  return "success";
}
