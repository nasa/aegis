import type { AutomergeMigration } from "server/automerge/migrations/types";

export const Migration20260809000000: AutomergeMigration = {
  version: 20260809000000,
  name: "add-grid-render-mode",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      if (mission.gridRenderMode === undefined) {
        mission.gridRenderMode = mission.usingLGRSCoordinates ? "dynamic-lgrs" : "server-file";
      }
    });
  },
};
