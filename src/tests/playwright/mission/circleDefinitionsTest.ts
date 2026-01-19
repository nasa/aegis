import { expect, Page } from "@playwright/test";

async function waitForSaveButton(page: Page, isActive: boolean) {
  const dataTooltipContent = isActive ? "Save Mission" : "Save Mission (nothing to save)";
  await page.getByLabel("saveButton").waitFor({ timeout: 1000 });
  await expect(page.getByLabel("saveButton")).toHaveAttribute(
    "data-tooltip-html",
    dataTooltipContent,
    {
      timeout: 1000,
    }
  );
}

export async function circleDefinitionsTest(page: Page): Promise<string> {
  await page.goto("http://localhost:4000/mission/22");
  //go to mission section
  await page.waitForLoadState("networkidle");
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  //go to circle definitions list
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Proximity Circle Definitions"
  );

  //add two new circle definitions and save
  const startingNumCircleDefinitions = await page
    .getByLabel("circle-definition-item", { exact: true })
    .count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);

  // Add first circle definition - track the focused input
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  // The newly added name input should have focus
  const focusedInput1 = page.locator('input[name="circleDefName"]:focus');
  await expect(focusedInput1).toBeFocused();
  await focusedInput1.fill("--TEST RADIUS ONE--");
  // Find the row by the unique name we just filled
  const row1 = page.locator(
    'li[aria-label="circle-definition-item"]:has(input[name="circleDefName"][value="--TEST RADIUS ONE--"])'
  );
  const rangeInput1 = row1.getByLabel("Circle Definition Range");
  await rangeInput1.fill("1");

  // Add second circle definition - track the focused input
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  const focusedInput2 = page.locator('input[name="circleDefName"]:focus');
  await expect(focusedInput2).toBeFocused();
  await focusedInput2.fill("--TEST RADIUS TWO--");
  // Find the row by the unique name we just filled
  const row2 = page.locator(
    'li[aria-label="circle-definition-item"]:has(input[name="circleDefName"][value="--TEST RADIUS TWO--"])'
  );
  const rangeInput2 = row2.getByLabel("Circle Definition Range");
  await rangeInput2.fill("100");

  await waitForSaveButton(page, true);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  //check saved circle definitions
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 2
  );
  let test1Index = -1;
  let test2Index = -1;
  let orderBroken = false;
  let prevRange = 0;
  for (let i = 0; i < startingNumCircleDefinitions + 2; i++) {
    const name = await page.getByLabel("Circle Definition Name").nth(i).textContent();
    const range = Number(await page.getByLabel("Circle Definition Range").nth(i).textContent());
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
  console.log("test1Index:", test1Index, "test2Index:", test2Index, "orderBroken:", orderBroken);
  expect(test1Index !== -1 && test2Index !== -1 && !orderBroken).toEqual(true);

  //edit and check saved circle definitions.
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await page.getByLabel("Circle Definition Name").nth(test1Index).fill("--TEST RADIUS ONE B--");
  await page.getByLabel("Circle Definition Range").nth(test1Index).fill("250");
  await waitForSaveButton(page, true);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();
  test1Index = -1;
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < startingNumCircleDefinitions + 2; i++) {
    const name = await page.getByLabel("Circle Definition Name").nth(i).textContent();
    const range = Number(await page.getByLabel("Circle Definition Range").nth(i).textContent());
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

  //edit and cancel saved circle definitions
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await page.getByLabel("saveButton");
  await page.getByLabel("Circle Definition Name").nth(test2Index).fill("--TEST RADIUS TWO B--");
  await page.getByLabel("Circle Definition Range").nth(test2Index).fill("1");
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await waitForSaveButton(page, true);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 2
  );
  await expect(page.getByLabel("Circle Definition Range").nth(test1Index)).toContainText("250");
  await expect(page.getByLabel("Circle Definition Range").nth(test2Index)).toContainText("100");

  // delete saved circle definitions
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await waitForSaveButton(page, true);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions + 1
  );
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < startingNumCircleDefinitions + 1; i++) {
    const name = await page.getByLabel("Circle Definition Name").nth(i).textContent();
    const range = Number(await page.getByLabel("Circle Definition Range").nth(i).textContent());
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

  await expect(page.getByLabel("Circle Definition Name").nth(test2Index)).toContainText(
    "--TEST RADIUS TWO--"
  );
  await expect(page.getByLabel("Circle Definition Range").nth(test2Index)).toContainText("1");

  //delete and save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await waitForSaveButton(page, false);
  await page.getByLabel("deleteButton", { exact: true }).nth(test2Index).click();
  await waitForSaveButton(page, true);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();
  await expect(page.getByLabel("saveButton", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("circle-definition-item", { exact: true })).toHaveCount(
    startingNumCircleDefinitions
  );

  return "success";
}
