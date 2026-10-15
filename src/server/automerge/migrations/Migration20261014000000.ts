import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Folder visibility is shared; legacy browser cookies must not seed mission-wide settings. */
export const Migration20261014000000: AutomergeMigration = {
  version: 20261014000000,
  name: "share-folder-map-visibility",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const folder of Object.values(mission.folders ?? {})) {
        if (folder.visible === undefined) folder.visible = true;
      }
    });
  },
};
