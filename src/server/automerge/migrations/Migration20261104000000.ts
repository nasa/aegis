import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Add a missionRequestedBy field to indicate the POC for a mission */
export const Migration20261104000000: AutomergeMigration = {
  version: 20261104000000,
  name: "add-missionRequestedBy-mission-field",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const partialMission = mission as Partial<Mission>;
      if (!("missionRequestedBy" in partialMission)) partialMission.missionRequestedBy = "";
    });
  },
};
