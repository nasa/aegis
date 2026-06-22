import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  cancelValidatedFieldEdit,
  displayField,
} from "./missionTestHelpers";

export async function circleDefinitionsTest(page: Page): Promise<string> {
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  await goToV2MissionSection(page);

  // Go to circle definitions list
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Proximity Circle Definitions"
  );

  // Turn on edit mode
  await toggleEditMode(page);

  // Clean up any orphans from previously-failed runs: delete items whose name
  // is still the default "(Circle Definition Name)" or starts with "--TEST RADIUS".
  const orphanCleanupStartTime = Date.now();
  const orphanCleanupTimeout = 30000; // 30 second timeout
  while (true) {
    // Emergency exit if cleanup takes too long
    if (Date.now() - orphanCleanupStartTime > orphanCleanupTimeout) {
      console.warn("Orphan cleanup timeout exceeded, exiting loop");
      break;
    }

    const namesCount = await displayField(page, "Circle Definition Name").count();
    let orphanIndex = -1;
    for (let i = 0; i < namesCount; i++) {
      const text = await displayField(page, "Circle Definition Name", i).textContent();
      if (text === "(Circle Definition Name)" || (text && text.startsWith("--TEST RADIUS"))) {
        orphanIndex = i;
        break;
      }
    }
    if (orphanIndex === -1) break;
    await page.getByLabel("deleteButton", { exact: true }).nth(orphanIndex).click();
    await page.waitForTimeout(300);
  }

  // Count starting items (after orphan cleanup)
  const startingNumCircleDefinitions = await page
    .getByLabel("circle-definition-item", { exact: true })
    .count();

  // Helper to capture all current names so we can identify the index of any
  // newly added item (the item whose name was not in the snapshot).
  const snapshotNames = async (): Promise<string[]> => {
    const count = await displayField(page, "Circle Definition Name").count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      out.push((await displayField(page, "Circle Definition Name", i).textContent()) ?? "");
    }
    return out;
  };

  // Add a circle definition and return the index of the newly-added item.
  // The default name is "(Circle Definition Name)" and multiple defaults can
  // exist simultaneously when leftover orphans aren't cleaned, so the only
  // robust way to find the new one is to compare names before vs after.
  const addCircleAndGetNewIndex = async (): Promise<number> => {
    const before = await snapshotNames();
    await page.getByLabel("addNewRadiusButton", { exact: true }).click();
    await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
      before.length + 1
    );
    // Re-snapshot and find the index whose entry didn't exist in `before`.
    // Note: names list may have duplicates (e.g. two "(Circle Definition Name)"
    // entries), so do an element-level diff that pops matched entries.
    const after = await snapshotNames();
    const beforeRemaining = [...before];
    for (let i = 0; i < after.length; i++) {
      const idx = beforeRemaining.indexOf(after[i]);
      if (idx === -1) return i; // new item
      beforeRemaining.splice(idx, 1);
    }
    throw new Error("addCircleAndGetNewIndex: failed to locate the newly added item");
  };

  // Add and rename first circle definition.
  const new1Index = await addCircleAndGetNewIndex();
  await editValidatedField(
    page,
    "Circle Definition Name",
    `--TEST RADIUS ONE ${suffix}--`,
    new1Index
  );
  // Edit its radius (find by new name in case sort changed indices).
  const test1RowIndex = await findFieldIndex(
    page,
    "Circle Definition Name",
    `--TEST RADIUS ONE ${suffix}--`
  );
  await editValidatedField(page, "Circle Definition Range", "1", test1RowIndex);

  // Wait briefly for re-sort after range edit.
  await page.waitForTimeout(500);

  // Add and rename second circle definition.
  const new2Index = await addCircleAndGetNewIndex();
  await editValidatedField(
    page,
    "Circle Definition Name",
    `--TEST RADIUS TWO ${suffix}--`,
    new2Index
  );
  const test2RowIndex = await findFieldIndex(
    page,
    "Circle Definition Name",
    `--TEST RADIUS TWO ${suffix}--`
  );
  await editValidatedField(page, "Circle Definition Range", "100", test2RowIndex);

  // Wait for items to re-sort (sorted by radius)
  await page.waitForTimeout(500);

  // Verify saved circle definitions and sort order
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 2
  );
  let test1Index = -1;
  let test2Index = -1;
  let orderBroken = false;
  let prevRange = 0;
  const totalItems = startingNumCircleDefinitions + 2;
  for (let i = 0; i < totalItems; i++) {
    const name = await displayField(page, "Circle Definition Name", i).textContent();
    const range = Number(await displayField(page, "Circle Definition Range", i).textContent());
    if (name === `--TEST RADIUS ONE ${suffix}--` && range === 1) {
      test1Index = i;
    }
    if (name === `--TEST RADIUS TWO ${suffix}--` && range === 100) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test1Index !== -1 && test2Index !== -1 && !orderBroken).toEqual(true);

  // Edit circle definition name and range (update test1)
  await editValidatedField(
    page,
    "Circle Definition Name",
    `--TEST RADIUS ONE B ${suffix}--`,
    test1Index
  );
  await editValidatedField(page, "Circle Definition Range", "250", test1Index);

  // Wait for re-sort
  await page.waitForTimeout(500);

  // Verify edited circle definitions and sort order
  test1Index = -1;
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < totalItems; i++) {
    const name = await displayField(page, "Circle Definition Name", i).textContent();
    const range = Number(await displayField(page, "Circle Definition Range", i).textContent());
    if (name === `--TEST RADIUS ONE B ${suffix}--` && range === 250) {
      test1Index = i;
    }
    if (name === `--TEST RADIUS TWO ${suffix}--` && range === 100) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test1Index !== -1 && test2Index !== -1 && !orderBroken).toEqual(true);

  // Test cancel on a field edit (dialog cancel)
  await cancelValidatedFieldEdit(page, "Circle Definition Name", "--SHOULD NOT SAVE--", test2Index);

  // Delete first test circle definition
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await page.waitForTimeout(500);

  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 1
  );

  // Verify remaining items and sort order
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < startingNumCircleDefinitions + 1; i++) {
    const name = await displayField(page, "Circle Definition Name", i).textContent();
    const range = Number(await displayField(page, "Circle Definition Range", i).textContent());
    if (name === `--TEST RADIUS TWO ${suffix}--` && range === 100) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test2Index !== -1 && !orderBroken).toEqual(true);

  // Delete second test circle definition
  await page.getByLabel("deleteButton", { exact: true }).nth(test2Index).click();
  await page.waitForTimeout(500);

  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions
  );

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}

/**
 * Find the index of a field by its text content.
 */
async function findFieldIndex(page: Page, ariaLabel: string, text: string): Promise<number> {
  const count = await displayField(page, ariaLabel).count();
  for (let i = 0; i < count; i++) {
    const content = await displayField(page, ariaLabel, i).textContent();
    if (content === text) {
      return i;
    }
  }
  return -1;
}
