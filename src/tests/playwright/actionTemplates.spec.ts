import { test, expect } from "@playwright/test";

test("create edit cancel delete actionTemplates", async ({ page }) => {
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

  //go to action templates
  await page.getByLabel("actionTemplate_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Action Templates"
  );

  //add a new radius, check initial values, and cancel (not saved)
  const startingNumTemplate = await page.getByLabel("templateList-item", { exact: true }).count();
  await page.getByLabel("Edit", { exact: true }).click();
  await page.getByLabel("saveButton");
});
