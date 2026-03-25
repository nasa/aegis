import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  displayField,
} from "./missionTestHelpers";

const t1 = "--TEST ACTION TEMPLATE ONE--";
const t1Dup = "--TEST ACTION TEMPLATE ONE-- (copy";
const t2 = "--TEST ACTION TEMPLATE TWO--";
const t2Edited = "--TEST ACTION TEMPLATE TWO EDITED--";

/**
 * Find the index of a template by exact name.
 */
async function findTemplateIndexExactName(page: Page, name: string): Promise<number> {
  const count = await displayField(page, "Template Name").count();
  for (let i = 0; i < count; i++) {
    const text = await displayField(page, "Template Name", i).textContent();
    if (text === name) return i;
  }
  return -1;
}

/**
 * Find the index of a template that includes the given text in its name.
 */
async function findTemplateIndexIncludesString(page: Page, text: string): Promise<number> {
  const count = await displayField(page, "Template Name").count();
  for (let i = 0; i < count; i++) {
    const name = await displayField(page, "Template Name", i).textContent();
    if (name.includes(text)) return i;
  }
  return -1;
}

async function createAndRenameTemplate(page: Page, t: string) {
  // Get current template names before adding
  const countBefore = await page.getByLabel("templateList-item", { exact: true }).count();
  const namesBefore: string[] = [];
  for (let i = 0; i < countBefore; i++) {
    namesBefore.push(await displayField(page, "Template Name", i).textContent());
  }

  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.waitForTimeout(500);

  // Find the new template (the name that wasn't there before)
  const countAfter = await page.getByLabel("templateList-item", { exact: true }).count();
  expect(countAfter).toEqual(countBefore + 1);

  let newIndex = -1;
  for (let i = 0; i < countAfter; i++) {
    const name = await displayField(page, "Template Name", i).textContent();
    if (!namesBefore.includes(name)) {
      newIndex = i;
      break;
    }
  }
  expect(newIndex).not.toEqual(-1);

  // Edit the template name via the ValidatedInputField dialog
  await editValidatedField(page, "Template Name", t, newIndex);
}

export async function actionTemplatesTest(page: Page): Promise<string> {
  await goToV2MissionSection(page);

  // Go to action templates
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Action Templates"
  );

  // Count starting templates
  const startingNumTemplates = await page.getByLabel("templateList-item", { exact: true }).count();

  // Turn on edit mode
  await toggleEditMode(page);

  // Add two new Action Templates
  await createAndRenameTemplate(page, t1);
  await createAndRenameTemplate(page, t2);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Check new templates exist
  await expect(displayField(page, "Template Name").filter({ hasText: t1 }).last()).toBeAttached();
  await expect(displayField(page, "Template Name").filter({ hasText: t2 }).last()).toBeAttached();

  let t1Index = await findTemplateIndexExactName(page, t1);
  let t2Index = await findTemplateIndexExactName(page, t2);

  // Edit t2 name
  await editValidatedField(page, "Template Name", t2Edited, t2Index);

  // Find updated indices
  t1Index = await findTemplateIndexExactName(page, t1);
  t2Index = await findTemplateIndexExactName(page, t2Edited);

  await expect(displayField(page, "Template Name", t1Index)).toContainText(t1);
  await expect(displayField(page, "Template Name", t2Index)).toContainText(t2Edited);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Duplicate t1
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Index).click();
  await page.locator("dialog[open]").getByLabel("Duplicate", { exact: true }).click();
  await page.waitForTimeout(500);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  t1Index = await findTemplateIndexExactName(page, t1);
  t2Index = await findTemplateIndexExactName(page, t2Edited);
  let t1DupInd = await findTemplateIndexIncludesString(page, t1Dup);

  await expect(displayField(page, "Template Name", t1Index)).toContainText(t1);
  await expect(displayField(page, "Template Name", t1DupInd)).toContainText(t1Dup);
  await expect(displayField(page, "Template Name", t2Index)).toContainText(t2Edited);

  // Test cancel on field edit (dialog cancel)
  const originalName = await displayField(page, "Template Name", t1Index).textContent();
  await displayField(page, "Template Name", t1Index).click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor({ timeout: 3000 });
  await dialog.locator("input").fill("--SHOULD NOT SAVE--");
  await dialog.getByText("Cancel").click();
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
  await expect(displayField(page, "Template Name", t1Index)).toContainText(originalName);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Delete t1 (confirm dialog)
  t1Index = await findTemplateIndexExactName(page, t1);
  const dialogPromiseToSave = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Index).click();
  await page.locator("dialog[open]").getByLabel("Delete", { exact: true }).click();
  await dialogPromiseToSave;
  await page.waitForTimeout(500);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  t2Index = await findTemplateIndexExactName(page, t2Edited);
  t1DupInd = await findTemplateIndexIncludesString(page, t1Dup);

  await expect(displayField(page, "Template Name", t1DupInd)).toContainText(t1Dup);
  await expect(displayField(page, "Template Name", t2Index)).toContainText(t2Edited);

  // Test expand all and collapse all
  await page.getByLabel("Expand All Button", { exact: true }).click();
  await expect(displayField(page, "Duration in minutes")).toHaveCount(startingNumTemplates + 2);
  await page.getByLabel("Collapse All Button", { exact: true }).click();
  await expect(displayField(page, "Duration in minutes")).toHaveCount(0);

  // Tear down remaining test action templates
  t2Index = await findTemplateIndexExactName(page, t2Edited);
  const dialogPromiseTeardownOne = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Template Menu", { exact: true }).nth(t2Index).click();
  await page.locator("dialog[open]").getByLabel("Delete", { exact: true }).click();
  await dialogPromiseTeardownOne;
  await page.waitForTimeout(500);

  t1DupInd = await findTemplateIndexIncludesString(page, t1Dup);
  const dialogPromiseTeardownTwo = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Template Menu", { exact: true }).nth(t1DupInd).click();
  await page.locator("dialog[open]").getByLabel("Delete", { exact: true }).click();
  await dialogPromiseTeardownTwo;
  await page.waitForTimeout(500);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates
  );

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
