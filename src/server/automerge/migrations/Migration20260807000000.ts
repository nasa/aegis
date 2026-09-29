import type { AutomergeMigration } from "server/automerge/migrations/types";
import { migrateLegacyCircleControlHaloStyles } from "store/storeUtils/preset";

export const Migration20260807000000: AutomergeMigration = {
  version: 20260807000000,
  name: "migrate-legacy-circle-halo-styles",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const station of Object.values(mission.stations ?? {})) {
        migrateLegacyCircleControlHaloStyles(station.mapCircleControls);
      }
    });
  },
};
