/**
 * Root Vitest "projects" aggregator combining src/tests/vitest (node/jsdom)
 * and src/tests/vitest-browser (Chromium via Playwright) into one run, so
 * the VS Code Vitest extension's single `vitest.rootConfig` sees both.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { extends: "src/tests/vitest/vitest.config.mts", test: { name: "node" } },
      { extends: "src/tests/vitest-browser/vitest.config.mts", test: { name: "browser" } },
    ],
  },
});
