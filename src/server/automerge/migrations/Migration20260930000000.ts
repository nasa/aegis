import type { AutomergeMigration } from "server/automerge/migrations/types";
import { serverLogger } from "utils/logging/serverLogger";

// Migration: Rename `maestroActivityPropertiesByRefUuid` to
// `maestroActivityProperties` and rekey any legacy refUuid keys to the
// matching station/traverse uuid within the REX's own scope.
export const Migration20260930000000: AutomergeMigration = {
  version: 20260930000000,
  name: "maegistro-replace-refuuid-with-uuid",
  migrate: async (docHandle) => {
    docHandle.change((mission: Mission) => {
      for (const rex of Object.values(mission.rexes ?? {})) {
        const legacyRex = rex as RexWithLegacyFields;
        if (!("maestroActivityPropertiesByRefUuid" in legacyRex)) continue;

        const legacyProperties = legacyRex.maestroActivityPropertiesByRefUuid;
        if (!legacyProperties) {
          rex.maestroActivityProperties = null;
          delete legacyRex.maestroActivityPropertiesByRefUuid;
          continue;
        }

        // A key is either already a uuid in this REX's sequence, or a
        // refUuid that resolves to one.
        const sequence = mission.evas?.[rex.evaUuid]?.sequence ?? [];
        const uuidByRefUuid: { [refUuid: string]: string } = {};
        for (const seqItem of sequence) {
          const refUuid =
            seqItem.type === "station"
              ? mission.stations?.[seqItem.uuid]?.refUuid
              : mission.traverses?.[seqItem.uuid]?.refUuid;
          if (refUuid) uuidByRefUuid[refUuid] = seqItem.uuid;
        }
        const sequenceUuids = new Set(sequence.map((seqItem) => seqItem.uuid));

        const properties: MaestroActivityProperties = {};
        for (const [key, value] of Object.entries(legacyProperties)) {
          const uuid = sequenceUuids.has(key) ? key : uuidByRefUuid[key];
          if (!uuid) {
            serverLogger.warning({
              logId: "automerge-migration",
              logValue: `Mission ${mission.id} REX ${rex.uuid} could not resolve maestro activity property key "${key}" to a sequence item; dropping it`,
            });
            continue;
          }
          properties[uuid] = { ...value };
        }

        rex.maestroActivityProperties = properties;
        delete legacyRex.maestroActivityPropertiesByRefUuid;
      }
    });
  },
};
