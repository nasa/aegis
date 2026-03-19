/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });

const root = path.resolve(__dirname, "../../..");

/**
 * Vitest configuration
 * We don't mergeConfig with vite.config.mts because the react-swc plugin
 * can't handle server-side code with TypeScript decorators (MikroORM models).
 * Instead, we replicate only the resolve aliases.
 */
export default defineConfig({
  resolve: {
    alias: {
      components: path.join(root, "src/components"),
      "http-client": path.join(root, "src/http-client"),
      pages: path.join(root, "src/pages"),
      store: path.join(root, "src/store"),
      styles: path.join(root, "src/styles"),
      tests: path.join(root, "src/tests"),
      typings: path.join(root, "src/typings"),
      utils: path.join(root, "src/utils"),
      packages: path.join(root, "src/packages"),
      assets: path.join(root, "src/assets"),
      public: path.join(root, "src/public"),
      server: path.join(root, "src/server"),
      client: path.join(root, "src/client"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/tests/vitest/**/*.test.ts", "src/tests/vitest/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.local/**", "src/tests/playwright/**"],
    setupFiles: [path.resolve(__dirname, "./vitest.setup.ts")],
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "cobertura"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.ts", "src/**/*.test.tsx", "src/tests/**"],
    },
    globalSetup: [path.resolve(__dirname, "./vitest.globalSetup.ts")],
    testTimeout: 10000,
  },
});
