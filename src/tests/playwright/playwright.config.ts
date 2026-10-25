import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageStatePath = (process.env.PLAYWRIGHT_AUTH_FILE ??= path.resolve(
  __dirname,
  `../../../.local/playwright/auth-${randomUUID()}.json`
));
const reportDirectory = path.resolve(
  __dirname,
  "../../..",
  process.env.PLAYWRIGHT_REPORT_DIR ?? "playwright-report"
);

const boxProviderUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_BOX_PORT ?? 4179}`;
process.env.AEGIS_TEST_BOX_PROVIDER_URL = boxProviderUrl;

const CROSS_BROWSER_TESTS =
  /behavior[\\/](smoke|accessibilityCoverage|actions|rasterDisplay|layerStylesAssets|mapEditing|collaborationPresence)\.spec\.ts/;

// Chromium 153 on Windows can fail loopback requests with ERR_NO_BUFFER_SPACE:
// https://issues.chromium.org/issues/572515601. Keep Playwright 1.63's defaults
// when adding the workaround because Chromium uses the last --disable-features.
const windowsChromiumArgs =
  process.platform === "win32"
    ? [
        `--disable-features=${[
          "AvoidUnnecessaryBeforeUnloadCheckSync",
          "DestroyProfileOnBrowserClose",
          "DialMediaRouteProvider",
          "GlobalMediaControls",
          "HttpsUpgrades",
          "LensOverlay",
          "MediaRouter",
          "PaintHolding",
          "ThirdPartyStoragePartitioning",
          "BlockOriginHeaderModificationOnRedirect",
          "Translate",
          "AutoDeElevate",
          "OptimizationHints",
          "msForceBrowserSignIn",
          "msEdgeUpdateLaunchServicesPreferredVersion",
          "TcpPortRandomizationWin",
        ].join(",")}`,
      ]
    : [];

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "./",
  testIgnore: "**/automergeCRDT.spec.ts", // do not run this test. It is for local dev only

  // Set the timeout for each test.
  timeout: 300000,

  // Tests within a single file may run in parallel; whether they actually do
  // depends on each file's `test.describe.configure({ mode })`.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,

  // Retry on CI only.
  retries: process.env.CI ? 2 : 0,

  // Bound simultaneous full-stack clients on developer machines and CI shards.
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI
      ? 4
      : 3,

  expect: { timeout: 60000 },

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: reportDirectory }],
    ["junit", { outputFile: path.join(reportDirectory, "junit.xml") }],
  ],

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: "http://localhost:4000/",

    headless: true, // Ensure headless mode is enabled
    viewport: { width: 1960, height: 1080 }, // Set screen resolution

    // Preserve local failure diagnostics even when retries are disabled.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 60000,
    navigationTimeout: 120000,
  },

  // Configure projects for major browsers.
  // Chromium runs everything; Firefox/WebKit run smoke plus declared parity workflows.
  projects: [
    { name: "auth", testMatch: /.*\.auth\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: storageStatePath,
        launchOptions: { args: windowsChromiumArgs },
      },
      dependencies: ["auth"],
    },
    {
      name: "firefox",
      testMatch: CROSS_BROWSER_TESTS,
      use: {
        ...devices["Desktop Firefox"],
        storageState: storageStatePath,
      },
      dependencies: ["auth"],
    },
    {
      name: "webkit",
      testMatch: CROSS_BROWSER_TESTS,
      use: {
        ...devices["Desktop Safari"],
        storageState: storageStatePath,
      },
      dependencies: ["auth"],
    },
  ],
  // Run dev server before starting the tests.
  // In CI, run a modified dev command that has already built the API server
  webServer: [
    {
      command: "node src/tests/playwright/fixtures/boxProvider.mjs",
      url: `${boxProviderUrl}/health`,
      reuseExistingServer: !process.env.CI,
      cwd: path.resolve(__dirname, "../../.."),
    },
    {
      env: {
        NODE_ENV: "test",
        AEGIS_TEST_BOX_PROVIDER_URL: boxProviderUrl,
        BOX_CLIENT_ID: "playwright-fixture-client",
        BOX_CLIENT_SECRET: "playwright-fixture-credential",
        BOX_ENTERPRISE_ID: "playwright-fixture-enterprise",
        BOX_INITIAL_FOLDER_ID: "0",
      },
      command: process.env.CI ? "npm run dev:ci" : "npm run dev",
      url: "http://localhost:4000",
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
      cwd: path.resolve(__dirname, "../../.."),
      stdout: "pipe", // forward stdout so we have better debugging
      stderr: "pipe",
    },
  ],

  globalSetup: path.resolve(__dirname, "./playwright.globalSetup.ts"),
  globalTeardown: path.resolve(__dirname, "./playwright.globalTeardown.ts"),
});
