import { rmSync } from "fs";
import * as esbuild from "esbuild";

// All paths are relative to the process's current working directory.
//  When executed via npm script, the current working directory is the root of the project.

// Remove the previous build directory
rmSync("./.local/seeder/dist", { recursive: true, force: true });

// esbuild options for the standalone Apollo 14 demo seed runner. Kept separate from the
// automerge migration/integrity build so neither build slows the other down.
const buildOptions = {
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
  entryPoints: ["src/server/automerge/seeder/seedApollo14.ts"],
  outfile: "./.local/seeder/dist/seedApollo14.js",
};

const seedCtx = await esbuild.context(buildOptions);
await seedCtx.rebuild();
await seedCtx.dispose();
