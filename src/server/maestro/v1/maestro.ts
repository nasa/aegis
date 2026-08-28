import { decodeEmoji } from "utils/formatting";
import {
  getMaestroCalcFieldsForStation,
  getMaestroCalcFieldsForTraverse,
} from "store/processing/calculatedFields";
import { makeEquipmentReadable, makeReadableActionDefinition } from "utils/export";
import { getAutomergeMissions } from "server/express/routes/missionAutomerge";
import { globalValues } from "server/express/global";
import type { AegisSlice } from "./types/aegisSlice";

/**
 * Creates the object for AEGIS data maestro cares about to be sent across sockets
 */
export const buildAegisSliceForMaestro = async (
  missionId: number
): Promise<AegisSlice.AegisSlice> => {
  // Use the stored DocHandle reference for efficiency.
  const docHandle = globalValues.maestroV1.docHandles.get(missionId);
  const mission: Mission = docHandle
    ? docHandle.doc()
    : (await getAutomergeMissions([missionId]))[0]!;

  // Only include EVAs that Maestro has subscribed to for this mission.
  // evaSubscriptions is keyed by EVA uuid.
  const subscribedEvaUuids = globalValues.maestroV1.evaSubscriptions.get(missionId) ?? [];
  const subscribedEvaUuidSet = new Set(subscribedEvaUuids);
  const subscribedEvas = Object.values(mission.evas).filter((eva) =>
    subscribedEvaUuidSet.has(eva.uuid)
  );

  // Collect station and traverse UUIDs that belong to subscribed EVAs
  const subscribedStationUuidSet = new Set<string>();
  const subscribedTraverseUuidSet = new Set<string>();
  for (const eva of subscribedEvas) {
    for (const seqItem of eva.sequence) {
      if (seqItem.type === "station") subscribedStationUuidSet.add(seqItem.uuid);
      else subscribedTraverseUuidSet.add(seqItem.uuid);
    }
  }

  // mission.stations/traverses/actions are already KV maps — pick directly by UUID
  const subscribedStations = [...subscribedStationUuidSet]
    .map((uuid) => mission.stations[uuid])
    .filter(Boolean) as Station[];
  const subscribedTraverses = [...subscribedTraverseUuidSet]
    .map((uuid) => mission.traverses[uuid])
    .filter(Boolean) as Traverse[];
  const subscribedActions = Object.values(mission.actions).filter(
    (a) =>
      (a.stationUuid && subscribedStationUuidSet.has(a.stationUuid)) ||
      (a.traverseUuid && subscribedTraverseUuidSet.has(a.traverseUuid))
  );

  // Build the only lookup that isn't already a key-value map: sequence-item-uuid → Eva
  const lookups = buildLookupMaps(mission);
  const formattedMission = formatMissionForMaestro(mission);
  const formattedEvas = formatEvasForMaestro(subscribedEvas, mission, lookups);
  const formattedStations = formatStationsForMaestro(subscribedStations, mission, lookups);
  const formattedTraverses = formatTraversesForMaestro(subscribedTraverses, mission, lookups);
  const formattedActions = formatActionsForMaestro(subscribedActions, mission, lookups);

  return {
    aegisMissions: { [missionId]: formattedMission },
    aegisEvas: Object.fromEntries(formattedEvas.map((eva) => [eva.refUuid, eva])),
    aegisStations: Object.fromEntries(
      formattedStations.map((station) => [station.refUuid, station])
    ),
    aegisTraverses: Object.fromEntries(
      formattedTraverses.map((traverse) => [traverse.refUuid, traverse])
    ),
    storedAegisActions: {}, // Deprecated
    fetchedAegisActions: Object.fromEntries(
      formattedActions.map((action) => [action.refUuid, action])
    ),
  };
};

// `satisfies` ensures the returned object has exactly the keys of Maestro.AegisMission for safety
// It only works if there are no optional fields in Maestro.AegisMission type.
const formatMissionForMaestro = (mission: Mission): AegisSlice.AegisMission =>
  ({
    id: mission.id,
    name: mission.name,
    description: mission.description ?? "",
    actionSystemVersion: mission.actionSystemVersion as 1 | 2,
    createdAt: new Date(mission.createdAt).toISOString(),
    updatedAt: new Date(mission.updatedAt).toISOString(),
  }) satisfies Record<keyof AegisSlice.AegisMission, unknown>;

interface LookupMaps {
  /** Maps sequence-item UUID → the EVA that owns it. */
  evaBySequenceUuid: Map<string, Eva>;
  /** Maps EVA UUID → Rex for that EVA. */
  rexByEvaUuid: Map<string, Rex>;
  /** Maps station/traverse UUID → actions for that parent, for efficient per-station/traverse lookups. */
  actionsByStationUuid: Map<string, Action[]>;
  actionsByTraverseUuid: Map<string, Action[]>;
}

// We only need to build maps for relationships that aren't directly available on Mission
const buildLookupMaps = (mission: Mission): LookupMaps => {
  const evaBySequenceUuid = new Map<string, Eva>();
  for (const eva of Object.values(mission.evas)) {
    for (const seqItem of eva.sequence) {
      evaBySequenceUuid.set(seqItem.uuid, eva);
    }
  }

  const rexByEvaUuid = new Map<string, Rex>();
  for (const rex of Object.values(mission.rexes)) {
    rexByEvaUuid.set(rex.evaUuid, rex);
  }

  const actionsByStationUuid = new Map<string, Action[]>();
  const actionsByTraverseUuid = new Map<string, Action[]>();
  for (const action of Object.values(mission.actions)) {
    if (action.stationUuid) {
      const list = actionsByStationUuid.get(action.stationUuid) ?? [];
      list.push(action);
      actionsByStationUuid.set(action.stationUuid, list);
    }
    if (action.traverseUuid) {
      const list = actionsByTraverseUuid.get(action.traverseUuid) ?? [];
      list.push(action);
      actionsByTraverseUuid.set(action.traverseUuid, list);
    }
  }

  return { evaBySequenceUuid, rexByEvaUuid, actionsByStationUuid, actionsByTraverseUuid };
};

