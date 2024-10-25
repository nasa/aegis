import { test, expect } from "@playwright/test";

test("create edit cancel delete poi", async ({ page }) => {
  await page.goto("http://localhost:4000/mission/1");
  await page.waitForTimeout(4000);
  // go to poi section
  await page.getByLabel("poi Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Points of Interest"
  );

  // add poi
  const startingNumPois = await page.getByLabel("poiList-item", { exact: true }).count();
  await page.getByLabel("addPoi", { exact: true }).click();
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois + 1);

  // edit poi name and save
  await page.getByLabel("POI", { exact: true }).click();
  await page.getByLabel("POI", { exact: true }).fill("Playwright Test POI");
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI/,
  ]); // give time for the store to update
  await page.getByLabel("savePoi", { exact: true }).click();
  await expect(page.getByLabel("POI", { exact: true })).toContainText("Playwright Test POI");

  // edit poi name and cancel
  await page.getByLabel("editPoi", { exact: true }).click();
  await page.getByLabel("POI", { exact: true }).click();
  await page.getByLabel("POI", { exact: true }).fill("Playwright Test POI edited");
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI edited/,
  ]); // give time for the store to update
  await page.getByLabel("cancelPoi", { exact: true }).click();
  await expect(page.getByLabel("POI", { exact: true })).toContainText("Playwright Test POI");

  // delete poi
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editPoi", { exact: true }).click();
  await page.getByLabel("deletePoi", { exact: true }).click();
  await dialogPromise; // Wait for the dialog to be accepted
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois);
});
