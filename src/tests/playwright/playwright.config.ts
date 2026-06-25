import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageStatePath = path.resolve(__dirname, "../../../.local/playwright/auth.json");

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "./",
  testIgnore: "**/automergeCRDT.spec.ts", // do not run this test. It is for local dev only

  // Set the timeout for each test.
  timeout: 120000,

  // Run all tests in parallel.
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI.
  workers: 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["html"]],

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: "http://localhost:4000/",

    headless: true, // Ensure headless mode is enabled
    viewport: { width: 1960, height: 1080 }, // Set screen resolution

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
        storageState: storageStatePath,
      },
      dependencies: ["auth"], // make sure to run the auth project first.
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: storageStatePath,
      },
      dependencies: ["auth"], // make sure to run the auth project first.
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: storageStatePath,
      },
      dependencies: ["auth"], // make sure to run the auth project first.
    },
  ],
  // Run dev server before starting the tests.
  // In CI, run a modified dev command that has already built the API server
  webServer: {
    command: process.env.CI ? "npm run dev:ci" : "npm run dev",
    url: "http://localhost:4000",
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    cwd: path.resolve(__dirname, "../../.."),
    stdout: "pipe", // forward stdout so we have better debugging
    stderr: "pipe",
  },

  globalSetup: path.resolve(__dirname, "./playwright.globalSetup.ts"),
  globalTeardown: path.resolve(__dirname, "./playwright.globalTeardown.ts"),
});
