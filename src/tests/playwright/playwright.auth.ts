import { test as setup, expect } from "@playwright/test";

// file to store the auth cookie in to be loaded in browser context
const authFile = process.env.PLAYWRIGHT_AUTH_FILE;

setup("authenticate", async ({ page }) => {
  await page.goto("http://localhost:4000");
  await page.getByLabel("Username").click();
  await page.getByLabel("Username").fill(process.env.PLAYWRIGHT_USERNAME);
  await page.getByLabel("Username").press("Tab");
  await page.getByLabel("Password").fill("playwrightpassword");
  const [catalog] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/api/v1/missionHomepageItems") && response.ok(),
      { timeout: 60000 }
    ),
    page.getByRole("button", { name: "Login", exact: true }).click(),
  ]);

  // wait to make sure user is actually logged in
  await expect(page.locator("#root")).toContainText("Select a Mission");
  expect((await catalog.json()).status).toBe("success");

  // save login state/cookie to the auth file so it can be used in other tests
  await page.context().storageState({ path: authFile });
});
