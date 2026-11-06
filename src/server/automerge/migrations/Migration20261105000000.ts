import type { AutomergeMigration } from "server/automerge/migrations/types";
import { migrateMissionPlanet, usesLgrsCoordinates } from "utils/planets";
import { recalculateMissionDistances } from "operations/apply/apply-mission";

export const Migration20261105000000: AutomergeMigration = {
  version: 20261105000000,
  name: "select-mission-planet",
  migrate: async (docHandle) => {
    docHandle.change((mission) => {
      migrateMissionPlanet(mission);
      if (usesLgrsCoordinates(mission)) mission.serverFileGrid = null;
      if (!mission.demFilePath) mission.landerElevationMeters = null;
      recalculateMissionDistances(mission);
    });
  },
};
