import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  displayField,
} from "./missionTestHelpers";

export async function circleDefinitionsTest(page: Page): Promise<string> {
  await goToV2MissionSection(page);

  // Go to circle definitions list
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Proximity Circle Definitions"
  );

  // Count starting items
  const startingNumCircleDefinitions = await page
    .getByLabel("circle-definition-item", { exact: true })
    .count();

  // Turn on edit mode
  await toggleEditMode(page);

  // Add first circle definition
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  // Wait for new item to appear
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 1
  );
  // Find the new item by its default name and edit it
  await editValidatedField(
    page,
    "Circle Definition Name",
    "--TEST RADIUS ONE--",
    await findFieldIndex(page, "Circle Definition Name", "(Circle Definition Name)")
  );

  // Edit radius of the first new item - find the item by name and edit its radius
  const test1RowIndex = await findFieldIndex(page, "Circle Definition Name", "--TEST RADIUS ONE--");
  await editValidatedField(page, "Circle Definition Range", "1", test1RowIndex);

  // Add second circle definition
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 2
  );
  // Find and edit the new default-named item
  const newItem2Index = await findFieldIndex(
    page,
    "Circle Definition Name",
    "(Circle Definition Name)"
  );
  await editValidatedField(page, "Circle Definition Name", "--TEST RADIUS TWO--", newItem2Index);
  const test2RowIndex = await findFieldIndex(page, "Circle Definition Name", "--TEST RADIUS TWO--");
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
    if (name === "--TEST RADIUS ONE--" && range === 1) {
      test1Index = i;
    }
    if (name === "--TEST RADIUS TWO--" && range === 100) {
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
  await editValidatedField(page, "Circle Definition Name", "--TEST RADIUS ONE B--", test1Index);
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
    if (name === "--TEST RADIUS ONE B--" && range === 250) {
      test1Index = i;
    }
    if (name === "--TEST RADIUS TWO--" && range === 100) {
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
  const originalName = await displayField(page, "Circle Definition Name", test2Index).textContent();
  await displayField(page, "Circle Definition Name", test2Index).click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: 3000 });
  await dialog.locator("input").fill("--SHOULD NOT SAVE--");
  await dialog.getByText("Cancel").click();
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
  await expect(displayField(page, "Circle Definition Name", test2Index)).toContainText(
    originalName
  );

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
    if (name === "--TEST RADIUS TWO--" && range === 100) {
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
