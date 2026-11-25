import type { AutomergeMigration } from "server/automerge/migrations/types";

type EntityWithLegacyFields = { ownerId?: number | null };

/** Remove the `ownerId` field from EVAs, stations, POIs, REXes, and presets */
export const Migration20261125000000: AutomergeMigration = {
  version: 20261125000000,
  name: "remove-owner-id",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      const collections = [
        mission.evas,
        mission.stations,
        mission.pois,
        mission.rexes,
        mission.presets,
      ];
      for (const collection of collections) {
        for (const entity of Object.values(collection ?? {})) {
          const legacyEntity = entity as EntityWithLegacyFields;
          if (legacyEntity && "ownerId" in legacyEntity) delete legacyEntity.ownerId;
        }
      }
    });
  },
};
