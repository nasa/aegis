import type { AutomergeMigration } from "server/automerge/migrations/types";

export const Migration20260528000000: AutomergeMigration = {
  version: 20260528000000,
  name: "add-maestro-doc-id",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      if (!("maestroDocId" in mission)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mission as any).maestroDocId = null;
      }
    });
  },
};
