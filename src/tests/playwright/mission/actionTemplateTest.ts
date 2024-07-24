import { Page, expect } from "@playwright/test";

type TestingTemplate = {
  tName: string;
  type: string;
  aName: string;
  descr: string;
  min: string;
  max: string;
  pri: string;
  mass: string;
  emoji: string;
};
// Const strings to make testing easier
const t1: TestingTemplate = {
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

const t1Alt: TestingTemplate = {
  tName: "--TEST ACTION TEMPLATE ONE ALT--",
  type: "sample",
  aName: "Action 1",
  descr: "You shouldn't see this :)",
  min: "1",
  max: "4",
  pri: "10",
  mass: "100",
  emoji: "😎",
};

const t1Dup: TestingTemplate = {
  tName: "--TEST ACTION TEMPLATE ONE-- (copy 1)",
  type: "sample",
  aName: "Action 1",
  descr: "You shouldn't see this :)",
  min: "1",
  max: "4",
  pri: "10",
  mass: "100",
  emoji: "😎",
};

const t2: TestingTemplate = {
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

const t2Alt: TestingTemplate = {
  tName: "--TEST ACTION TEMPLATE TWO ALT--",
  type: "photo",
  aName: "Action 2",
  descr: "You shouldn't see this :) (pt 2)",
  min: "2",
  max: "5",
  pri: "20",
  mass: "300",
  emoji: "😎",
};

async function createAndPopulateTemplate(page: Page, t: TestingTemplate) {
  await page.waitForLoadState();
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.waitForLoadState();
  await page.getByLabel("Template Name", { exact: true }).last().fill(t.tName);
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).last().click();
}

async function editTemplate(page: Page, newT: TestingTemplate, tInd: number) {
  await page.getByLabel("Template Name", { exact: true }).nth(tInd).fill(newT.tName);
}

async function checkTemplateData(page: Page, t: TestingTemplate, tInd: number) {
  await expect(page.getByLabel("Template Name", { exact: true }).nth(tInd)).toContainText(t.tName);
}

async function testActionTemplates(page: Page): Promise<string> {
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

  // add two new Action Templates and save
  const startingNumTemplates = await page.getByLabel("templateList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("saveButton")).toBeAttached();

  await createAndPopulateTemplate(page, t1);
  await createAndPopulateTemplate(page, t2);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Check new templates are in
  await expect(
    page.getByLabel("Template Name").filter({ hasText: t1.tName }).last()
  ).toBeAttached();
  await expect(
    page.getByLabel("Template Name").filter({ hasText: t2.tName }).last()
  ).toBeAttached();

  let t1Ind = -1;
  let t2Ind = -1;

  for (let i = 0; i < startingNumTemplates + 2; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    if (name === t1.tName) {
      t1Ind = i;
    }
    if (name === t2.tName) {
      t2Ind = i;
    }
  }

  // Edit t2, then save
  await page.getByLabel("Edit", { exact: true }).click();
  await editTemplate(page, t2Alt, t2Ind);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(1000);

  t1Ind = -1;
  t2Ind = -1;

  for (let i = 0; i < startingNumTemplates + 2; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    if (name === t1.tName) {
      t1Ind = i;
    }
    if (name === t2Alt.tName) {
      t2Ind = i;
    }
  }

  await checkTemplateData(page, t1, t1Ind);
  await checkTemplateData(page, t2Alt, t2Ind);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Duplicate t1
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Ind).click();
  await page.getByLabel("Duplicate", { exact: true }).nth(t1Ind).click();
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(1000);

  t1Ind = -1;
  t2Ind = -1;
  let t1DupInd = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    if (name === t1.tName) {
      t1Ind = i;
    }
    if (name === t1Dup.tName) {
      t1DupInd = i;
    }
    if (name === t2Alt.tName) {
      t2Ind = i;
    }
  }

  await checkTemplateData(page, t1, t1Ind);
  await checkTemplateData(page, t1Dup, t1DupInd);
  await checkTemplateData(page, t2Alt, t2Ind);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Edit t1, delete t2, cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.waitForTimeout(200);
  await editTemplate(page, t1Alt, t1Ind);
  const dialogPromiseToCancel = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Ind).click();
  await page.getByLabel("Delete", { exact: true }).nth(t1Ind).click();
  await dialogPromiseToCancel;
  await page.waitForTimeout(200);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.waitForTimeout(1000);

  t1Ind = -1;
  t2Ind = -1;
  t1DupInd = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    if (name === t1.tName) {
      t1Ind = i;
    }
    if (name === t1Dup.tName) {
      t1DupInd = i;
    }
    if (name === t2Alt.tName) {
      t2Ind = i;
    }
  }

  await checkTemplateData(page, t1, t1Ind);
  await checkTemplateData(page, t1Dup, t1DupInd);
  await checkTemplateData(page, t2Alt, t2Ind);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Delete t2
  await page.getByLabel("Edit", { exact: true }).click();
  const dialogPromiseToSave = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Ind).click();
  await page.getByLabel("Delete", { exact: true }).nth(t1Ind).click();
  await dialogPromiseToSave;
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(1000);

  t2Ind = -1;
  t1DupInd = -1;

  for (let i = 0; i < startingNumTemplates + 2; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    if (name === t1Dup.tName) {
      t1DupInd = i;
    }
    if (name === t2Alt.tName) {
      t2Ind = i;
    }
  }

  await checkTemplateData(page, t1Dup, t1DupInd);
  await checkTemplateData(page, t2Alt, t2Ind);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Test expand all and collapse all in viewing and edit mode
  await page.getByLabel("Expand All Button", { exact: true }).click();
  await expect(page.getByLabel("Minimum Time in minutes", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );
  await page.getByLabel("Collapse All Button", { exact: true }).click();
  await expect(page.getByLabel("Minimum Time in minutes", { exact: true })).toHaveCount(0);

  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("Expand All Button", { exact: true }).click();
  await expect(page.getByLabel("Minimum Time in minutes", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );
  await page.getByLabel("Collapse All Button", { exact: true }).click();
  await expect(page.getByLabel("Minimum Time in minutes", { exact: true })).toHaveCount(0);

  await page.getByLabel("cancelButton", { exact: true }).click();

  // Tear down rest of action templates
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("Template Menu", { exact: true }).nth(t2Ind).click();
  const dialogPromiseTeardownOne = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t2Ind).click();
  await dialogPromiseTeardownOne;
  await page.getByLabel("Template Menu", { exact: true }).nth(t1DupInd).click();
  const dialogPromiseTeardownTwo = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t1DupInd).click();
  await dialogPromiseTeardownTwo;
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates
  );

  return "success";
}

export default testActionTemplates;
