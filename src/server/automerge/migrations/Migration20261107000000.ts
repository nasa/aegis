import type { AutomergeMigration } from "server/automerge/migrations/types";

type DerivedGridMission = {
  planet?: "earth" | "moon" | "mars";
  gridSystem?: "moon-m2025" | "earth-wgs84";
  earthGridLabelScheme?: "lunar-acc" | "mgrs";
  serverFileGrid?: unknown;
};

/** Planet identity selects the reference system; Earth label preferences remain stored. */
export const Migration20261107000000: AutomergeMigration = {
  version: 20261107000000,
  name: "derive-grid-system-from-planet",
  migrate: async (docHandle) => {
    docHandle.change((doc) => {
      const mission = doc as DerivedGridMission;
      delete mission.gridSystem;
      if (mission.earthGridLabelScheme === undefined) mission.earthGridLabelScheme = "lunar-acc";
      if (mission.planet !== "earth") mission.serverFileGrid = null;
    });
  },
};
