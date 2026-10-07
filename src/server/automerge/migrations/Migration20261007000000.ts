import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Initialize the reporting campaign map on missions created before the field existed. */
export const Migration20261007000000: AutomergeMigration = {
  version: 20261007000000,
  name: "add-mission-report-campaigns",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const partialMission = mission as Partial<Mission>;
      if (!("reportCampaigns" in partialMission)) partialMission.reportCampaigns = {};
    });
  },
};
