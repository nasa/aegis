import type { AutomergeMigration } from "server/automerge/migrations/types";

/** EVA directions default to calculation; preserve settings already saved by the editor. */
export const Migration20261022000000: AutomergeMigration = {
  version: 20261022000000,
  name: "add-eva-sun-earth-settings",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const eva of Object.values(mission.evas ?? {})) {
        if (eva.sunEarthFromDate === undefined) eva.sunEarthFromDate = true;
        if (eva.sunAzimuth === undefined) eva.sunAzimuth = 0;
        if (eva.earthAzimuth === undefined) eva.earthAzimuth = 0;
      }
    });
  },
};
