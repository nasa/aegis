#!/usr/bin/env node
// Loads a pg_dump-style SQL file into the database using the `pg` package.
// Used by CI in place of `psql -h ... < dump.sql` so jobs don't need
// postgresql-client installed (which requires root on Alpine/Ubuntu images).
//
// Handles pg_dump's default output format: regular SQL statements, plus
// `COPY ... FROM stdin` blocks. The `pg` simple query protocol can't process
// COPY data inline, so those blocks are routed through `pg-copy-streams`.

import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("usage: load-sql-dump.mjs <path-to-sql-file>");
  process.exit(2);
}

// Strip PostGIS content from dumps created before postgres:17 migration.
// AEGIS doesn't use PostGIS features, but historical dumps from the postgis/postgis
// image contain postGIS content
// IMPORTANT: Keep pattern synchronized with bash sed in CI scripts and upgrade-db.sh
const POSTGIS_EXTENSIONS = "(postgis|tiger|topology|fuzzystrmatch)";
const POSTGIS_SCHEMAS = "(tiger|tiger_data|topology)";
const POSTGIS_COPY_TABLE = "(public\\.spatial_ref_sys|tiger\\.[a-z_]+|topology\\.[a-z_]+)";
const sql = (await readFile(sqlPath, "utf8"))
  .replace(new RegExp(`^CREATE EXTENSION.*${POSTGIS_EXTENSIONS}.*;\\s*$`, "gim"), "")
  .replace(new RegExp(`^COMMENT ON EXTENSION ${POSTGIS_EXTENSIONS}.*;\\s*$`, "gim"), "")
  .replace(new RegExp(`^CREATE SCHEMA ${POSTGIS_SCHEMAS};\\s*$`, "gim"), "")
  .replace(new RegExp(`^ALTER SCHEMA ${POSTGIS_SCHEMAS} OWNER TO .*;\\s*$`, "gim"), "")
  .replace(new RegExp(`^COMMENT ON SCHEMA ${POSTGIS_SCHEMAS} .*;\\s*$`, "gim"), "")
  .replace(
    new RegExp(
      `^COPY ${POSTGIS_COPY_TABLE} .* FROM stdin;\\s*$[\\s\\S]*?^\\\\\\.\\s*$\\r?\\n?`,
      "gm"
    ),
    ""
  );

const config = {
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
};

console.log(
  `loading ${sqlPath} into ${config.user}@${config.host}:${config.port}/${config.database}`
);

// Connect with retry. GitLab Kubernetes executor doesn't wait for service
// containers to be ready, only for them to be running.
const connectWithRetry = async (cfg, deadline) => {
  for (;;) {
    const c = new Client(cfg);
    try {
      await c.connect();
      return c;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      console.log(`postgres not ready (${err.code ?? err.message}); retrying...`);
      await c.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

// Drop and recreate the target database so the dump loads into a clean state.
// Required because the postgis service image's init scripts pre-create the
// `postgis`/`tiger`/`topology` schemas, which then collide with the dump's
// own `CREATE SCHEMA` statements.
const adminDeadline = Date.now() + 90_000;
const admin = await connectWithRetry({ ...config, database: "postgres" }, adminDeadline);
try {
  await admin.query(`DROP DATABASE IF EXISTS "${config.database}"`);
  await admin.query(`CREATE DATABASE "${config.database}"`);
} finally {
  await admin.end();
}

const client = await connectWithRetry(config, Date.now() + 30_000);

try {
  // Walk the dump line by line, accumulating SQL into a buffer and routing
  // any `COPY ... FROM stdin;` blocks through the dedicated COPY protocol.
  const lines = sql.split("\n");
  let sqlBuffer = "";
  let inCopy = false;
  let copyData = "";
  let copyCmd = "";
  let copyCount = 0;

  const flushSql = async () => {
    if (sqlBuffer.trim()) await client.query(sqlBuffer);
    sqlBuffer = "";
  };

  const runCopy = async (cmd, data) => {
    const stream = client.query(copyFrom(cmd));
    await pipeline(Readable.from([data]), stream);
  };

  for (const line of lines) {
    if (inCopy) {
      if (line === "\\.") {
        await runCopy(copyCmd, copyData);
        copyCount++;
        inCopy = false;
        copyData = "";
        copyCmd = "";
      } else {
        copyData += line + "\n";
      }
    } else if (/^COPY .* FROM stdin;\s*$/.test(line)) {
      await flushSql();
      copyCmd = line.replace(/;\s*$/, "");
      inCopy = true;
    } else if (/^\\(?:un)?restrict\s+[A-Za-z0-9]+\s*$/.test(line)) {
      // psql client meta-commands (not SQL) that pg_dump >= 17.6 / 18.0 wraps around
      // every plain-text dump for CVE-2025-8714. psql handles them client-side; this
      // loader is a psql substitute, so it skips them the same way rather than sending
      // the leading backslash to the server (which would error). The pattern matches only
      // the exact `\restrict <key>` / `\unrestrict <key>` form, so it won't touch a
      // backslash line inside a dollar-quoted function body.
      continue;
    } else {
      sqlBuffer += line + "\n";
    }
  }
  await flushSql();

  console.log(`loaded dump (${copyCount} COPY blocks)`);
} finally {
  await client.end();
}
