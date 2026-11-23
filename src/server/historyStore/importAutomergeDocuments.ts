import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { AutomergeUrl } from "@automerge/automerge-repo/slim";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { releaseMissionDocument } from "server/automerge/releaseMissionDocument";
import { HistoryPersistence } from "./historyPersistence";

/**
 * One-time cutover from Automerge to the history store. For every `doc_listing_db` row whose
 * document has no history yet, read the latest Automerge document and write it as history
 * row 0 under the same document id (the listing's `automerge_url`). Idempotent: imported
 * documents are skipped, so it is safe to run on every `migration:up`.
 *
 * Run after the Automerge migrations, so every imported document has the current schema.
 * Automerge's own change history is not carried over; the history store starts at the
 * imported state. `automerge_native_db` is left untouched as a fallback.
 */
const pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
const history = new HistoryPersistence(pool);

const run = async () => {
  const { rows: listings } = await pool.query<{ missionId: number; automergeUrl: string }>(
    `select mission_id as "missionId", automerge_url as "automergeUrl" from doc_listing_db order by mission_id`
  );
  const imported = new Set(await history.listDocumentIds());
  const pending = listings.filter(({ automergeUrl }) => !imported.has(automergeUrl));
  if (!pending.length) {
    console.log("History store import: every listed mission already has history");
    return;
  }

  await initializeBase64Wasm(automergeWasmBase64);
  const repo = new Repo({ storage: new PostgresStorageAdapter("automerge_native_db", pool) });
  let count = 0;
  try {
    for (const { missionId, automergeUrl } of pending) {
      if (!isValidAutomergeUrl(automergeUrl)) {
        throw new Error(`Mission ${missionId} has neither history nor a valid Automerge URL`);
      }
      const started = Date.now();
      const handle = await repo.find<Mission>(automergeUrl as AutomergeUrl);
      await handle.whenReady();
      const mission = JSON.parse(JSON.stringify(handle.doc())) as Mission;
      await history.startDocumentHistory(automergeUrl, mission, "automerge-import");
      await releaseMissionDocument(repo, handle.documentId);
      count += 1;
      console.log(
        `Imported mission ${missionId} (${count}/${pending.length}) in ${Date.now() - started} ms`
      );
    }
  } finally {
    await repo.shutdown();
  }
  console.log(`History store import: imported ${count} mission(s)`);
};

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("History store import failed", error);
    await pool.end();
    process.exit(1);
  });
