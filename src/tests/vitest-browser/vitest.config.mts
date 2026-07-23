/**
 * Vitest Browser Mode Configuration
 *
 * Runs tests in a real Chromium browser via Playwright, enabling:
 *  - Real Canvas API (for emoji/icon rendering tests)
 *  - Real DOM geometry (getBoundingClientRect, ResizeObserver, etc.)
 *  - OL Map instance creation (requires a real rendering context)
 */

/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import dotenv from "dotenv";

const workspaceRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.resolve(workspaceRoot, ".env"), override: true, quiet: true });

export default defineConfig({
  root: workspaceRoot,
  plugins: [react()],
  resolve: {
    // Prevent multiple React copies when third-party deps are pre-bundled —
    // without this, react-cookie / react-redux etc. get their own React copy
    // and hooks deref null inside their providers.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    alias: {
      components: path.resolve(workspaceRoot, "src/components"),
      "http-client": path.resolve(workspaceRoot, "src/http-client"),
      pages: path.resolve(workspaceRoot, "src/pages"),
      store: path.resolve(workspaceRoot, "src/store"),
      styles: path.resolve(workspaceRoot, "src/styles"),
      tests: path.resolve(workspaceRoot, "src/tests"),
      typings: path.resolve(workspaceRoot, "src/typings"),
      utils: path.resolve(workspaceRoot, "src/utils"),
      packages: path.resolve(workspaceRoot, "src/packages"),
      assets: path.resolve(workspaceRoot, "src/assets"),
      public: path.resolve(workspaceRoot, "src/public"),
      server: path.resolve(workspaceRoot, "src/server"),
      client: path.resolve(workspaceRoot, "src/client"),
      operations: path.resolve(workspaceRoot, "src/operations"),
    },
  },
  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    include: [
      "src/tests/vitest-browser/**/*.browser.test.ts",
      "src/tests/vitest-browser/**/*.browser.test.tsx",
    ],
    setupFiles: [path.resolve(__dirname, "./vitest-browser.setup.ts")],
    reporters: ["default"],
    // Collected only when --coverage is passed (CI), so local runs stay fast.
    // Kept in sync with the node config (src/tests/vitest/vitest.config.mts) so
    // the two blobs merge into a stable denominator; the merged report unions
    // both suites' coverage over the same "all of src/**" file universe.
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/tests/**",
        // The browser config uses @vitejs/plugin-react-swc, which cannot parse
        // the MikroORM decorators in server model files. Browser tests never
        // touch server code, so exclude it entirely — server coverage still
        // comes from the node suite's blob.
        "src/server/**",
      ],
    },
    testTimeout: 15000,
  },
});
