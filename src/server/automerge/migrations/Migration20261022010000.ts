import type { AutomergeMigration } from "server/automerge/migrations/types";

type LegacyTraverse = Traverse & {
  pathSegmentElevations?: number[][] | null;
  pathSegmentAbsoluteSlopes?: (number | null)[][] | null;
};

type LegacyStation = Station & {
  walkbackPathSegmentElevations?: number[][] | null;
};

type LegacyMission = Omit<Mission, "traverses" | "stations"> & {
  traverses: Record<string, LegacyTraverse>;
  stations: Record<string, LegacyStation>;
};

/** Profiles are now derived on the client and cached on server disk. */
export const Migration20261022010000: AutomergeMigration = {
  version: 20261022010000,
  name: "move-terrain-profiles-out-of-automerge",
  migrate: async (docHandle) => {
    docHandle.change((mission: LegacyMission) => {
      for (const traverse of Object.values(mission.traverses ?? {})) {
        delete traverse.pathSegmentElevations;
        delete traverse.pathSegmentAbsoluteSlopes;
      }
      for (const station of Object.values(mission.stations ?? {})) {
        delete station.walkbackPathSegmentElevations;
      }
    });
  },
};
