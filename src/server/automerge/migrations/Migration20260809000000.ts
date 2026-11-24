import type { AutomergeMigration } from "server/automerge/migrations/types";

type LegacyMission = Mission & {
  gridRenderMode?: GridRenderMode;
  usingLGRSCoordinates?: boolean;
};

export const Migration20260809000000: AutomergeMigration = {
  version: 20260809000000,
  name: "add-grid-render-mode",
  migrate: async (docHandle) => {
    docHandle.change((mission: LegacyMission) => {
      if (mission.gridRenderMode === undefined) {
        mission.gridRenderMode = mission.usingLGRSCoordinates ? "dynamic-lgrs" : "server-file";
      }
    });
  },
};
