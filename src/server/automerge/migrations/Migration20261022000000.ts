import type { AutomergeMigration } from "server/automerge/migrations/types";

/** Profiles are now derived on the client and cached on server disk. */
export const Migration20261022000000: AutomergeMigration = {
  version: 20261022000000,
  name: "move-terrain-profiles-out-of-automerge",
  migrate: async (docHandle) => {
    docHandle.change((mission) => {
      for (const traverse of Object.values(mission.traverses ?? {}) as (Traverse & {
        pathSegmentElevations?: unknown;
        pathSegmentAbsoluteSlopes?: unknown;
      })[]) {
        delete traverse.pathSegmentElevations;
        delete traverse.pathSegmentAbsoluteSlopes;
      }
      for (const station of Object.values(mission.stations ?? {}) as (Station & {
        walkbackPathSegmentElevations?: unknown;
      })[]) {
        delete station.walkbackPathSegmentElevations;
      }
    });
  },
};
