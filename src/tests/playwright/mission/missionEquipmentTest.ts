import { Page, expect } from "@playwright/test";

type MissionEquipment = {
  name: string;
  quantity: string;
  singleUse: boolean;
};

const eq1 = {
  name: "--TEST EQUIPMENT 1--",
  quantity: "5",
  singleUse: true,
};

const eq1Alt = {
  name: "--TEST EQUIPMENT 1 ALT--",
  quantity: "20",
  singleUse: true,
};

const eq2 = {
  name: "--TEST EQUIPMENT 1--",
  quantity: "5",
  singleUse: true,
};

const eq2Alt = {
  name: "--TEST EQUIPMENT 2--",
  quantity: "5",
  singleUse: false,
};

export async function missionEquipment(page: Page): Promise<string> {
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
  await page.getByLabel("equipment_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Equipment"
  );

  // Create two pieces of Mission Equipment
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  // Equipment item name
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await page.getByLabel("Equipment item name", { exact: true }).last().fill(eq1.name);
  await page.getByLabel("Equipment item quantity", { exact: true }).last().fill(eq1.quantity);
  await page.getByLabel("checkbox", { exact: true }).last().setChecked(eq1.singleUse);
  await page.getByLabel("addNewRadiusButton", { exact: true }).click();
  await page.getByLabel("Equipment item name", { exact: true }).last().fill(eq2.name);
  await page.getByLabel("Equipment item quantity", { exact: true }).last().fill(eq2.quantity);
  await page.getByLabel("checkbox", { exact: true }).last().setChecked(eq2.singleUse);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  return "success";
}
