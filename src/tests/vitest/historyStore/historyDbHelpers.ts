import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import { HISTORY_TABLE, HistoryPersistence } from "server/historyStore/historyPersistence";

/** A pool on the local test database, built like `src/server/express/server.ts` does. */
export const createTestPool = (): pg.Pool =>
  new pg.Pool({
    user: "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
  });

/** Tracks the document ids a test file creates so it can delete exactly those. */
export const createTestDb = (): {
  pool: pg.Pool;
  persistence: HistoryPersistence;
  newDocumentId: () => string;
  rowsOf: (
    documentId: string
  ) => Promise<
    { history_index: number; action: ConfirmedHistoryAction; state_prior_to_action: unknown }[]
  >;
  cleanup: () => Promise<void>;
} => {
  if (process.env.DB_NAME !== "aegis_history") {
    throw new Error(`History store tests must run on aegis_history, not ${process.env.DB_NAME}`);
  }
  const pool = createTestPool();
  const persistence = new HistoryPersistence(pool);
  const ids: string[] = [];
  return {
    pool,
    persistence,
    newDocumentId: () => {
      const id = `vitest-history:${uuidv4()}`;
      ids.push(id);
      return id;
    },
    rowsOf: async (documentId: string) =>
      (
        await pool.query<{
          history_index: number;
          action: ConfirmedHistoryAction;
          state_prior_to_action: unknown;
        }>(
          `select history_index, action, state_prior_to_action from ${HISTORY_TABLE}
           where document_id = $1 order by history_index`,
          [documentId]
        )
      ).rows,
    cleanup: async () => {
      await pool.query(`delete from ${HISTORY_TABLE} where document_id = any($1)`, [ids]);
      await pool.end();
    },
  };
};
