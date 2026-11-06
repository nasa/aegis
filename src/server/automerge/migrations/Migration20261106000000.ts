import type { AutomergeMigration } from "server/automerge/migrations/types";

/** The mission fields this migration reads and writes, as they were when it was written. */
type GridSettingsMission = {
  planetRadius?: number | null;
  gridSystem?: "moon-m2025" | "earth-wgs84";
  earthGridLabelScheme?: "lunar-acc" | "mgrs";
};

/** Radii above this are Earth-scale (the `isEarthScale` rule when this migration was written). */
const EARTH_SCALE_MIN_RADIUS_M = 4_000_000;

/**
 * Backfill the mission grid system from the planet radius, and the Earth label scheme with
 * lunar ACC. Fields that are already set are kept.
 */
export const Migration20261106000000: AutomergeMigration = {
  version: 20261106000000,
  name: "add-mission-grid-system",
  migrate: async (docHandle) => {
    docHandle.change((doc) => {
      const mission = doc as GridSettingsMission;
      if (mission.gridSystem === undefined) {
        const radius = mission.planetRadius;
        mission.gridSystem =
          typeof radius === "number" && radius > EARTH_SCALE_MIN_RADIUS_M
            ? "earth-wgs84"
            : "moon-m2025";
      }
      if (mission.earthGridLabelScheme === undefined) {
        mission.earthGridLabelScheme = "lunar-acc";
      }
    });
  },
};
