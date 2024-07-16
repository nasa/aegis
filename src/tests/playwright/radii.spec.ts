import { test, expect } from "@playwright/test";

test("create edit cancel delete radii", async ({ page }) => {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");

  //go to mission section
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );

  //go to radii list
  await page.getByLabel("circle_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Vector Definitions"
  );
});
