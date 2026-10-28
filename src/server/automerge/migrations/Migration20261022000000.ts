import type { AutomergeMigration } from "server/automerge/migrations/types";

type LegacyPreset = Preset & {
  sunAzimuth?: number;
  sunEnabled?: boolean;
  earthAzimuth?: number;
  earthEnabled?: boolean;
  earthAsMoon?: boolean;
  sunEarthFromDate?: boolean;
};

/** Default EVA directions to calculation and remove obsolete preset Sun/Earth settings. */
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
      for (const preset of Object.values(mission.presets ?? {})) {
        const legacyPreset = preset as LegacyPreset;
        delete legacyPreset.sunAzimuth;
        delete legacyPreset.sunEnabled;
        delete legacyPreset.earthAzimuth;
        delete legacyPreset.earthEnabled;
        delete legacyPreset.earthAsMoon;
        delete legacyPreset.sunEarthFromDate;
      }
    });
  },
};
