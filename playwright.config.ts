import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "./src/tests/playwright",

  // Set the timeout for each test.
  timeout: 30000,

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["html"]],

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: "http://aegis-local.fit.nasa.gov:4000/",

    // Collect trace when retrying the failed test.
    trace: "on-first-retry",
  },
  // Configure projects for major browsers.
  projects: [
    { name: "auth", testMatch: /.*\.auth\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./.local/playwright/auth.json",
      },
      dependencies: ["auth"], // make sure to run the auth project first.
    },
  ],
  // Run your local dev server before starting the tests.
  webServer: {
    command: "npm run dev",
    url: "http://aegis-local.fit.nasa.gov:4000/",
    reuseExistingServer: !process.env.CI,
  },

  globalSetup: require.resolve("./src/tests/playwright/playwright.globalSetup.ts"),
  globalTeardown: require.resolve("./src/tests/playwright/playwright.globalTeardown.ts"),
});
