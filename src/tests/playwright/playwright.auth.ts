import { test as setup, expect } from "@playwright/test";

// file to store the auth cookie in to be loaded in browser context
const authFile = "./.local/playwright/auth.json";

setup("authenticate", async ({ page }) => {
  await page.goto("http://localhost:4000");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username").click();
  await page.getByLabel("Username").fill("Playwright admin");
  await page.getByLabel("Username").press("Tab");
  await page.getByLabel("Password").fill("playwrightpassword");
  await page.getByRole("button", { name: "Login", exact: true }).click();

  // wait to make sure user is actually logged in
  await expect(page.locator("#root")).toContainText("Select a Mission");

  // save login state/cookie to the auth file so it can be used in other tests
  try {
    await page.context().storageState({ path: authFile });
  } catch (error) {
    console.error("Failed to save storage state:", error);
  }
});
