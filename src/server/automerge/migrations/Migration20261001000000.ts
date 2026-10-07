import type { AutomergeMigration } from "server/automerge/migrations/types";

// Migration: add the per-REX execute-edit restriction mode. Existing REXes backfill as
// `unrestricted` with an unfrozen mode — they ran under the old unrestricted behavior, and
// the mode freezes on their next execution.
export const Migration20261001000000: AutomergeMigration = {
  version: 20261001000000,
  name: "add-rex-execute-edit-mode",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const rex of Object.values(mission.rexes ?? {})) {
        const partialRex = rex as Partial<Rex>;
        if (!("executeEditMode" in partialRex)) partialRex.executeEditMode = "unrestricted";
        if (!("executeEditState" in partialRex)) partialRex.executeEditState = null;
      }
    });
  },
};
