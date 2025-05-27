import { expect, Page } from "@playwright/test";

type GeoUnit = {
  name: string;
};

const geo1: GeoUnit = {
  name: "--TEST UNIT 1--",
};

const geo1Alt: GeoUnit = {
  name: "--TEST UNIT 1 ALT--",
};

const geo2: GeoUnit = {
  name: "--TEST UNIT 2--",
};

export async function geoUnitsTest(page: Page): Promise<string> {
  await page.goto("http://localhost:4000/mission/22");
  //go to mission preferences
  await page.waitForTimeout(2000);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  //go to units list

  await page.getByLabel("geographicUnit_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Geography"
  );

  // Create two pieces of Mission Equipment and index them
  const startingNumGeoUnits = await page.getByLabel("geoUnitList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("addGeoUnitButton", { exact: true }).click();
  await page.getByLabel("Geographic unit name", { exact: true }).last().fill(geo1.name);
  await page.getByLabel("addGeoUnitButton", { exact: true }).click();
  await page.getByLabel("Geographic unit name", { exact: true }).last().fill(geo2.name);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(
    startingNumGeoUnits + 2
  );

  let test1Index = -1;
  let test2Index = -1;
  for (let i = 0; i < startingNumGeoUnits + 2; i++) {
    const name = await page.getByLabel("Geographic unit name").nth(i).textContent();
    if (name === geo1.name) {
      test1Index = i;
    }
    if (name === geo2.name) {
      test2Index = i;
    }
  }
  expect(test1Index !== -1 && test2Index !== -1).toEqual(true);

  // Edit Geo Unit and cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("Geographic unit name", { exact: true }).nth(test1Index).fill(geo1Alt.name);

  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(
    startingNumGeoUnits + 2
  );

  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test1Index)).toHaveText(
    geo1.name
  );
  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test2Index)).toHaveText(
    geo2.name
  );

  // Edit Geo Unit and save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("Geographic unit name", { exact: true }).nth(test1Index).fill(geo1Alt.name);

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(
    startingNumGeoUnits + 2
  );

  test1Index = -1;
  test2Index = -1;
  for (let i = 0; i < startingNumGeoUnits + 2; i++) {
    const name = await page.getByLabel("Geographic unit name").nth(i).textContent();
    if (name === geo1Alt.name) {
      test1Index = i;
    }
    if (name === geo2.name) {
      test2Index = i;
    }
  }

  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test1Index)).toHaveText(
    geo1Alt.name
  );
  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test2Index)).toHaveText(
    geo2.name
  );

  expect(test1Index !== -1 && test2Index !== -1).toEqual(true);

  // Delete Geo Unit and Cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();

  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(
    startingNumGeoUnits + 2
  );

  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test1Index)).toHaveText(
    geo1Alt.name
  );
  await expect(page.getByLabel("Geographic unit name", { exact: true }).nth(test2Index)).toHaveText(
    geo2.name
  );

  // Delete Geo Units and Save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("deleteButton", { exact: true }).nth(test2Index).click();
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("geoUnitList-item", { exact: true })).toHaveCount(
    startingNumGeoUnits
  );

  return "success";
}
