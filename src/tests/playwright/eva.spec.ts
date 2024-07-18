import { test, expect } from "@playwright/test";

test("create edit cancel delete eva", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");

  // go to eva section
  await page.getByLabel("evas Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "EVA Compositions"
  );

  // add eva
  const startingNumEvas = await page.getByLabel("evaList-item", { exact: true }).count();
  await page.getByLabel("addEva", { exact: true }).click();
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 1);

  // edit eva name and save
  await page.getByLabel("Eva", { exact: true }).click();
  await page.getByLabel("Eva", { exact: true }).fill("Playwright Test Eva");
  await expect(page.getByLabel("evaList-item", { exact: true })).toContainText([
    /Playwright Test Eva/,
  ]); // give time for the store to update
  await page.getByLabel("saveEva", { exact: true }).click();
  await expect(page.getByLabel("Eva", { exact: true })).toContainText("Playwright Test Eva");

  // edit eva name and cancel
  await page.getByLabel("editEva", { exact: true }).click();
  await page.getByLabel("Eva", { exact: true }).click();
  await page.getByLabel("Eva", { exact: true }).fill("Playwright Test Eva edited");
  await expect(page.getByLabel("evaList-item", { exact: true })).toContainText([
    /Playwright Test Eva edited/,
  ]); // give time for the store to update
  await page.getByLabel("cancelEva", { exact: true }).click();
  await expect(page.getByLabel("Eva", { exact: true })).toContainText("Playwright Test Eva");

  // delete eva
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editEva", { exact: true }).click();
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromise; // Wait for the dialog to be accepted
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas);
});
