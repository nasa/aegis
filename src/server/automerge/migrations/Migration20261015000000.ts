import type { AutomergeMigration } from "server/automerge/migrations/types";

/**
 * The entity collections that used to carry a `missionId`. Each lives inside the mission
 * document, so the id is redundant and has been removed from the entity types; this strips
 * the stale field from documents created before that change.
 */
const COLLECTIONS_WITH_LEGACY_MISSION_ID = [
  "pois",
  "stations",
  "traverses",
  "actions",
  "evas",
  "rexes",
  "layers",
  "sublayers",
  "presets",
  "stmLevel1s",
  "stmRules",
  "folders",
] as const satisfies readonly (keyof Mission)[];

/** Remove the now-defunct `missionId` field from every entity in a mission document. */
export const Migration20261015000000: AutomergeMigration = {
  version: 20261015000000,
  name: "remove-missionid-from-mission-entities",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const key of COLLECTIONS_WITH_LEGACY_MISSION_ID) {
        const collection = mission[key] as Record<string, { missionId?: unknown }> | undefined;
        if (!collection) continue;
        for (const entity of Object.values(collection)) {
          if (entity && "missionId" in entity) delete entity.missionId;
        }
      }
    });
  },
};
