import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Add a zero uncertainty radius and no custom radius color to legacy crew position entries. */
export const Migration20261109000000: AutomergeMigration = {
  version: 20261109000000,
  name: "add-pos-entry-uncertainty",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const rex of Object.values(mission.rexes ?? {})) {
        for (const entry of rex?.posEntries ?? []) {
          const legacyEntry = entry as Partial<PosEntry>;
          if (legacyEntry.uncertaintyMeters === undefined) legacyEntry.uncertaintyMeters = 0;
          if (legacyEntry.color === undefined) legacyEntry.color = null;
        }
      }
    });
  },
};
