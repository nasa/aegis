import type { AutomergeMigration } from "server/automerge/migrations/types";

type LegacyMission = Partial<Mission> & { isArchived?: boolean };

/** Replace the boolean isArchived field with an archivedAt timestamp (null when not archived). */
export const Migration20260909000000: AutomergeMigration = {
  version: 20260909000000,
  name: "replace-is-archived-with-archived-at",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const legacyMission = mission as LegacyMission;
      if ("isArchived" in legacyMission) {
        legacyMission.archivedAt = legacyMission.isArchived ? mission.updatedAt : null;
        delete legacyMission.isArchived;
      }

      if (!("archivedAt" in legacyMission)) legacyMission.archivedAt = null;
    });
  },
};
