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
  const docHandle = globalValues.maestroV2.docHandles.get(missionId);
  const mission: Mission = docHandle
    ? docHandle.doc()
    : (await getAutomergeMissions([missionId]))[0]!;

  // Only include EVAs that Maestro has subscribed to for this mission.
  // evaSubscriptions is keyed by EVA uuid.
  const subscribedEvaUuids = globalValues.maestroV2.evaSubscriptions.get(missionId) ?? [];
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
  const formattedEvas = formatEvasForMaestro(subscribedEvas);
  const formattedStations = formatStationsForMaestro(subscribedStations, lookups);
  const formattedTraverses = formatTraversesForMaestro(subscribedTraverses, mission, lookups);
  const formattedActions = formatActionsForMaestro(subscribedActions, mission);

  return {
    aegisMissions: { [missionId]: formattedMission },
    aegisEvas: Object.fromEntries(formattedEvas.map((eva) => [eva.uuid, eva])),
    aegisStations: Object.fromEntries(formattedStations.map((station) => [station.uuid, station])),
    aegisTraverses: Object.fromEntries(
      formattedTraverses.map((traverse) => [traverse.uuid, traverse])
    ),
    storedAegisActions: {}, // Deprecated
    fetchedAegisActions: Object.fromEntries(
      formattedActions.map((action) => [action.uuid, action])
    ),
  };
};

// `satisfies` ensures the returned object has exactly the keys of AegisSlice.AegisMission for safety
// It only works if there are no optional fields in AegisSlice.AegisMission type.
const formatMissionForMaestro = (mission: Mission): AegisSlice.AegisMission =>
  ({
    id: mission.id,
    name: mission.name,
    description: mission.description ?? "",
    actionSystemVersion: mission.actionSystemVersion as 1 | 2,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    actionDefinitions: mission.actionDefinitions,
    actionDefinitionLabels: mission.actionDefinitionLabels,
    actionDefinitionConjunctions: mission.actionDefinitionConjunctions,
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

const formatEvasForMaestro = (evas: Eva[]): AegisSlice.AegisEva[] => {
  return evas.map((eva) => {
    return {
      missionId: eva.missionId,
      name: eva.name,
      uuid: eva.uuid,
      description: eva.description,
      sequence: eva.sequence.map((seqItem) => ({ type: seqItem.type, uuid: seqItem.uuid })),
      datetime: eva.datetime,
      createdAt: eva.createdAt,
      updatedAt: eva.updatedAt,
    };
  });
};

const formatStationsForMaestro = (
  stations: Station[],
  lookups: LookupMaps
): AegisSlice.AegisStation[] => {
  return stations.map((station) => {
    const stationActions = (lookups.actionsByStationUuid.get(station.uuid) ?? []).filter(
      (a) => a.enabled
    );
    return {
      missionId: station.missionId,
      name: station.name,
      uuid: station.uuid,
      iconEmojiDecoded: decodeEmoji(station.icon),
      duration: station.duration,
      calculatedFields: getMaestroCalcFieldsForStation(stationActions),
      description: station.description,
      actionOrderUuids: station.actionOrderUuids ?? [],
      isLanderXgress: station.isLanderXgress,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt,
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
    return {
      uuid: traverse.uuid,
      missionId: traverse.missionId,
      name: traverse.name,
      description: traverse.description,
      actionOrderUuids: traverse.actionOrderUuids ?? [],
      createdAt: traverse.createdAt,
      updatedAt: traverse.updatedAt,
      duration: traverse.duration,
      calculatedFields: getMaestroCalcFieldsForTraverse({
        traverse,
        missionTraverseRate: mission.traverseRate,
        evaTraverseRate: traverseEva?.traverseRate,
        traverseActions,
      }),
    };
  });
};

const formatActionsForMaestro = (actions: Action[], mission: Mission): AegisSlice.AegisAction[] => {
  return actions.map((action) => {
    const actionStation = action.stationUuid ? mission.stations[action.stationUuid] : undefined;
    const actionTraverse = action.traverseUuid ? mission.traverses[action.traverseUuid] : undefined;

    return {
      name: action.name,
      uuid: action.uuid,
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
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      crewAssigned: action.crewAssigned,
      duration: action.duration,
      stmAction: action.stmAction,
      iconEmojiDecoded: decodeEmoji(action.icon),
      stationUuid: actionStation?.uuid,
      traverseUuid: actionTraverse?.uuid,
      enabled: action.enabled,
    };
  });
};
