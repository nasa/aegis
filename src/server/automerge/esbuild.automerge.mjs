import { rmSync } from "fs";
import * as esbuild from "esbuild";

// All paths are relative to the process's current working directory.
//  When executed via npm script, the current working directory is the root of the project.

// Remove the previous build directory
rmSync("./.local/automerge/dist", { recursive: true, force: true });

// Build the migration script via ESBuild
const context = await esbuild.context({
  entryPoints: ["src/server/automerge/migration.ts"],
  bundle: true,
  sourcemap: true,
  format: "cjs",
  platform: "node",
  target: "node20",
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
  outfile: "./.local/automerge/dist/migration.js",
  tsconfig: "./tsconfig.json",
});

await context.rebuild();
await context.dispose();
