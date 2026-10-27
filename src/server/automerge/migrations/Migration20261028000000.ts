import { toJS } from "@automerge/automerge/slim";
import type { AutomergeMigration } from "server/automerge/migrations/types";
import { Doc_Listing_db } from "server/database/models/doc_listing.model";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import { missionValidator } from "utils/validateSchemaServer";

export const Migration20261028000000: AutomergeMigration = {
  version: 20261028000000,
  name: "clear-document-history",
  migrate: (docHandle, { docListing, orm }) => {
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
    // Persist the replacement before switching the listing and deleting the old document.
    return repo
      .flush([docHandle.documentId, replacement.documentId])
      .then(() =>
        orm.em
          .fork()
          .nativeUpdate(
            Doc_Listing_db,
            { missionId: docListing.missionId, automergeUrl: oldUrl },
            { automergeUrl: replacement.url }
          )
      )
      .then((updated) => {
        if (updated !== 1) {
          throw new Error(`Document listing changed for mission ${docListing.missionId}`);
        }
        docListing.automergeUrl = replacement.url;
        repo.delete(docHandle.url);
        serverLogger.info({
          logId: "automerge-migration",
          logValue: `Mission ${docListing.missionId}: replaced ${oldUrl} with ${replacement.url} and requested deletion of the old document.`,
        });
      });
  },
};
