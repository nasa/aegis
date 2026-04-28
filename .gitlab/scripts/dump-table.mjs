#!/usr/bin/env node
// Dumps a table to a deterministic text file for diffing across runs.
// Replaces `psql -c "SELECT * FROM <table>" -o file.txt` in CI so jobs
// don't need postgresql-client installed.

import { writeFile } from "node:fs/promises";
import { Client } from "pg";

const table = process.argv[2];
const outPath = process.argv[3];
if (!table || !outPath) {
  console.error("usage: dump-table.mjs <table> <out-file>");
  process.exit(2);
}

const config = {
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASS,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
};

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
      console.log(
        `postgres not ready (${err.code ?? err.message}); retrying...`,
      );
      await c.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

const client = await connectWithRetry(config, Date.now() + 30_000);
try {
  const { rows, fields } = await client.query(`SELECT * FROM ${table}`);
  const cols = fields.map((f) => f.name);
  const lines = [cols.join("\t")];
  for (const row of rows) {
    lines.push(cols.map((c) => JSON.stringify(row[c] ?? null)).join("\t"));
  }
  await writeFile(outPath, lines.join("\n") + "\n");
} finally {
  await client.end();
}
