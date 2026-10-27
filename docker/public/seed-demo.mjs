import { execFileSync } from "node:child_process";
import pg from "pg";

if (process.env.PUBLIC_DEMO_SEED !== "false") {
  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: "postgres",
    password: process.env.DB_PASS,
  });
  let hasMissions;
  try {
    await client.connect();
    const result = await client.query(
      "select exists(select 1 from doc_listing_db) as has_missions"
    );
    hasMissions = result.rows[0].has_missions;
  } finally {
    await client.end();
  }
  if (!hasMissions) {
    console.log("Creating the Apollo 14 demo mission for this empty database.");
    execFileSync(process.execPath, [".local/seeder/dist/seedApollo14.js"], {
      stdio: "inherit",
    });
  }
}
