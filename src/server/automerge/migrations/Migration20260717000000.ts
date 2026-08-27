import type { AutomergeMigration } from "server/automerge/migrations/types";
import {
  DEFAULT_ACTION_DEFINITION_CONJUNCTIONS,
  DEFAULT_ACTION_DEFINITION_LABELS,
} from "store/storeUtils/mission";

export const Migration20260717000000: AutomergeMigration = {
  version: 20260717000000,
  name: "add-action-naming",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const doc = mission as Partial<Mission>;
      if (!("actionDefinitionLabels" in doc)) {
        doc.actionDefinitionLabels = structuredClone(DEFAULT_ACTION_DEFINITION_LABELS);
      }
      if (!("actionDefinitionConjunctions" in doc)) {
        doc.actionDefinitionConjunctions = structuredClone(DEFAULT_ACTION_DEFINITION_CONJUNCTIONS);
      }
    });
  },
};
