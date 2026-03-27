import { test, expect } from "./testSetup";

test("CRUD eva", async ({ page }) => {
  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // go to eva section
  await page.getByLabel("evas Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("EVAs");

  // add eva
  const startingNumEvas = await page.getByLabel("evaList-item", { exact: true }).count();
  await page.getByLabel("addEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 1);

  // edit eva name and save
  await page.getByLabel("EVA Title", { exact: true }).click();
  await page.getByLabel("EVA Title", { exact: true }).fill("Playwright Test Eva");
  await expect(page.getByLabel("evaList-item", { exact: true })).toContainText([
    /Playwright Test Eva/,
  ]);
  await page.getByLabel("saveEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("EVA Title", { exact: true })).toContainText("Playwright Test Eva");

  // edit eva name and cancel
  await page.getByLabel("editEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.getByLabel("EVA Title", { exact: true }).click();
  await page.getByLabel("EVA Title", { exact: true }).fill("Playwright Test Eva edited");
  await expect(page.getByLabel("evaList-item", { exact: true })).toContainText([
    /Playwright Test Eva edited/,
  ]);
  await page.getByLabel("cancelEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await expect(page.getByLabel("EVA Title", { exact: true })).toContainText("Playwright Test Eva");

  // delete eva
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editEva", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips that may intercept the click
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromise; // Wait for the dialog to be accepted
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas);
});
