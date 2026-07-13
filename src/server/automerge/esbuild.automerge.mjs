import { rmSync } from "fs";
import * as esbuild from "esbuild";

// All paths are relative to the process's current working directory.
//  When executed via npm script, the current working directory is the root of the project.

// Remove the previous build directory
rmSync("./.local/automerge/dist", { recursive: true, force: true });

// Shared esbuild options for all automerge entry points
const sharedOptions = {
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
  tsconfig: "./tsconfig.json",
};

// Build the migration script
const migrationCtx = await esbuild.context({
  ...sharedOptions,
  entryPoints: ["src/server/automerge/migration.ts"],
  outfile: "./.local/automerge/dist/migration.js",
});

// Build the standalone integrity-check runner
const integrityCtx = await esbuild.context({
  ...sharedOptions,
  entryPoints: ["src/server/automerge/integrityCheck.ts"],
  outfile: "./.local/automerge/dist/integrityCheck.js",
});

await migrationCtx.rebuild();
await migrationCtx.dispose();

await integrityCtx.rebuild();
await integrityCtx.dispose();
