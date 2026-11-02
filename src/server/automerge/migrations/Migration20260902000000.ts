import type { AutomergeMigration } from "server/automerge/migrations/types";

type LegacyTraverse = Traverse & {
  pathSegmentAbsoluteSlopes?: (number | null)[][] | null;
};

type LegacyMission = Omit<Mission, "traverses"> & {
  traverses: Record<string, LegacyTraverse>;
};

/** Initialize absolute terrain slopes on traverses created before the field existed. */
export const Migration20260902000000: AutomergeMigration = {
  version: 20260902000000,
  name: "add-traverse-absolute-slopes",
  migrate: async (docHandle) => {
    docHandle.change((mission: LegacyMission) => {
      for (const traverse of Object.values(mission.traverses ?? {})) {
        if (!Object.prototype.hasOwnProperty.call(traverse, "pathSegmentAbsoluteSlopes")) {
          traverse.pathSegmentAbsoluteSlopes = null;
        }
      }
    });
  },
};
