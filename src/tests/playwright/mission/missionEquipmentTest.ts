import { Page, expect } from "@playwright/test";

type MissionEquipment = {
  name: string;
  quantity: string;
  singleUse: boolean;
};

const eq1: MissionEquipment = {
  name: "--TEST EQUIPMENT 1--",
  quantity: "5",
  singleUse: true,
};

const eq1Alt: MissionEquipment = {
  name: "--TEST EQUIPMENT 1 ALT--",
  quantity: "20",
  singleUse: true,
};

const eq2: MissionEquipment = {
  name: "--TEST EQUIPMENT 2--",
  quantity: "5",
  singleUse: true,
};

const eq2Alt: MissionEquipment = {
  name: eq2.name,
  quantity: eq2.quantity,
  singleUse: false,
};

export async function missionEquipmentTest(page: Page): Promise<string> {
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

  //go to equipment list
  await page.getByLabel("equipment_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Equipment"
  );

  // Create two pieces of Mission Equipment and index them
  const startingNumEquipment = await page.getByLabel("equipmentList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
  await page.getByLabel("Equipment item name", { exact: true }).last().fill(eq1.name);
  await page.getByLabel("Equipment item quantity", { exact: true }).last().fill(eq1.quantity);
  await page.getByLabel("checkbox", { exact: true }).last().setChecked(eq1.singleUse);
  await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
  await page.getByLabel("Equipment item name", { exact: true }).last().fill(eq2.name);
  await page.getByLabel("Equipment item quantity", { exact: true }).last().fill(eq2.quantity);
  await page.getByLabel("checkbox", { exact: true }).last().setChecked(eq2.singleUse);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  let test1Index = -1;
  let test2Index = -1;
  for (let i = 0; i < startingNumEquipment + 2; i++) {
    const name = await page.getByLabel("Equipment item name").nth(i).textContent();
    if (name === eq1.name) {
      test1Index = i;
    }
    if (name === eq2.name) {
      test2Index = i;
    }
  }
  expect(test1Index !== -1 && test2Index !== -1).toEqual(true);

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );

  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test1Index)
  ).toHaveText(eq1.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test1Index)).toContainText(
    eq1.singleUse ? "Yes" : ""
  );
  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test2Index)
  ).toHaveText(eq2.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test2Index)).toContainText(
    eq2.singleUse ? "Yes" : ""
  );

  // Edit mission equipment and cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("Equipment item name", { exact: true }).nth(test1Index).fill(eq1Alt.name);
  await page
    .getByLabel("Equipment item quantity", { exact: true })
    .nth(test1Index)
    .fill(eq1Alt.quantity);
  await page.getByLabel("checkbox", { exact: true }).nth(test1Index).setChecked(eq1Alt.singleUse);
  await page.getByLabel("Equipment item name", { exact: true }).nth(test2Index).fill(eq2Alt.name);
  await page
    .getByLabel("Equipment item quantity", { exact: true })
    .nth(test2Index)
    .fill(eq2Alt.quantity);
  await page.getByLabel("checkbox", { exact: true }).nth(test2Index).setChecked(eq2Alt.singleUse);
  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );

  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test1Index)
  ).toHaveText(eq1.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test1Index)).toContainText(
    eq1.singleUse ? "Yes" : ""
  );
  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test2Index)
  ).toHaveText(eq2.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test2Index)).toContainText(
    eq2.singleUse ? "Yes" : ""
  );

  // Delete some mission equipment and cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );
  await expect(page.getByLabel("Equipment item name", { exact: true }).nth(test1Index)).toHaveText(
    eq1.name
  );
  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test1Index)
  ).toHaveText(eq1.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test1Index)).toContainText(
    eq1.singleUse ? "Yes" : ""
  );

  // Make sure clicking single use box counts as edit
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
  await page.getByLabel("checkbox", { exact: true }).nth(test2Index).setChecked(eq2Alt.singleUse);
  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test2Index)).toContainText(
    eq2.singleUse ? "Yes" : ""
  );

  // Test edit with eq1
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);
  await page.getByLabel("Equipment item name", { exact: true }).nth(test1Index).fill(eq1Alt.name);
  await page
    .getByLabel("Equipment item quantity", { exact: true })
    .nth(test1Index)
    .fill(eq1Alt.quantity);
  await page.getByLabel("checkbox", { exact: true }).nth(test1Index).setChecked(eq1Alt.singleUse);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test2Index)).toContainText(
    eq2.singleUse ? "Yes" : ""
  );

  test1Index = -1;
  test2Index = -1;
  for (let i = 0; i < startingNumEquipment + 2; i++) {
    const name = await page.getByLabel("Equipment item name").nth(i).textContent();
    if (name === eq1Alt.name) {
      test1Index = i;
    }
    if (name === eq2Alt.name) {
      test2Index = i;
    }
  }
  expect(test1Index !== -1 && test2Index !== -1).toEqual(true);

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );

  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test1Index)
  ).toHaveText(eq1Alt.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test1Index)).toContainText(
    eq1Alt.singleUse ? "Yes" : ""
  );

  await expect(
    page.getByLabel("Equipment item quantity", { exact: true }).nth(test2Index)
  ).toHaveText(eq2Alt.quantity);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(test2Index)).toContainText(
    eq2Alt.singleUse ? "Yes" : ""
  );

  // Test delete while tearing down equipment
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("deleteButton", { exact: true }).nth(test2Index).click();
  await page.getByLabel("deleteButton", { exact: true }).nth(test1Index).click();
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment
  );

  return "success";
}
