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
import { mergeConfig } from "vite";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import dotenv from "dotenv";
import { aliases, config as viteConfig } from "../../../vite.config.mts";

const workspaceRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.resolve(workspaceRoot, ".env"), override: true, quiet: true });

export default defineConfig(
  mergeConfig(viteConfig, {
    root: workspaceRoot,
    resolve: {
      alias: aliases,
      // Prevent multiple React copies when third-party deps are pre-bundled —
      // without this, react-cookie / react-redux etc. get their own React copy
      // and hooks deref null inside their providers.
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    optimizeDeps: {
      // Browser tests do not have an HTML entry point for Vite's cold-start scan.
      // Scan every test entry up front so CI does not discover dependencies during
      // execution, rebuild the optimized-dependency bundle, and reload the tests.
      entries: [
        "src/tests/vitest-browser/**/*.browser.test.ts",
        "src/tests/vitest-browser/**/*.browser.test.tsx",
      ],
      // Paper.js is CommonJS and is not reliably found by Vitest's initial browser
      // dependency scan. Pre-bundle it so Vite does not reload tests mid-run.
      include: ["paper"],
      needsInterop: ["paper"],
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
          "src/server/database/migrations/**",
          // Rollup's native WASM parser (used by coverage-v8 remapCoverage) cannot
          // parse TypeScript syntax such as `import type { }`. These server entry-point
          // files use TypeScript-only syntax and are not unit-testable anyway.
          "src/server/express/server.ts",
          "src/server/automerge/migration.ts",
          "src/server/automerge/integrityCheck.ts",
          "src/server/automerge/automerge-repo-storage-postgres.ts",
          "src/server/automerge/seeder/seedApollo14.ts",
        ],
      },
      testTimeout: 15000,
    },
  })
);
