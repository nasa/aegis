import type { Page } from "@playwright/test";
import { test, expect } from "@playwright/test";

async function waitForSaveButton(page: Page, isActive: boolean) {
  const dataTooltipContent = isActive ? "Save Station" : "Save Station (nothing to save)";
  await page.getByLabel("saveStation").waitFor({ timeout: 1000 }); // give time for the store to update
  await expect(page.getByLabel("saveStation")).toHaveAttribute(
    "data-tooltip-html",
    dataTooltipContent,
    {
      timeout: 1000,
    }
  );
}

test("create edit cancel delete station", async ({ page }) => {
  await page.goto("http://localhost:4000/mission/22");
  await page.waitForLoadState("networkidle");

  // go to station section
  await page.getByLabel("station Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText("Stations");

  // add station
  const startingNumStations = await page.getByLabel("stationList-item", { exact: true }).count();
  await page.getByLabel("addStation", { exact: true }).click();
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations + 1
  );

  // edit station name and save
  await page.getByLabel("Station", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await waitForSaveButton(page, true);
  await page.getByLabel("Station", { exact: true }).click();
  await page.getByLabel("Station", { exact: true }).fill("Playwright Test Station");
  await expect(page.getByLabel("stationList-item", { exact: true })).toContainText([
    /Playwright Test Station/,
  ]);
  await waitForSaveButton(page, true);
  await page.getByLabel("saveStation", { exact: true }).click();
  await page.getByLabel("editStation", { exact: true }).waitFor({ timeout: 5000 });
  await expect(page.getByLabel("Station", { exact: true })).toContainText(
    "Playwright Test Station"
  );

  // edit station name and cancel
  await page.getByLabel("editStation", { exact: true }).click();
  await waitForSaveButton(page, false);
  await page.getByLabel("Station", { exact: true }).click();
  await page.getByLabel("Station", { exact: true }).fill("Playwright Test Station edited");
  await expect(page.getByLabel("stationList-item", { exact: true })).toContainText([
    /Playwright Test Station edited/,
  ]);
  await waitForSaveButton(page, true);
  await page.getByLabel("cancelStation", { exact: true }).click();
  await page.getByLabel("editStation", { exact: true }).waitFor({ timeout: 5000 });
  await expect(page.getByLabel("Station", { exact: true })).toContainText(
    "Playwright Test Station"
  );

  // delete station
  const dialogPromise = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByLabel("editStation", { exact: true }).click();
  await page.getByLabel("deleteStation", { exact: true }).click();
  await dialogPromise; // Wait for the dialog to be accepted
  await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(
    startingNumStations
  );
});
