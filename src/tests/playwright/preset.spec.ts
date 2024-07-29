import { test, expect } from "@playwright/test";

test("create cancel edit duplicate delete preset", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  //go to preset section
  await page.waitForTimeout(2000);
  await page.getByLabel("preset Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Map Display Presets"
  );

  // Add a new preset and make sure it appeared
  const poiCounts = [
    await page.getByLabel("mapPreset-primary", { exact: true }).count(),
    await page.getByLabel("mapPreset-secondary", { exact: true }).count(),
  ];
  await page.getByLabel("Add", { exact: true }).click();

  await expect(page.getByLabel("mapPreset-primary", { exact: true })).toHaveCount(poiCounts[0]);
  await expect(page.getByLabel("mapPreset-secondary", { exact: true })).toHaveCount(
    poiCounts[1] + 1
  );

  const newPresetQuery = page.getByLabel("selectedPreset", { exact: true });
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toBeVisible();
  await expect(newPresetQuery.getByLabel("Unsaved changes", { exact: true })).toBeVisible();
  const newPresetName = await newPresetQuery
    .getByLabel("leftPresetName", { exact: true })
    .textContent();
  await page.getByLabel("Preset Title", { exact: true }).waitFor();
  await page.waitForTimeout(500);
  await expect(page.getByLabel("Preset Title", { exact: true })).toHaveValue(newPresetName, {
    timeout: 500,
  });

  await page.waitForTimeout(500);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  // Test preset information
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("listAsPrimary", { exact: true }).click();
  await page.getByLabel("checkbox", { exact: true }).setChecked(true);
  await expect(newPresetQuery.getByLabel("Unsaved changes", { exact: true })).toBeVisible();

  await page.waitForTimeout(500);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(
    page
      .getByLabel("mapPreset-primary", { exact: true })
      .getByLabel("selectedPreset", { exact: true })
  ).toBeVisible();
  await expect(newPresetQuery.getByLabel("leftPresetIsDefault", { exact: true })).toBeVisible();

  // Set back to secondary
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("listAsSecondary", { exact: true }).click();

  await page.waitForTimeout(500);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(
    page
      .getByLabel("mapPreset-secondary", { exact: true })
      .getByLabel("selectedPreset", { exact: true })
  ).toBeVisible();
  await expect(newPresetQuery.getByLabel("leftPresetIsDefault", { exact: true })).toBeHidden();

  // Duplicate preset
  await page.getByLabel("Duplicate", { exact: true }).click();
  await expect(newPresetQuery.getByLabel("leftPresetName", { exact: true })).toContainText(
    newPresetName + " (copy"
  );
  await page.waitForTimeout(500);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("mapPreset-secondary", { exact: true })).toHaveCount(
    poiCounts[1] + 2
  );

  // Delete preset
  await page.waitForTimeout(1000);
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("deleteButton", { exact: true }).click();
  await expect(page.getByLabel("mapPreset-secondary", { exact: true })).toHaveCount(
    poiCounts[1] + 1
  );

  // Add and cancel preset
  await page.getByLabel("Add", { exact: true }).click();
  await page.getByLabel("cancelButton", { exact: true }).click();
  await expect(page.getByLabel("mapPreset-primary", { exact: true })).toHaveCount(poiCounts[0]);
  await expect(page.getByLabel("mapPreset-secondary", { exact: true })).toHaveCount(
    poiCounts[1] + 1
  );
});
