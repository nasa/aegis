import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { rmSync } from "fs";
import * as esbuild from "esbuild";
import packageJSON from "./package.json" with { type: "json" };

// Remove the previous build directory
rmSync("./.local/express/dist/api", { recursive: true, force: true });

// Create a plugin to handle rebuild events
const watchPlugin = {
  name: "watch-plugin",
  setup(build) {
    build.onEnd((result) => {
      const timestamp = new Date().toLocaleTimeString();
      if (result.errors.length > 0) {
        console.error(`Build failed with ${result.errors.length} errors at ${timestamp}`);
      } else {
        console.log(`Build succeeded at ${timestamp}`);
      }
    });
  },
};

// Run esbuild with the specified options for the API server
const context = await esbuild.context({
  entryPoints: {
    api: "src/server/express/server.ts",
    // The API starts this separately built module in Node worker threads. Keeping it beside
    // api.js lets elevation profiling run outside the API's main JavaScript event loop.
    elevationWorker: "src/server/elevation/elevationWorker.ts",
  },
  bundle: true,
  sourcemap: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: {
    js: "import { createRequire as _importRequire } from 'module'; const require = _importRequire(import.meta.url);",
  },
  // esbuild will not bundle the following packages due to an esm/cjs conflict. This sets them as external to the bundler.
  external: [
    "@mikro-orm/mongodb",
    "@mikro-orm/mysql",
    "@mikro-orm/mariadb",
    "@mikro-orm/sqlite",
    "@mikro-orm/better-sqlite",
    "@mikro-orm/entity-generator",
    "sqlite3",
    "mysql",
    "mysql2",
    "better-sqlite3",
    "oracledb",
    "pg-query-stream",
    "mariadb",
    "libsql",
    "tedious",
  ],
  outdir: "./.local/express/dist/api",
  tsconfig: "./tsconfig.json",
  plugins: [watchPlugin],
  // build time variables
  define: {
    __APP_VERSION__: JSON.stringify(packageJSON.version),
    // In the pipeline, GIT_COMMIT will be populated when the ci job passes it in MAP_ENV_VARS_TO_BUILD_ARGS
    //   to give it to kaniko docker to use during build. However when running this locally
    //   with NO docker container, we need to set a default value of "localDev"
    __GIT_COMMIT__: JSON.stringify(process.env.GIT_COMMIT || "localDev"),
  },
});

const isWatchMode = process.argv.includes("--watch");

if (isWatchMode) {
  console.log("watching...");
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
