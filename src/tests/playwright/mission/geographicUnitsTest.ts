import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV1MissionSection,
  toggleEditMode,
  editValidatedField,
  cancelValidatedFieldEdit,
  displayField,
} from "./missionTestHelpers";

/**
 * Find the index of a geographic unit by name.
 */
async function findGeoUnitIndexExactName(page: Page, name: string): Promise<number> {
  const count = await displayField(page, "Geographic unit name").count();
  for (let i = 0; i < count; i++) {
    const text = await displayField(page, "Geographic unit name", i).textContent();
    if (text === name) return i;
  }
  return -1;
}

export async function geographicUnitsTest(page: Page): Promise<string> {
  // Use per-run suffix to avoid `Name must be unique` failures from leftover
  // automerge state. Suffix is prefixed with
  // `aa`/`zb` etc. so alphabetical-sort assertions still hold (ONE < TWO).
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const geoUnitOneName = `--TEST GEO UNIT ONE ${suffix}--`;
  const geoUnitOneEditedName = `--TEST GEO UNIT ONE B ${suffix}--`; // Still starts with "ONE B", sorts after ONE
  const geoUnitTwoName = `--TEST GEO UNIT TWO ${suffix}--`;

  await goToV1MissionSection(page);

  // Geographic units panel only exists on v1 missions
  const panelButton = page.getByLabel("geographicUnit_panel", { exact: true });
  if ((await panelButton.count()) === 0) {
    console.log("geographicUnit_panel not found. Skipping test.");
    return "skipped";
  }

  // Navigate to geographic units panel
  await panelButton.click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Geography"
  );

  // Count starting items
  const startingCount = await page.getByLabel("geoUnitList-item", { exact: true }).count();

  // Turn on edit mode
  await toggleEditMode(page);

  // Create first geographic unit
  await page.getByLabel("addGeoUnitButton", { exact: true }).click();
  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(startingCount + 1);

  // Find and edit the new default-named item
  let defaultIndex = await findGeoUnitIndexExactName(page, "(Geographic Unit Name)");
  expect(defaultIndex).not.toEqual(-1);
  await editValidatedField(page, "Geographic unit name", geoUnitOneName, defaultIndex);
  let gu1Index = await findGeoUnitIndexExactName(page, geoUnitOneName);
  await editValidatedField(page, "Geographic unit abbreviation", "TG1", gu1Index);

  // Create second geographic unit
  await page.getByLabel("addGeoUnitButton", { exact: true }).click();
  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(startingCount + 2);

  defaultIndex = await findGeoUnitIndexExactName(page, "(Geographic Unit Name)");
  expect(defaultIndex).not.toEqual(-1);
  await editValidatedField(page, "Geographic unit name", geoUnitTwoName, defaultIndex);
  let gu2Index = await findGeoUnitIndexExactName(page, geoUnitTwoName);
  await editValidatedField(page, "Geographic unit abbreviation", "TG2", gu2Index);

  // Verify items exist and are sorted alphabetically
  gu1Index = await findGeoUnitIndexExactName(page, geoUnitOneName);
  gu2Index = await findGeoUnitIndexExactName(page, geoUnitTwoName);
  expect(gu1Index !== -1 && gu2Index !== -1).toEqual(true);
  expect(gu1Index).toBeLessThan(gu2Index); // alphabetical: ONE < TWO

  // Verify field values
  await expect(displayField(page, "Geographic unit abbreviation", gu1Index)).toContainText("TG1");
  await expect(displayField(page, "Geographic unit abbreviation", gu2Index)).toContainText("TG2");

  // Edit first item
  await editValidatedField(page, "Geographic unit name", geoUnitOneEditedName, gu1Index);
  gu1Index = await findGeoUnitIndexExactName(page, geoUnitOneEditedName);
  await editValidatedField(page, "Geographic unit abbreviation", "T1B", gu1Index);

  // Verify edited values
  gu1Index = await findGeoUnitIndexExactName(page, geoUnitOneEditedName);
  expect(gu1Index).not.toEqual(-1);
  await expect(displayField(page, "Geographic unit abbreviation", gu1Index)).toContainText("T1B");

  // Test cancel on field edit (dialog cancel)
  gu2Index = await findGeoUnitIndexExactName(page, geoUnitTwoName);
  await cancelValidatedFieldEdit(page, "Geographic unit name", "--SHOULD NOT SAVE--", gu2Index);

  // Delete both test items (higher index first to avoid shifting)
  gu1Index = await findGeoUnitIndexExactName(page, geoUnitOneEditedName);
  gu2Index = await findGeoUnitIndexExactName(page, geoUnitTwoName);
  if (gu1Index > gu2Index) {
    await page.getByLabel("deleteButton", { exact: true }).nth(gu1Index).click();
    await page.waitForTimeout(500);
    await page.getByLabel("deleteButton", { exact: true }).nth(gu2Index).click();
  } else {
    await page.getByLabel("deleteButton", { exact: true }).nth(gu2Index).click();
    await page.waitForTimeout(500);
    await page.getByLabel("deleteButton", { exact: true }).nth(gu1Index).click();
  }
  await page.waitForTimeout(500);

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(startingCount);

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
