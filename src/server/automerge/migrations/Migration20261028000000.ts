import { toJS } from "@automerge/automerge/slim";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import { missionValidator } from "utils/validateSchemaServer";

export const Migration20261028000000: AutomergeMigration = {
  version: 20261028000000,
  name: "clear-document-history",
  migrate: async (docHandle, { docListing, orm }) => {
    const repo = globalValues.automergeRepo;
    if (!repo) throw new Error("Automerge repository is not initialized");

    // Copy only the current content. Cloning or exporting would retain the old history.
    // A new URL keeps cached peers from merging the discarded history back into this document.
    const mission = toJS(docHandle.doc());
    if (!missionValidator(mission)) {
      throw new Error(
        `Cannot replace invalid mission ${docListing.missionId}: ${missionValidator.errors
          ?.map(({ instancePath, message }) => `${instancePath}: ${message}`)
          .join("; ")}`
      );
    }

    const oldUrl = docListing.automergeUrl;
    const replacement = repo.create<Mission>(mission);
    // Persist the new baseline before changing the listing. Flush the old handle too so its
    // pending throttled saves have no remaining changes to write after the old ID is removed.
    await repo.flush([docHandle.documentId, replacement.documentId]);
    // Shutdown must not flush the old document back into storage after its rows are deleted.
    await repo.removeFromCache(docHandle.documentId);

    const pool = await orm.em.fork().getConnection().getNativeClient();
    const client = await pool.connect();
    try {
      await client.query("begin");
      try {
        const result = await client.query(
          `update "doc_listing_db"
           set "automerge_url" = $1, "version" = "version" + 1
           where "mission_id" = $2 and "automerge_url" = $3`,
          [replacement.url, docListing.missionId, oldUrl]
        );
        if (result.rowCount !== 1) {
          throw new Error(`Document listing changed for mission ${docListing.missionId}`);
        }
        // Delete every chunk under the old ID, including snapshots, incrementals, and sync
        // state, in the same transaction as the listing change, before migrating the next doc.
        await client.query('delete from "automerge_native_db" where "key"[1] = $1', [
          Buffer.from(docHandle.documentId, "utf8"),
        ]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    } finally {
      client.release();
    }

    // If a later document fails, the next run loads this committed URL and can rebuild it
    // again. The migration ledger is recorded only after every document succeeds.
    docListing.automergeUrl = replacement.url;
    serverLogger.info({
      logId: "automerge-migration",
      logValue: `Mission ${docListing.missionId}: replaced ${oldUrl} with ${replacement.url} and deleted the old document's storage.`,
    });
  },
};
