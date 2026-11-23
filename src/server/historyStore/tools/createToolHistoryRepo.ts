import pg from "pg";
import { HistoryPersistence } from "server/historyStore/historyPersistence";
import { ServerHistoryRepo } from "server/historyStore/ServerHistoryRepo";
import { ServerHistoryStore } from "server/historyStore/ServerHistoryStore";

/** History repo on its own pg pool, for standalone scripts (seeder, validator, integrity check). */
export const createToolHistoryRepo = (): { repo: ServerHistoryRepo; pool: pg.Pool } => {
  const pool = new pg.Pool({
    user: "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
  });
  const repo = new ServerHistoryRepo(new ServerHistoryStore(new HistoryPersistence(pool)));
  return { repo, pool };
};
