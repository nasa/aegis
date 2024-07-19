import { test, expect } from "@playwright/test";

// Const strings to make testing easier
const t1 = {
  tName: "--TEST ACTION TEMPLATE ONE--",
  type: "sample",
  aName: "Action 1",
  descr: "You shouldn't see this :)",
  min: "1",
  max: "4",
  pri: "10",
  mass: "100",
  emoji: "😎",
};

const t2 = {
  tName: "--TEST ACTION TEMPLATE TWO--",
  type: "photo",
  aName: "Action 2",
  descr: "You shouldn't see this :) (pt 2)",
  min: "2",
  max: "5",
  pri: "20",
  mass: "300",
  emoji: "😎",
};

const t3 = {
  tName: "--TEST ACTION TEMPLATE THREE--",
  type: "other",
  aName: "Action 3",
  descr: "You shouldn't see this :) (pt 3)",
  min: "3",
  max: "6",
  pri: "30",
  mass: "300",
  emoji: "😎",
};

const td = {
  tName: "--DISPOSABLE ACTION TEMPLATE--",
  type: "sample",
  aName: "disposable",
  descr: "disposable",
  min: "1",
  max: "1",
  pri: "99",
  mass: "1",
  emoji: "😎",
};

test("create edit cancel delete actionTemplates", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  // go to mission section
  await page.waitForTimeout(2000);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  // go to action templates
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Action Templates"
  );

  // add four new Action Templates, fill them with data, delete the disposable one, and save
  const startingNumTemplates = await page.getByLabel("templateList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  // template one
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.getByLabel("Template Name", { exact: true }).last().pressSequentially(t1.tName);
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  await page.getByLabel("dropdown", { exact: true }).last().selectOption(t1.type);
  await page.getByLabel("Action Title", { exact: true }).last().pressSequentially(t1.aName);
  await page.getByLabel("Template Description", { exact: true }).last().pressSequentially(t1.descr);
  await page
    .getByLabel("Minimum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t1.min);
  await page
    .getByLabel("Maximum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t1.max);
  await page.getByLabel("Priority", { exact: true }).last().pressSequentially(t1.pri);
  await page.getByLabel("Expected Sample Mass", { exact: true }).last().pressSequentially(t1.mass);
  await page.getByLabel("Emoji Menu Toggle", { exact: true }).last().click();
  await page.getByLabel(t1.emoji, { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).last().click();

  // template two
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.getByLabel("Template Name", { exact: true }).last().pressSequentially(t2.tName);
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  await page.getByLabel("dropdown", { exact: true }).last().selectOption(t2.type);
  await page.getByLabel("Action Title", { exact: true }).last().pressSequentially(t2.aName);
  await page.getByLabel("Template Description", { exact: true }).last().pressSequentially(t2.descr);
  await page
    .getByLabel("Minimum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t2.min);
  await page
    .getByLabel("Maximum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t2.max);
  await page.getByLabel("Priority", { exact: true }).last().pressSequentially(t2.pri);
  await page.getByLabel("Expected Sample Mass", { exact: true }).last().pressSequentially(t2.mass);
  await page.getByLabel("Emoji Menu Toggle", { exact: true }).last().click();
  await page.getByLabel(t2.emoji, { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  // template three
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.getByLabel("Template Name", { exact: true }).last().pressSequentially(td.tName);
  // template four
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.getByLabel("Template Name", { exact: true }).last().pressSequentially(t3.tName);
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  await page.getByLabel("dropdown", { exact: true }).last().selectOption(t3.type);
  await page.getByLabel("Action Title", { exact: true }).last().pressSequentially(t3.aName);
  await page.getByLabel("Template Description", { exact: true }).last().pressSequentially(t3.descr);
  await page
    .getByLabel("Minimum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t3.min);
  await page
    .getByLabel("Maximum Time in minutes", { exact: true })
    .last()
    .pressSequentially(t3.max);
  await page.getByLabel("Priority", { exact: true }).last().pressSequentially(t3.pri);
  await page.getByLabel("Expected Sample Mass", { exact: true }).last().pressSequentially(t3.mass);
  await page.getByLabel("Emoji Menu Toggle", { exact: true }).last().click();
  await page.getByLabel(t3.emoji, { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).last().click();

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 4
  );

  await page
    .getByLabel("Template Menu", { exact: true })
    .nth(startingNumTemplates + 2)
    .click();
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page
    .getByLabel("Delete", { exact: true })
    .nth(startingNumTemplates + 2)
    .click();
  await dialogPromise;

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Grab indicies and verify saved data is correct

  let t1Ind = -1;
  let t2Ind = -1;
  let t3Ind = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    const type = await page.getByLabel("Action Template Type").nth(i).textContent();
    if (name === t1.tName && type === t1.type) {
      t1Ind = i;
    }
    if (name === t2.tName && type === t2.type) {
      t2Ind = i;
    }
    if (name === t3.tName && type === t3.type) {
      t3Ind = i;
    }
  }

  await expect(t1Ind !== -1 && t2Ind !== -1 && t3Ind !== -1).toEqual(true);

  await page.getByLabel("Expand Button", { exact: true }).nth(t2Ind).click();
  await expect(page.getByLabel("Template Name", { exact: true }).nth(t2Ind)).toContainText(
    t1.tName
  );
  await page.getByLabel("Expand Button", { exact: true }).nth(t2Ind).click();
  await expect(page.getByLabel("dropdown", { exact: true }).nth(t2Ind)).toContainText(t2.type);
  await expect(page.getByLabel("Action Title", { exact: true }).nth(t2Ind)).toContainText(t2.aName);
  await expect(page.getByLabel("Template Description", { exact: true }).nth(t2Ind)).toContainText(
    t2.descr
  );
  await expect(
    page.getByLabel("Minimum Time in minutes", { exact: true }).nth(t2Ind)
  ).toContainText(t2.min);
  await expect(
    page.getByLabel("Maximum Time in minutes", { exact: true }).nth(t2Ind)
  ).toContainText(t2.max);
  await expect(page.getByLabel("Priority", { exact: true }).nth(t1Ind)).toContainText(t2.pri);
  await expect(page.getByLabel("Expected Sample Mass", { exact: true }).nth(t2Ind)).toContainText(
    t2.mass
  );
  await expect(page.getByLabel("Emoji Display", { exact: true }).nth(t2Ind)).toContainText("😎");
  await page.getByLabel("Expand Button", { exact: true }).nth(t2Ind).click();
});
