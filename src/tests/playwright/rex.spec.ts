import { test, expect } from "@playwright/test";

test("create cancel edit delete rex", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  //go to rex section
  await page.waitForTimeout(2000);
  await page.getByLabel("rex Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Real-time Execution"
  );

  // Add a new REX event
  const rexCount = await page.getByLabel("rex-item", { exact: true }).count();

  await page.getByLabel("Add", { exact: true }).click();

  await expect(page.getByLabel("rex-item", { exact: true })).toHaveCount(rexCount + 1);

  const newRexQuery = page.getByLabel("selectedRex", { exact: true });
  await expect(newRexQuery.getByLabel("leftRexName", { exact: true })).toBeVisible();
  await expect(newRexQuery.getByLabel("Unsaved changes", { exact: true })).toBeVisible();

  await page.getByLabel("saveButton", { exact: true }).click();

  // Edit REX name and save
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("Rex Title", { exact: true }).fill("--TEST REX EVENT--");

  await page.waitForTimeout(500);
  await page.getByLabel("saveButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("rex-item", { exact: true })).toHaveCount(rexCount + 1);
  await expect(newRexQuery.getByLabel("leftRexName", { exact: true })).toContainText(
    "--TEST REX EVENT--"
  );

  // Change and cancel REX event
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.getByLabel("Rex Title", { exact: true }).fill("--TEST REX EVENT-- BROKEN");

  await page.waitForTimeout(500);
  await page.getByLabel("cancelButton", { exact: true }).click();
  await page.getByLabel("Edit", { exact: true }).waitFor();

  await expect(page.getByLabel("rex-item", { exact: true })).toHaveCount(rexCount + 1);
  await expect(newRexQuery.getByLabel("leftRexName", { exact: true })).toContainText(
    "--TEST REX EVENT--"
  );

  // Delete REX event
  await page.getByLabel("Edit", { exact: true }).click();
  await page.mouse.move(0, -100);
  await page.waitForTimeout(1000);

  await page.waitForTimeout(500);
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("deleteButton", { exact: true }).click();
  await dialogPromise;

  await expect(page.getByLabel("rex-item", { exact: true })).toHaveCount(rexCount);
});
