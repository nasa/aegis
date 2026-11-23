import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { rmSync } from "fs";
import * as esbuild from "esbuild";
import packageJSON from "../../../package.json" with { type: "json" };

// Remove the previous build directory
rmSync("./.local/express/dist/loadTest", { recursive: true, force: true });

// Build load test separately; the bundled workers run in Node worker threads
const loadTestContext = await esbuild.context({
  entryPoints: {
    startLoadTest: "./src/tests/loadTest/startLoadTest.ts",
    loadTest: "./src/tests/loadTest/loadTest.ts",
  },
  bundle: true,
  sourcemap: true,
  format: "esm",
  platform: "node",
  target: "node26",
  banner: {
    js: "import { createRequire as _importRequire } from 'module'; const require = _importRequire(import.meta.url);",
  },
  outdir: "./.local/express/dist/loadTest",
  tsconfig: "./tsconfig.json",
  define: {
    __APP_VERSION__: JSON.stringify(packageJSON.version),
    __GIT_COMMIT__: JSON.stringify(process.env.GIT_COMMIT || "localDev"),
  },
});

await loadTestContext.rebuild();
await loadTestContext.dispose();
