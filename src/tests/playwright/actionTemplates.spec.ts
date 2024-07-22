import { test, expect, Page } from "@playwright/test";

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
  aName: "Action A",
  descr: "You can see this",
  min: "54",
  max: "60",
  pri: "89",
  mass: "369",
  emoji: "💾",
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
  type: "observation",
  aName: "Action B",
  descr: "Lunar sample text",
  min: "1",
  max: "4",
  pri: "25",
  mass: "284",
  emoji: "🌕",
};

const t3: TestingTemplate = {
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

const t3Alt: TestingTemplate = {
  tName: "--TEST ACTION TEMPLATE THREE ALT--",
  type: "other",
  aName: "Action C",
  descr: "Can't be in duplicate!",
  min: "8",
  max: "9",
  pri: "20",
  mass: "301",
  emoji: "🌎",
};

const t3Dup: TestingTemplate = {
  tName: "--TEST ACTION TEMPLATE THREE-- (copy 1)",
  type: "other",
  aName: "Action 3",
  descr: "You shouldn't see this :) (pt 3)",
  min: "3",
  max: "6",
  pri: "30",
  mass: "300",
  emoji: "😎",
};

const td: TestingTemplate = {
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

async function createAndPopulateTemplate(page: Page, t: TestingTemplate) {
  await page.waitForTimeout(50);
  await page.getByLabel("addNewTemplateButton", { exact: true }).click();
  await page.getByLabel("Template Name", { exact: true }).last().pressSequentially(t.tName);
  await page.waitForTimeout(50);
  await page.getByLabel("Expand Button", { exact: true }).last().click();
  await page.waitForTimeout(100);
  await page.getByLabel("dropdown", { exact: true }).last().selectOption(t.type);
  await page.getByLabel("Action Title", { exact: true }).last().fill(t.aName);
  await page.getByLabel("Template Description", { exact: true }).last().fill(t.descr);
  await page.getByLabel("Minimum Time in minutes", { exact: true }).last().fill(t.min);
  await page.getByLabel("Maximum Time in minutes", { exact: true }).last().fill(t.max);
  await page.getByLabel("Priority", { exact: true }).last().fill(t.pri);
  await page.getByLabel("Expected Sample Mass", { exact: true }).last().fill(t.mass);
  await page.getByLabel("Emoji Menu Toggle", { exact: true }).last().click();
  await page.waitForTimeout(50);
  await page.getByPlaceholder("Search", { exact: true }).last().pressSequentially(t.emoji);
  await page.getByLabel(t.emoji, { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).last().click();
}

async function editTemplate(page: Page, newT: TestingTemplate, tInd: number) {
  await page.getByLabel("Template Name", { exact: true }).nth(tInd).fill("");
  await page.getByLabel("Template Name", { exact: true }).nth(tInd).pressSequentially(newT.tName);
  await page.waitForTimeout(50);
  await page.getByLabel("Expand Button", { exact: true }).nth(tInd).click();
  await page.waitForTimeout(100);
  await page.getByLabel("dropdown", { exact: true }).last().selectOption(newT.type);
  await page.getByLabel("Action Title", { exact: true }).last().fill(newT.aName);
  await page.getByLabel("Template Description", { exact: true }).last().fill(newT.descr);
  await page.getByLabel("Minimum Time in minutes", { exact: true }).last().fill(newT.min);
  await page.getByLabel("Maximum Time in minutes", { exact: true }).last().fill(newT.max);
  await page.getByLabel("Priority", { exact: true }).last().fill(newT.pri);
  await page.getByLabel("Expected Sample Mass", { exact: true }).last().fill(newT.mass);
  await page.getByLabel("Emoji Menu Toggle", { exact: true }).last().click();
  await page.waitForTimeout(50);
  await page.getByPlaceholder("Search", { exact: true }).last().pressSequentially(newT.emoji);
  await page.getByLabel(newT.emoji, { exact: true }).last().click();
  await page.getByLabel("Expand Button", { exact: true }).nth(tInd).click();
}

async function checkTemplateData(page: Page, t: TestingTemplate, tInd: number) {
  await expect(page.getByLabel("Template Name", { exact: true }).nth(tInd)).toContainText(t.tName);
  await page.getByLabel("Expand Button", { exact: true }).nth(tInd).click();
  await expect(page.getByLabel("Action Template Type", { exact: true }).nth(tInd)).toContainText(
    t.type
  );
  await expect(page.getByLabel("Action Title", { exact: true }).last()).toContainText(t.aName);
  await expect(page.getByLabel("Template Description", { exact: true }).last()).toContainText(
    t.descr
  );
  await expect(page.getByLabel("Minimum Time in minutes", { exact: true }).last()).toContainText(
    t.min
  );
  await expect(page.getByLabel("Maximum Time in minutes", { exact: true }).last()).toContainText(
    t.max
  );
  await expect(page.getByLabel("Priority", { exact: true }).last()).toContainText(t.pri);
  await expect(page.getByLabel("Expected Sample Mass", { exact: true }).last()).toContainText(
    t.mass
  );
  await expect(page.getByLabel("Emoji Display", { exact: true }).nth(tInd)).toContainText(t.emoji);
  await page.getByLabel("Expand Button", { exact: true }).nth(tInd).click();
}

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

  await createAndPopulateTemplate(page, t1);
  await page.waitForTimeout(100);
  await createAndPopulateTemplate(page, t2);
  await page.waitForTimeout(100);
  await createAndPopulateTemplate(page, td);
  await page.waitForTimeout(100);
  await createAndPopulateTemplate(page, t3);
  await page.waitForTimeout(100);

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

  await checkTemplateData(page, t1, t1Ind);
  await checkTemplateData(page, t2, t2Ind);
  await checkTemplateData(page, t3, t3Ind);

  // Edit t1 and t2, then save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await editTemplate(page, t1Alt, t1Ind);
  await editTemplate(page, t2Alt, t2Ind);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  t1Ind = -1;
  t2Ind = -1;
  t3Ind = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    const type = await page.getByLabel("Action Template Type").nth(i).textContent();
    if (name === t1Alt.tName && type === t1Alt.type) {
      t1Ind = i;
    }
    if (name === t2Alt.tName && type === t2Alt.type) {
      t2Ind = i;
    }
    if (name === t3.tName && type === t3.type) {
      t3Ind = i;
    }
  }

  await expect(t1Ind !== -1 && t2Ind !== -1 && t3Ind !== -1).toEqual(true);

  await checkTemplateData(page, t1Alt, t1Ind);
  await checkTemplateData(page, t2Alt, t2Ind);
  await checkTemplateData(page, t3, t3Ind);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Duplicate t3, then delete t2
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Template Menu", { exact: true }).nth(t3Ind).click();
  await page.getByLabel("Duplicate", { exact: true }).nth(t3Ind).click();

  await page.getByLabel("Template Menu", { exact: true }).nth(t2Ind).click();
  const dialogPromiseTwo = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t2Ind).click();
  await dialogPromiseTwo;

  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  t1Ind = -1;
  t3Ind = -1;
  let t3DupInd = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    const type = await page.getByLabel("Action Template Type").nth(i).textContent();
    if (name === t1Alt.tName && type === t1Alt.type) {
      t1Ind = i;
    }
    if (name === t3.tName && type === t3.type) {
      t3Ind = i;
    }
    if (name === t3Dup.tName && type === t3Dup.type) {
      t3DupInd = i;
    }
  }

  await expect(t1Ind !== -1 && t3Ind !== -1 && t3DupInd !== -1).toEqual(true);

  await checkTemplateData(page, t1Alt, t1Ind);
  await checkTemplateData(page, t3, t3Ind);
  await checkTemplateData(page, t3Dup, t3DupInd);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Edit original t3, verify the two are not linked (like ID being the same)
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await editTemplate(page, t3Alt, t3Ind);
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  t1Ind = -1;
  t3Ind = -1;
  t3DupInd = -1;

  for (let i = 0; i < startingNumTemplates + 3; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    const type = await page.getByLabel("Action Template Type").nth(i).textContent();
    if (name === t1Alt.tName && type === t1Alt.type) {
      t1Ind = i;
    }
    if (name === t3Alt.tName && type === t3Alt.type) {
      t3Ind = i;
    }
    if (name === t3Dup.tName && type === t3Dup.type) {
      t3DupInd = i;
    }
  }

  await expect(t1Ind !== -1 && t3Ind !== -1 && t3DupInd !== -1).toEqual(true);
  await checkTemplateData(page, t1Alt, t1Ind);
  await checkTemplateData(page, t3Alt, t3Ind);
  await checkTemplateData(page, t3Dup, t3DupInd);

  // Delete original t3 and cancel
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Template Menu", { exact: true }).nth(t3Ind).click();
  await page.getByLabel("Delete", { exact: true }).nth(t3Ind).click();
  await dialogPromise;
  await page.getByLabel("cancelButton", { exact: true }).click();

  await checkTemplateData(page, t3Alt, t3Ind);
  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 3
  );

  // Delete original t3 and save, checking for any linkage between duplicate and original
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Template Menu", { exact: true }).nth(t3Ind).click();
  const dialogPromiseThree = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t3Ind).click();
  await dialogPromiseThree;
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);

  t1Ind = -1;
  t3DupInd = -1;
  for (let i = 0; i < startingNumTemplates + 2; i++) {
    const name = await page.getByLabel("Template Name").nth(i).textContent();
    const type = await page.getByLabel("Action Template Type").nth(i).textContent();
    console.log(name);
    console.log(type);
    if (name === t1Alt.tName && type === t1Alt.type) {
      t1Ind = i;
    }
    if (name === t3Dup.tName && type === t3Dup.type) {
      t3DupInd = i;
    }
  }

  await expect(t1Ind !== -1 && t3DupInd !== -1).toEqual(true);

  await checkTemplateData(page, t3Dup, t3DupInd);

  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );

  // Test expand all and collapse all in viewing and edit mode
  await page.getByLabel("Expand All Button", { exact: true }).click();
  await expect(page.getByLabel("Template Description", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );
  await page.getByLabel("Collapse All Button", { exact: true }).click();
  await expect(page.getByLabel("Template Description", { exact: true })).toHaveCount(0);

  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Expand All Button", { exact: true }).click();
  await expect(page.getByLabel("Template Description", { exact: true })).toHaveCount(
    startingNumTemplates + 2
  );
  await page.getByLabel("Collapse All Button", { exact: true }).click();
  await expect(page.getByLabel("Template Description", { exact: true })).toHaveCount(0);

  await page.getByLabel("cancelButton", { exact: true }).click();

  // Tear down rest of action templates
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
  await page.getByLabel("Template Menu", { exact: true }).nth(t1Ind).click();
  const dialogPromiseFour = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t1Ind).click();
  await dialogPromiseFour;
  await page.getByLabel("Template Menu", { exact: true }).nth(t3DupInd).click();
  const dialogPromiseFive = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("Delete", { exact: true }).nth(t3DupInd).click();
  await dialogPromiseFive;
  await page.waitForTimeout(200);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByLabel("templateList-item", { exact: true })).toHaveCount(
    startingNumTemplates
  );
});
