/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import { mergeConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { aliases, config as viteConfig } from "../../../vite.config.mts";

// ESM equivalents of __filename / __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the workspace root (3 levels up from src/tests/vitest/)
const workspaceRoot = path.resolve(__dirname, "../../..");

// Use an explicit path so dotenv finds .env regardless of the process CWD
// (the VS Code Vitest extension may not launch from the workspace root).
dotenv.config({ path: path.resolve(workspaceRoot, ".env"), override: true, quiet: true });

export default defineConfig(
  mergeConfig(viteConfig, {
    // Explicitly set root to the workspace root so all relative paths in the
    // test config (globs, outputFile, etc.) resolve from there, not from this
    // file's directory.
    root: workspaceRoot,
    resolve: { alias: aliases },
    test: {
      globals: true,
      environment: "jsdom",
      include: ["src/tests/vitest/**/*.test.ts", "src/tests/vitest/**/*.test.tsx"],
      exclude: ["**/node_modules/**", "**/.local/**", "src/tests/playwright/**"],
      // Use absolute paths so these are found regardless of how root is resolved.
      setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
      reporters: ["default", "junit"],
      outputFile: {
        junit: "./junit.xml",
      },
      coverage: {
        provider: "v8",
        reporter: ["text", "text-summary", "lcov", "cobertura"],
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
        ],
      },
      globalSetup: [path.resolve(__dirname, "./vitest.globalSetup.ts")],
      testTimeout: 10000,
    },
  })
);
