import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Add a dataOwner field to indicate the POC for a mission */
export const Migration20261104000000: AutomergeMigration = {
  version: 20261104000000,
  name: "add-dataOwner-mission-field",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const partialMission = mission as Partial<Mission>;
      if (!("dataOwner" in partialMission)) partialMission.dataOwner = "";
    });
  },
};
