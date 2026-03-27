import { test, expect } from "./testSetup";

test("CRUD poi", async ({ page }) => {
  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("loading-overlay").waitFor({ state: "hidden", timeout: 30000 });

  // go to poi section
  await page.getByLabel("poi Section", { exact: true }).click();
  await page.getByLabel("leftPanelTitle", { exact: true }).waitFor({ timeout: 2000 });
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Points of Interest"
  );

  // add poi
  const startingNumPois = await page.getByLabel("poiList-item", { exact: true }).count();
  await page.getByLabel("addPoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.waitForLoadState("networkidle");
  await page.getByText("POI Information", { exact: true }).waitFor({ timeout: 2000 });
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois + 1);

  // edit poi name and save
  await page.getByLabel("POI", { exact: true }).click();
  await page.getByLabel("POI", { exact: true }).fill("Playwright Test POI");
  await expect(page.getByLabel("POI", { exact: true })).toHaveAttribute(
    "value",
    "Playwright Test POI",
    {
      timeout: 1000,
    }
  );
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI/,
  ]); // give time for the store to update
  await page.getByLabel("savePoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.waitForLoadState("networkidle");
  await page.getByLabel("savePoi", { exact: true }).waitFor({ state: "detached", timeout: 5000 });
  await expect(page.getByLabel("POI", { exact: true })).toContainText("Playwright Test POI", {
    timeout: 1000,
  });
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI/,
  ]);
  await expect(page.getByLabel("POI", { exact: true })).toContainText("Playwright Test POI");

  // edit poi name and cancel
  await page.getByLabel("editPoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.getByLabel("POI", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByLabel("POI", { exact: true }).click();
  await page.getByLabel("POI", { exact: true }).fill("Playwright Test POI edited");
  await expect(page.getByLabel("POI", { exact: true })).toHaveAttribute(
    "value",
    "Playwright Test POI edited",
    {
      timeout: 1000,
    }
  );
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI edited/,
  ]); // give time for the store to update
  await page.getByLabel("cancelPoi", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByLabel("cancelPoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips
  await page.getByLabel("cancelPoi", { exact: true }).waitFor({ state: "detached", timeout: 2000 });
  await expect(page.getByLabel("POI", { exact: true })).toContainText("Playwright Test POI");
  await expect(page.getByLabel("poiList-item", { exact: true })).toContainText([
    /Playwright Test POI/,
  ]);

  // delete poi
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editPoi", { exact: true }).click();
  await page.mouse.move(0, 0); // Dismiss any lingering tooltips that may intercept the click
  await page.getByLabel("deletePoi", { exact: true }).click();
  await dialogPromise; // Wait for the dialog to be accepted
  await expect(page.getByLabel("poiList-item", { exact: true })).toHaveCount(startingNumPois);
});