const formatEvasForMaestro = (
  evas: Eva[],
  mission: Mission,
  lookups: LookupMaps
): AegisSlice.AegisEva[] => {
  return evas.map((eva) => {
    const rex = lookups.rexByEvaUuid.get(eva.uuid);
    return {
      missionId: eva.missionId,
      name: eva.name,
      refUuid: eva.refUuid,
      description: eva.description,
      sequenceRefUuids: eva.sequence.map((seqItem) => {
        let refUuid = "";
        if (seqItem.type === "station") {
          refUuid = mission.stations[seqItem.uuid]?.refUuid ?? "";
        } else {
          refUuid = mission.traverses[seqItem.uuid]?.refUuid ?? "";
        }
        return { type: seqItem.type, refUuid };
      }),
      // Egress and ingress are ordinary stations at the ends of
      // `sequenceRefUuids` now, so these four fields carry nothing the sequence
      // does not. They stay in the payload as nulls until the Maestro contract
      // is renegotiated.
      ingressLocationRefUuid: null as string | null,
      ingressDuration: null as number | null,
      egressLocationRefUuid: null as string | null,
      egressDuration: null as number | null,
      createdAt: new Date(eva.createdAt).toISOString(),
      updatedAt: new Date(eva.updatedAt).toISOString(),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatStationsForMaestro = (
  stations: Station[],
  mission: Mission,
  lookups: LookupMaps
): AegisSlice.AegisStation[] => {
  return stations.map((station) => {
    const stationActions = (lookups.actionsByStationUuid.get(station.uuid) ?? []).filter(
      (a) => a.enabled
    );
    const evaThisStationIsIn = lookups.evaBySequenceUuid.get(station.uuid);
    const rex = evaThisStationIsIn ? lookups.rexByEvaUuid.get(evaThisStationIsIn.uuid) : undefined;
    return {
      missionId: station.missionId,
      name: station.name,
      refUuid: station.refUuid,
      iconEmojiDecoded: decodeEmoji(station.icon),
      duration: station.duration,
      calculatedFields: getMaestroCalcFieldsForStation(stationActions),
      description: station.description,
      actionOrderRefUuids:
        station.actionOrderUuids?.map((uuid) => mission.actions[uuid]?.refUuid).filter(Boolean) ??
        [],
      createdAt: new Date(station.createdAt).toISOString(),
      updatedAt: new Date(station.updatedAt).toISOString(),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatTraversesForMaestro = (
  traverses: Traverse[],
  mission: Mission,
  lookups: LookupMaps
): AegisSlice.AegisTraverse[] => {
  return traverses.map((traverse) => {
    const traverseEva = lookups.evaBySequenceUuid.get(traverse.uuid);
    const traverseActions = (lookups.actionsByTraverseUuid.get(traverse.uuid) ?? []).filter(
      (a) => a.enabled
    );
    const rex = traverseEva ? lookups.rexByEvaUuid.get(traverseEva.uuid) : undefined;
    return {
      refUuid: traverse.refUuid,
      missionId: traverse.missionId,
      name: traverse.name,
      description: traverse.description,
      actionOrderRefUuids:
        traverse.actionOrderUuids?.map((uuid) => mission.actions[uuid]?.refUuid).filter(Boolean) ??
        [],
      createdAt: new Date(traverse.createdAt).toISOString(),
      updatedAt: new Date(traverse.updatedAt).toISOString(),
      duration: traverse.duration,
      calculatedFields: getMaestroCalcFieldsForTraverse({
        traverse,
        missionTraverseRate: mission.traverseRate,
        evaTraverseRate: traverseEva?.traverseRate,
        traverseActions,
      }),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatActionsForMaestro = (
  actions: Action[],
  mission: Mission,
  lookups: LookupMaps
): AegisSlice.AegisAction[] => {
  return actions.map((action) => {
    const actionStation = action.stationUuid ? mission.stations[action.stationUuid] : undefined;
    const actionTraverse = action.traverseUuid ? mission.traverses[action.traverseUuid] : undefined;
    let rexUuid: string | undefined;
    const parentUuid = actionStation?.uuid ?? actionTraverse?.uuid;
    const evaThisActionIsIn = parentUuid ? lookups.evaBySequenceUuid.get(parentUuid) : undefined;
    if (evaThisActionIsIn) {
      const rex = lookups.rexByEvaUuid.get(evaThisActionIsIn.uuid);
      if (rex) rexUuid = rex.uuid;
    }
    return {
      name: action.name,
      refUuid: action.refUuid,
      descriptionTask: action.descriptionTask,
      equipmentItemsUsageReadable: makeEquipmentReadable({
        equipmentItems: action.equipmentItemsUsage,
        mission,
      }),
      actionDefinitionReadable: makeReadableActionDefinition({
        action,
        mission,
      }),
      missionId: action.missionId,
      icon: action.icon,
      createdAt: new Date(action.createdAt).toISOString(),
      updatedAt: new Date(action.updatedAt).toISOString(),
      crewAssigned: action.crewAssigned,
      duration: action.duration,
      stmAction: action.stmAction,
      iconEmojiDecoded: decodeEmoji(action.icon),
      stationRefUuid: actionStation?.refUuid,
      traverseRefUuid: actionTraverse?.refUuid,
      enabled: action.enabled,
      ...(rexUuid && { rexUuid }),
    };
  });
};
