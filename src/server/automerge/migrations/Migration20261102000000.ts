import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Remove the `description` field from every rex */
export const Migration20261102000000: AutomergeMigration = {
  version: 20261102000000,
  name: "remove-rex-description",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const rex of Object.values(mission.rexes ?? {})) {
        const legacyRex = rex as RexWithLegacyFields;
        if (legacyRex && "description" in legacyRex) delete legacyRex.description;
      }
    });
  },
};
