import { Page, expect } from "@playwright/test";

export async function landerRadiiTest(page: Page): Promise<string> {
  await page.goto("http://aegis-local.fit.nasa.gov:4000/mission/1");
  //go to mission preferences
  await page.waitForTimeout(2000);
  await page.getByLabel("mission Section", { exact: true }).click();
  await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
    "Mission Configuration"
  );
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "Mission Preferences"
  );
}
