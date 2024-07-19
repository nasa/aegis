import { test, expect } from "@playwright/test";

test("create edit cancel delete radii", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  //go to mission section
  await page.waitForTimeout(2000);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  //go to radii list
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Vector Definitions"
  );

  //add a new radius, check initial values, and cancel (not saved)
  const startingNumRadii = await page.getByLabel("radiiList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await await page
    .getByLabel("Lander radius name")
    .last()
    .pressSequentially("--TEST DISCARD RADIUS ONE--");
  await await page.getByLabel("Lander radius range").last().fill("100");
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await await page
    .getByLabel("Lander radius name")
    .last()
    .pressSequentially("--TEST DISCARD RADIUS TWO--");
  await await page.getByLabel("Lander radius range").last().fill("101");
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(
    startingNumRadii + 4
  );
  await page.getByLabel("cancelButton", { exact: true }).click();
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(startingNumRadii);

  //add two new radii and save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await expect(await page.getByLabel("Lander radius name").last()).toHaveValue(
    "(Lander Radius Name)"
  );
  await expect(await page.getByLabel("Lander radius range").last()).toHaveValue("0");
  await page.getByLabel("Lander radius name").last().fill("");
  await page.getByLabel("Lander radius name").last().pressSequentially("--TEST RADIUS ONE--");
  await page.getByLabel("Lander radius range").last().fill("");
  await page.getByLabel("Lander radius range").last().pressSequentially("1");
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await page.getByLabel("Lander radius name").last().fill("");
  await page.getByLabel("Lander radius name").last().pressSequentially("--TEST RADIUS TWO--");
  await page.getByLabel("Lander radius range").last().fill("");
  await page.getByLabel("Lander radius range").last().pressSequentially("100");
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  //check saved radii
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(
    startingNumRadii + 2
  );
  let test1Index = -1;
  let test2Index = -1;
  let orderBroken = false;
  let prevRange = 0;
  for (let i = 0; i < startingNumRadii + 2; i++) {
    const name = await page.getByLabel("Lander radius name").nth(i).textContent();
    const range = Number(await page.getByLabel("Lander radius range").nth(i).textContent());
    if (name === "--TEST RADIUS ONE--" && range === 1) {
      test1Index = i;
    }
    if (name === "--TEST RADIUS TWO--" && range == 100) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test1Index !== -1 && test2Index !== -1 && !orderBroken).toEqual(true);

  //edit and check saved radii.
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Lander radius name").nth(test1Index).fill("");
  await page.waitForTimeout(100);
  await page
    .getByLabel("Lander radius name")
    .nth(test1Index)
    .pressSequentially("--TEST RADIUS ONE B--");
  await page.getByLabel("Lander radius range").nth(test1Index).fill("");
  await page.waitForTimeout(100);
  await page.getByLabel("Lander radius range").nth(test1Index).pressSequentially("250");
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);
  test1Index = -1;
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < startingNumRadii + 2; i++) {
    const name = await page.getByLabel("Lander radius name").nth(i).textContent();
    const range = Number(await page.getByLabel("Lander radius range").nth(i).textContent());
    if (name === "--TEST RADIUS ONE B--" && range === 250) {
      test1Index = i;
    }
    if (name === "--TEST RADIUS TWO--" && range == 100) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test1Index !== -1 && test2Index !== -1 && !orderBroken).toEqual(true);

  //edit and cancel saved radii
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Lander radius name").nth(test2Index).fill("");
  await page
    .getByLabel("Lander radius name")
    .nth(test2Index)
    .pressSequentially("--TEST RADIUS TWO B--");
  await page.getByLabel("Lander radius range").nth(test2Index).fill("");
  await page.getByLabel("Lander radius range").nth(test2Index).pressSequentially("1");
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(
    startingNumRadii + 2
  );
  await expect(page.getByLabel("Lander radius name").nth(test1Index)).toContainText(
    "--TEST RADIUS ONE B--"
  );
  await expect(page.getByLabel("Lander radius range").nth(test1Index)).toContainText("250");
  await expect(page.getByLabel("Lander radius name").nth(test2Index)).toContainText(
    "--TEST RADIUS TWO--"
  );
  await expect(page.getByLabel("Lander radius range").nth(test2Index)).toContainText("100");

  //edit and delete saved radii
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Lander radius name").nth(test2Index).fill("");
  await page
    .getByLabel("Lander radius name")
    .nth(test2Index)
    .pressSequentially("--TEST RADIUS TWO B--");
  await page.getByLabel("Lander radius range").nth(test2Index).fill("");
  await page.getByLabel("Lander radius range").nth(test2Index).pressSequentially("1");
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(
    startingNumRadii + 1
  );
  test2Index = -1;
  orderBroken = false;
  prevRange = 0;
  for (let i = 0; i < startingNumRadii + 1; i++) {
    const name = await page.getByLabel("Lander radius name").nth(i).textContent();
    const range = Number(await page.getByLabel("Lander radius range").nth(i).textContent());
    if (name === "--TEST RADIUS TWO B--" && range == 1) {
      test2Index = i;
    }
    if (range < prevRange) {
      orderBroken = true;
      break;
    }
    prevRange = range;
  }
  expect(test2Index !== -1 && !orderBroken).toEqual(true);

  await expect(page.getByLabel("Lander radius name").nth(test2Index)).toContainText(
    "--TEST RADIUS TWO B--"
  );
  await expect(page.getByLabel("Lander radius range").nth(test2Index)).toContainText("1");

  //delete and save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("deleteButton", { exact: true }).nth(test2Index).click();
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("radiiList-item", { exact: true })).toHaveCount(startingNumRadii);
});
