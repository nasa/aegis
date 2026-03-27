/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Resolve the workspace root (3 levels up from src/tests/vitest/)
const workspaceRoot = path.resolve(__dirname, "../../..");

// Use an explicit path so dotenv finds .env regardless of the process CWD
// (the VS Code Vitest extension may not launch from the workspace root).
dotenv.config({ path: path.resolve(workspaceRoot, ".env"), override: true, quiet: true });

/**
 * Vitest configuration
 * We don't mergeConfig with vite.config.mts because the react-swc plugin
 * can't handle server-side code with TypeScript decorators (MikroORM models).
 * Instead, we replicate only the resolve aliases.
 */
export default defineConfig({
  // Explicitly set root to the workspace root so all relative paths in the
  // test config (globs, outputFile, etc.) resolve from there, not from this
  // file's directory.
  root: workspaceRoot,
  resolve: {
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
    },
  },
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
      ],
    },
    globalSetup: [path.resolve(__dirname, "./vitest.globalSetup.ts")],
    testTimeout: 10000,
  },
});
