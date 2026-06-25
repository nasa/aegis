import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { rmSync } from "fs";
import * as esbuild from "esbuild";
import packageJSON from "../../../package.json" with { type: "json" };

// Remove the previous build directory
rmSync("./.local/express/dist/loadTest", { recursive: true, force: true });

// Build load test separately with automerge as external
// This is necessary because worker threads need to load WASM from node_modules
//    instead of using the bundled version that the main application uses. I think
//    the worker threads have a different working directory/module resolution
const loadTestContext = await esbuild.context({
  entryPoints: {
    startLoadTest: "./src/tests/loadTest/startLoadTest.ts",
    loadTest: "./src/tests/loadTest/loadTest.ts",
  },
  bundle: true,
  sourcemap: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: {
    js: "import { createRequire as _importRequire } from 'module'; const require = _importRequire(import.meta.url);",
  },
  external: [
    // Keep automerge packages external so they can load WASM files from node_modules
    "@automerge/automerge",
    "@automerge/automerge-repo",
    "@automerge/automerge-repo-network-websocket",
  ],
  outdir: "./.local/express/dist/loadTest",
  tsconfig: "./tsconfig.json",
  define: {
    __APP_VERSION__: JSON.stringify(packageJSON.version),
    __GIT_COMMIT__: JSON.stringify(process.env.GIT_COMMIT || "localDev"),
  },
});

await loadTestContext.rebuild();
await loadTestContext.dispose();
