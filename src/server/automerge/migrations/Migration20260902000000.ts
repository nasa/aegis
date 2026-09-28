import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Initialize absolute terrain slopes on traverses created before the field existed. */
export const Migration20260902000000: AutomergeMigration = {
  version: 20260902000000,
  name: "add-traverse-absolute-slopes",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const traverse of Object.values(mission.traverses ?? {})) {
        if (!Object.prototype.hasOwnProperty.call(traverse, "pathSegmentAbsoluteSlopes")) {
          traverse.pathSegmentAbsoluteSlopes = null;
        }
      }
    });
  },
};
