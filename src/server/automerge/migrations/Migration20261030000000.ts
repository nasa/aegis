import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Add an empty `assets` dictionary to missions that predate asset tracking. */
export const Migration20261030000000: AutomergeMigration = {
  version: 20261030000000,
  name: "add-mission-assets",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const partialMission = mission as Partial<Mission>;
      if (partialMission.assets) return;
      partialMission.assets = {};
    });
  },
};
