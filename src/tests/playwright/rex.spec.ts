import { test, expect } from "@playwright/test";

test("CRUD rex", async ({ page }) => {
  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");

  // Go to eva section
  await page.getByLabel("evas Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("EVAs");

  // Add eva
  const startingNumEvas = await page.getByLabel("evaList-item", { exact: true }).count();
  await page.getByLabel("addEva", { exact: true }).click();
  await expect(page.getByLabel("evaList-item", { exact: true })).toHaveCount(startingNumEvas + 1);

  // Edit eva name and save
  await page.getByLabel("EVA Title", { exact: true }).click();
  await page.getByLabel("EVA Title", { exact: true }).fill("Playwright Test Eva For Rex");
  await expect(
    page.getByLabel("evaList-item").filter({ hasText: "Playwright Test Eva For Rex" })
  ).toHaveCount(1);
  await page.getByLabel("saveEva", { exact: true }).click();
  await expect(page.getByLabel("EVA Title", { exact: true })).toContainText(
    "Playwright Test Eva For Rex"
  );

  // Add a rex
  await page // get the add rex button for the eva we just created
    .getByLabel("evaList-item")
    .filter({ hasText: "Playwright Test Eva For Rex" }) // this filter checks for content in all descendants
    .getByLabel("Add REX", { exact: true })
    .click();
  await page.getByLabel("REX Title", { exact: true }).waitFor({ timeout: 5000 });
  await expect(page.getByLabel("REX Title", { exact: true })).toContainText("REX");

  // Edit the rex name and save
  await page.getByLabel("editEva", { exact: true }).click();
  await page.getByLabel("REX Title", { exact: true }).click();
  await page.getByLabel("REX Title", { exact: true }).fill("Playwright Test REX");
  await page.getByLabel("saveEva", { exact: true }).click();
  await expect(
    page.getByLabel("evaList-item").filter({ hasText: "Playwright Test REX" })
  ).toHaveCount(1);

  // delete rex
  const dialogPromiseDeleteRex = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editEva", { exact: true }).click();
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromiseDeleteRex; // Wait for the dialog to be accepted
  await expect(
    page.getByLabel("evaList-item").filter({ hasText: "Playwright Test REX" })
  ).toHaveCount(0);
  await page.waitForSelector('text="Deleting EVA Execution..."', {
    state: "hidden",
    timeout: 5000,
  }); // wait for the deleting overlay to disappear

  // delete eva
  const dialogPromiseDeleteEva = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("evaList-item").filter({ hasText: "Playwright Test Eva For Rex" }).click();
  await page.getByLabel("editEva", { exact: true }).click();
  await page.getByLabel("deleteEva", { exact: true }).click();
  await dialogPromiseDeleteEva; // Wait for the dialog to be accepted
  await expect(
    page.getByLabel("evaList-item").filter({ hasText: "Playwright Test Eva For Rex" })
  ).toHaveCount(0);
});
