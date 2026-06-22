import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  cancelValidatedFieldEdit,
  displayField,
} from "./missionTestHelpers";

type MissionEquipment = {
  name: string;
  quantity: string;
  singleUse: boolean;
};

/**
 * Find the index of an equipment item by name.
 */
async function findEquipmentIndexExactName(page: Page, name: string): Promise<number> {
  const count = await displayField(page, "Equipment item name").count();
  for (let i = 0; i < count; i++) {
    const text = await displayField(page, "Equipment item name", i).textContent();
    if (text === name) return i;
  }
  return -1;
}

export async function missionEquipmentTest(page: Page): Promise<string> {
  // Equipment names are built per-run with a random suffix inside
  // missionEquipmentTest to avoid `Name must be unique` failures from leftover
  // automerge state.
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  const equip1: MissionEquipment = {
    name: `--TEST EQUIPMENT 1 ${suffix}--`,
    quantity: "5",
    singleUse: true,
  };
  const equip1Edited: MissionEquipment = {
    name: `--TEST EQUIPMENT 1 ${suffix} EDITED--`,
    quantity: "20",
    singleUse: true,
  };
  const equip2: MissionEquipment = {
    name: `--TEST EQUIPMENT 2 ${suffix}--`,
    quantity: "5",
    singleUse: true,
  };
  const equip2Edited: MissionEquipment = {
    name: equip2.name,
    quantity: equip2.quantity,
    singleUse: false,
  };

  await goToV2MissionSection(page);

  // Go to equipment list
  await page.getByLabel("equipment_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Equipment"
  );

  // Count starting items
  const startingNumEquipment = await page.getByLabel("equipmentList-item", { exact: true }).count();

  // Turn on edit mode
  await toggleEditMode(page);

  // Create first equipment item
  await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 1
  );
  // Find the new default-named item and edit it
  let defaultIndex = await findEquipmentIndexExactName(page, "(Equipment Name)");
  await editValidatedField(page, "Equipment item name", equip1.name, defaultIndex);
  let eq1Index = await findEquipmentIndexExactName(page, equip1.name);
  await editValidatedField(page, "Equipment item quantity", equip1.quantity, eq1Index);
  // Set single use checkbox
  if (equip1.singleUse) {
    await page.getByLabel("checkbox", { exact: true }).nth(eq1Index).setChecked(true);
  }

  // Create second equipment item
  await page.getByLabel("addNewEquipmentButton", { exact: true }).click();
  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );
  defaultIndex = await findEquipmentIndexExactName(page, "(Equipment Name)");
  await editValidatedField(page, "Equipment item name", equip2.name, defaultIndex);
  let eq2Index = await findEquipmentIndexExactName(page, equip2.name);
  await editValidatedField(page, "Equipment item quantity", equip2.quantity, eq2Index);
  if (equip2.singleUse) {
    await page.getByLabel("checkbox", { exact: true }).nth(eq2Index).setChecked(true);
  }

  // Verify items are saved (re-find indices since items are sorted alphabetically)
  eq1Index = await findEquipmentIndexExactName(page, equip1.name);
  eq2Index = await findEquipmentIndexExactName(page, equip2.name);
  expect(eq1Index !== -1 && eq2Index !== -1).toEqual(true);

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment + 2
  );

  await expect(displayField(page, "Equipment item quantity", eq1Index)).toContainText(
    equip1.quantity
  );
  await expect(page.getByLabel("checkbox", { exact: true }).nth(eq1Index)).toBeChecked({
    checked: equip1.singleUse,
  });
  await expect(displayField(page, "Equipment item quantity", eq2Index)).toContainText(
    equip2.quantity
  );
  await expect(page.getByLabel("checkbox", { exact: true }).nth(eq2Index)).toBeChecked({
    checked: equip2.singleUse,
  });

  // Test cancel on field edit (dialog cancel)
  eq1Index = await findEquipmentIndexExactName(page, equip1.name);
  await cancelValidatedFieldEdit(page, "Equipment item name", "--SHOULD NOT SAVE--", eq1Index);

  // Edit eq1 name and quantity
  eq1Index = await findEquipmentIndexExactName(page, equip1.name);
  await editValidatedField(page, "Equipment item name", equip1Edited.name, eq1Index);
  const eq1AltIndex = await findEquipmentIndexExactName(page, equip1Edited.name);
  await editValidatedField(page, "Equipment item quantity", equip1Edited.quantity, eq1AltIndex);

  // Verify edited values
  const updatedEq1Index = await findEquipmentIndexExactName(page, equip1Edited.name);
  expect(updatedEq1Index !== -1).toEqual(true);
  await expect(displayField(page, "Equipment item quantity", updatedEq1Index)).toContainText(
    equip1Edited.quantity
  );

  // Toggle single use on eq2 (to check checkbox works)
  eq2Index = await findEquipmentIndexExactName(page, equip2.name);
  await page
    .getByLabel("checkbox", { exact: true })
    .nth(eq2Index)
    .setChecked(equip2Edited.singleUse);

  // Verify checkbox state persisted
  // Turn edit mode off and check
  await toggleEditMode(page);

  eq2Index = await findEquipmentIndexExactName(page, equip2.name);
  await expect(page.getByLabel("checkboxText", { exact: true }).nth(eq2Index)).toContainText(
    equip2Edited.singleUse ? "Yes" : ""
  );

  // Turn edit mode back on for cleanup
  await toggleEditMode(page);

  // Delete both test equipment items
  // Delete eq2 first (it may have a higher index)
  eq2Index = await findEquipmentIndexExactName(page, equip2.name);
  const eq1AltIdx = await findEquipmentIndexExactName(page, equip1Edited.name);
  // Delete the one with the higher index first to avoid index shifting
  if (eq2Index > eq1AltIdx) {
    await page.getByLabel("deleteButton", { exact: true }).nth(eq2Index).click();
    await page.waitForTimeout(500);
    await page.getByLabel("deleteButton", { exact: true }).nth(eq1AltIdx).click();
  } else {
    await page.getByLabel("deleteButton", { exact: true }).nth(eq1AltIdx).click();
    await page.waitForTimeout(500);
    await page.getByLabel("deleteButton", { exact: true }).nth(eq2Index).click();
  }
  await page.waitForTimeout(500);

  await expect(page.getByLabel("equipmentList-item", { exact: true })).toHaveCount(
    startingNumEquipment
  );

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
