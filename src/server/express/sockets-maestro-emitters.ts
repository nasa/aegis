import { globalValues } from "server/express/global";
import { getAll, getMissionCoreData } from "server/express/routes/all";
import {
  makeExportActions,
  makeExportEvas,
  makeEquipmentReadable,
  makeReadableActionDefinition,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "../../utils/export";
import { decodeEmoji } from "utils/formatting";
import {
  getMaestroCalculatedFieldsForStation,
  getMaestroCalculatedFieldsForTraverse,
} from "store/processing/calculatedFields";
import uniq from "lodash/uniq";
import { getActionRefUuids } from "server/express/routes/action";
import { getStationRefUuids } from "server/express/routes/station";
import { getTraverseRefUuids } from "server/express/routes/traverse";
import { getEVAs, getEVARefUuids } from "server/express/routes/eva";
import { getAutomergeDocListing } from "./routes/docListing";
import type { DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getMaestroSocketRoomName, getMissionIdFromSocketRoomName } from "./sockets-maestro";

// Deprecated
export const emitMaestroStoreUpsert = async (storeUpsert: StoreUpsert): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreUpsertForMaestro = {
    ...storeUpsert,
    type: storeUpsert.type as StoreTypeForMaestro,
    data: null,
  };
  if (storeUpsert.type === "action") {
    const allData = await getAll(storeUpsert.missionId);
    const actionData = storeUpsert.data as Action[];
    // check action is in an eva
    const allEvaSequenceUuids = allData.evas.flatMap((eva) =>
      eva.sequence.map((seqItem) => seqItem.uuid)
    );
    const actionsForMaestro = actionData.filter(
      (action) =>
        allEvaSequenceUuids.includes(action.traverseUuid) ||
        allEvaSequenceUuids.includes(action.stationUuid)
    );

    // return if none of the actions are in an eva.
    if (actionsForMaestro.length === 0) return;

    const exportedActionData = makeExportActions({
      actions: actionsForMaestro,
      allData,
      missionGrid: null,
    });
    maestroPayload.data = exportedActionData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);

    // get unique list of stations from the actions and emit updates for their new calculated fields
    // todo: this probably could be improved by only emitting if the change inside the action actually
    //    affects the station. ex: new action, or action duration that changes station duration
    const uniqueStationUuids = uniq(actionsForMaestro.map((action) => action.stationUuid));
    if (uniqueStationUuids.length > 0) {
      const exportedActionStations = makeExportStations({
        stations: allData.stations.filter((station) => uniqueStationUuids.includes(station.uuid)),
        missionGrid: null,
        allData,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "station",
        data: exportedActionStations,
      });
    }
    // get unique list of traverses from the actions and emit updates for their new calculated fields
    const uniqueTraverseUuids = uniq(actionsForMaestro.map((action) => action.traverseUuid));
    if (uniqueTraverseUuids.length > 0) {
      const exportedActionTraverses = makeExportTraverses({
        traverses: allData.traverses.filter((traverse) =>
          uniqueTraverseUuids.includes(traverse.uuid)
        ),
        missionGrid: null, // not used
        allData,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "traverse",
        data: exportedActionTraverses,
      });
    }
  } else if (storeUpsert.type === "station") {
    const allData = await getAll(storeUpsert.missionId);
    const stationData = storeUpsert.data as Station[];
    // check if station is in an eva
    const allEvaStations = allData.evas.flatMap((eva) =>
      eva.sequence.filter((seqItem) => seqItem.type === "station").map((seqItem) => seqItem.uuid)
    );
    const stationsForMaestro = stationData.filter((station) =>
      allEvaStations.includes(station.uuid)
    );
    // return if none of the stations are in an eva
    if (stationsForMaestro.length === 0) return;

    const exportedStationData = makeExportStations({
      stations: stationsForMaestro,
      missionGrid: null,
      allData,
      exportActions: false,
    });
    maestroPayload.data = exportedStationData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "traverse") {
    const allData = await getAll(storeUpsert.missionId);
    const traverseData = storeUpsert.data as Traverse[];
    // Check if traverse is in an eva
    // Technically traverses are *always* in an eva, so always send it, with the one exception where
    //    a new station (and therefore a traverse is generated) is added to an EVA. The traverse gets
    //    auto saved to the db to prevent weird cancel behaviors, but the EVA sequence in the DB hasn't
    //    been updated yet. If thats the case, don't send to Maestro. Check for this case below.
    const allEvaTraverses = allData.evas.flatMap((eva) =>
      eva.sequence.filter((seqItem) => seqItem.type === "traverse").map((seqItem) => seqItem.uuid)
    );
    const traversesForMaestro = traverseData.filter((station) =>
      allEvaTraverses.includes(station.uuid)
    );
    // return if none of the traverses are in an eva
    if (traversesForMaestro.length === 0) return;

    const exportedTraverses: ExportTraverse[] = makeExportTraverses({
      traverses: storeUpsert.data as Traverse[],
      missionGrid: null, // not used
      allData,
      exportActions: false,
    });
    maestroPayload.data = exportedTraverses;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "eva") {
    const allData = await getAll(storeUpsert.missionId);
    const evaData = storeUpsert.data as Eva[];
    const evasForMaestro = makeExportEvas({
      evas: evaData,
      allData,
      missionGrid: null, // not used
    });
    maestroPayload.data = evasForMaestro;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "rex") {
    // only emit if it's a maestro controlled rex
    const rexData = storeUpsert.data as Rex[];
    const rexesForMaestro = rexData.filter((rex) => rex.maestroControlled);
    // return if none of the rexes are maestro controlled
    if (rexesForMaestro.length === 0) return;

    const exportedRexData: ExportRex[] = makeExportRexes({
      rexes: rexesForMaestro,
    });
    maestroPayload.data = exportedRexData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else {
    throw new Error(`Unknown store upsert type in emitMaestroStoreUpsert: ${storeUpsert.type}`);
  }
};

// Deprecated
export const emitMaestroStoreDelete = async (storeDelete: StoreDelete): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreDeleteForMaestro = {
    ...storeDelete,
    type: storeDelete.type as StoreTypeForMaestro,
    refUuids: null,
  };
  if (storeDelete.type === "action") {
    const actionRefUuids = await getActionRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = actionRefUuids;
  } else if (storeDelete.type === "station") {
    const stationRefUuids = await getStationRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = stationRefUuids;
  } else if (storeDelete.type === "traverse") {
    const traverseRefUuids = await getTraverseRefUuids(storeDelete.uuids);
    maestroPayload.refUuids = traverseRefUuids;
  } else if (storeDelete.type === "eva") {
    const evaRefUuids = await getEVARefUuids(storeDelete.uuids);
    maestroPayload.refUuids = evaRefUuids;
  } else if (storeDelete.type === "rex") {
    // nothing needs translated here, just send the rex as is
  } else {
    throw new Error(`Unknown store delete type in emitMaestroStoreDelete: ${storeDelete.type}`);
  }
  io.to("maestro").emit("storeDeleteForMaestro", maestroPayload);
};

// ─── Maestro namespace emit helpers ──────────────────────────────────────────

/**
 * Determines whether a payload contains data relevant to subscribed EVAs.
 */
export const isRelevantToSubscribedEvas = async (
  missionId: number,
  type: string,
  payload: StoreUpsert | StoreDelete
): Promise<boolean> => {
  const subscribedEvaUuids = globalValues.maestro.evaSubscriptions.get(missionId);
  if (!subscribedEvaUuids || subscribedEvaUuids.length === 0) return false;

  if (type === "eva") {
    if ("data" in payload) {
      const evaUuids = (payload.data as Eva[]).map((e) => e.uuid);
      return evaUuids.some((uuid) => subscribedEvaUuids.includes(uuid));
    }
    // Just return true. Over-sending is okay for now
    return true;
  }

  // Get EVAs
  const evas = await getEVAs(missionId);
  const subscribedEvas = evas.filter((eva) => subscribedEvaUuids.includes(eva.uuid));

  if (type === "rex") {
    if ("data" in payload) {
      const subscribedEvaUuids = subscribedEvas.map((eva) => eva.uuid);
      return (payload.data as Rex[]).some((rex) => subscribedEvaUuids.includes(rex.evaUuid));
    }
    // Just return true. Over-sending is okay for now
    return true;
  }

  const subscribedSequenceUuids = new Set(
    subscribedEvas.flatMap((eva) => eva.sequence.map((seq) => seq.uuid))
  );
  // action - Check action parent fields has one of the sequence uuids
  if (type === "action") {
    if ("data" in payload) {
      return (payload.data as Action[]).some(
        (a) =>
          subscribedSequenceUuids.has(a.stationUuid) || subscribedSequenceUuids.has(a.traverseUuid)
      );
    }
    // For delete we don't have the action's parents, just return true. Over-sending is okay for now
    return true;
  }

  // station or traverse — check by sequence uuid in eva
  const uuids =
    "data" in payload ? (payload.data as { uuid: string }[]).map((d) => d.uuid) : payload.uuids;
  return uuids.some((uuid) => subscribedSequenceUuids.has(uuid));
};

/**
 * Throttled emitters for the /maestro namespace, keyed by missionId.
 * This is for performance so we don't have to build the AegisEntity for maestro a bunch of times
 */
const throttledMaestroEmitters = new Map<number, ReturnType<typeof throttle>>();

/**
 * Emits the AEGIS data Maestro cares about to the maestro namespace for a given mission ID.
 * This is throttled and should be used for any updates that would require Maestro to update its data,
 * such as store upserts and deletes. Over-sending emits is fine for now.
 * @param missionId
 */
export const emitToMaestroNamespace = (missionId: number): void => {
  if (!throttledMaestroEmitters.has(missionId)) {
    throttledMaestroEmitters.set(
      missionId,
      throttle(
        async () => {
          try {
            const maestroNamespace = globalValues.maestro.socketio;
            if (!maestroNamespace) return;
            const roomName = getMaestroSocketRoomName(missionId);
            // Check the room size again. It's already checked before this
            // function is called but check again just in-case the room
            // emptied while we were checking relevance
            const roomSize = maestroNamespace.adapter.rooms.get(roomName)?.size ?? 0;
            if (roomSize === 0) return;

            const entity = await buildAegisEntityForMaestro(missionId);
            maestroNamespace.to(roomName).emit("dataAll", entity);
          } catch (error) {
            serverLogger.error(
              {
                logId: "socket-maestro",
                logValue: `Error emitting to maestro namespace for mission ${missionId}`,
              },
              error instanceof Error ? error : new Error(String(error))
            );
          }
        },
        500,
        { leading: true, trailing: true }
      )
    );
  }
  throttledMaestroEmitters.get(missionId)!();
};

/**
 * Creates the object for AEGIS data maestro cares about to be sent across sockets
 */
export const buildAegisEntityForMaestro = async (
  missionId: number
): Promise<Maestro.IAegisEntity> => {
  const allData = await getMissionCoreData(missionId);

  // Only include EVAs that Maestro has subscribed to for this mission
  // Use a Set instead of arrays, they are slightly faster for lookups vs using array includes and filter functions
  const subscribedEvaUuids = globalValues.maestro.evaSubscriptions.get(missionId) ?? [];
  const subscribedEvaUuidSet = new Set(subscribedEvaUuids);
  const subscribedEvas = allData.evas.filter((eva) => subscribedEvaUuidSet.has(eva.uuid));

  // Collect station and traverse UUIDs that belong to subscribed EVAs
  const subscribedStationUuidSet = new Set<string>();
  const subscribedTraverseUuidSet = new Set<string>();
  for (const eva of subscribedEvas) {
    for (const seqItem of eva.sequence) {
      if (seqItem.type === "station") subscribedStationUuidSet.add(seqItem.uuid);
      else subscribedTraverseUuidSet.add(seqItem.uuid);
    }
  }

  const subscribedStations = allData.stations.filter((s) => subscribedStationUuidSet.has(s.uuid));
  const subscribedTraverses = allData.traverses.filter((t) =>
    subscribedTraverseUuidSet.has(t.uuid)
  );
  const subscribedActions = allData.actions.filter(
    (a) =>
      (a.stationUuid && subscribedStationUuidSet.has(a.stationUuid)) ||
      (a.traverseUuid && subscribedTraverseUuidSet.has(a.traverseUuid))
  );

  // Build lookup maps once for O(1) access in format functions
  const lookups = buildLookupMaps(allData);

  const formattedMission = formatMissionForMaestro(allData.mission);
  const formattedEvas = formatEvasForMaestro(subscribedEvas, lookups);
  const formattedStations = formatStationsForMaestro(subscribedStations, allData, lookups);
  const formattedTraverses = formatTraversesForMaestro(subscribedTraverses, allData, lookups);
  const formattedActions = formatActionsForMaestro(subscribedActions, allData, lookups);

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

const formatMissionForMaestro = (mission: Mission): Maestro.AegisMission => ({
  id: mission.id,
  name: mission.name,
  description: mission.description ?? "",
  actionSystemVersion: mission.actionSystemVersion as 1 | 2,
  createdAt: new Date(mission.createdAt).toISOString(),
  updatedAt: new Date(mission.updatedAt).toISOString(),
});

interface LookupMaps {
  stationByUuid: Map<string, Station>;
  traverseByUuid: Map<string, Traverse>;
  actionByUuid: Map<string, Action>;
  rexByEvaUuid: Map<string, Rex>;
  evaBySequenceUuid: Map<string, Eva>;
}

// Build a lookup for performance, keyed by uuid for faster lookup of objects
// This allows lookups in O(1) instead of using Array.find O(n)
const buildLookupMaps = (allData: MissionCoreData): LookupMaps => {
  const stationByUuid = new Map(allData.stations.map((s) => [s.uuid, s]));
  const traverseByUuid = new Map(allData.traverses.map((t) => [t.uuid, t]));
  const actionByUuid = new Map(allData.actions.map((a) => [a.uuid, a]));
  const rexByEvaUuid = new Map(allData.rexes.map((r) => [r.evaUuid, r]));

  // Map each sequence item UUID to its parent EVA for O(1) "which EVA contains this?" lookups
  const evaBySequenceUuid = new Map<string, Eva>();
  for (const eva of allData.evas) {
    for (const seqItem of eva.sequence) {
      evaBySequenceUuid.set(seqItem.uuid, eva);
    }
  }

  return { stationByUuid, traverseByUuid, actionByUuid, rexByEvaUuid, evaBySequenceUuid };
};

const formatEvasForMaestro = (evas: Eva[], lookups: LookupMaps): Maestro.AegisEva[] => {
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
          refUuid = lookups.stationByUuid.get(seqItem.uuid)?.refUuid ?? "";
        } else {
          refUuid = lookups.traverseByUuid.get(seqItem.uuid)?.refUuid ?? "";
        }
        return { type: seqItem.type, refUuid };
      }),
      ingressLocationRefUuid:
        eva.ingressLocationUuid === "lander"
          ? "lander"
          : (lookups.stationByUuid.get(eva.ingressLocationUuid)?.refUuid ?? ""),
      ingressDuration: eva.ingressDuration ?? 0,
      egressLocationRefUuid:
        eva.egressLocationUuid === "lander"
          ? "lander"
          : (lookups.stationByUuid.get(eva.egressLocationUuid)?.refUuid ?? ""),
      egressDuration: eva.egressDuration ?? 0,
      createdAt: new Date(eva.createdAt).toISOString(),
      updatedAt: new Date(eva.updatedAt).toISOString(),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatStationsForMaestro = (
  stations: Station[],
  allData: MissionCoreData,
  lookups: LookupMaps
): Maestro.AegisStation[] => {
  return stations.map((station) => {
    const stationActions = allData.actions.filter(
      (a) => a.stationUuid === station.uuid && a.enabled
    );
    const evaThisStationIsIn = lookups.evaBySequenceUuid.get(station.uuid);
    const rex = evaThisStationIsIn ? lookups.rexByEvaUuid.get(evaThisStationIsIn.uuid) : undefined;
    return {
      missionId: station.missionId,
      name: station.name,
      refUuid: station.refUuid,
      iconEmojiDecoded: decodeEmoji(station.icon),
      duration: station.duration,
      calculatedFields: getMaestroCalculatedFieldsForStation(stationActions),
      description: station.description,
      actionOrderRefUuids:
        station.actionOrderUuids
          ?.map((uuid) => lookups.actionByUuid.get(uuid)?.refUuid)
          .filter(Boolean) ?? [],
      createdAt: new Date(station.createdAt).toISOString(),
      updatedAt: new Date(station.updatedAt).toISOString(),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatTraversesForMaestro = (
  traverses: Traverse[],
  allData: MissionCoreData,
  lookups: LookupMaps
): Maestro.AegisTraverse[] => {
  return traverses.map((traverse) => {
    const traverseEva = lookups.evaBySequenceUuid.get(traverse.uuid);
    const traverseActions = allData.actions.filter(
      (a) => a.traverseUuid === traverse.uuid && a.enabled
    );
    const rex = traverseEva ? lookups.rexByEvaUuid.get(traverseEva.uuid) : undefined;
    return {
      refUuid: traverse.refUuid,
      missionId: traverse.missionId,
      name: traverse.name,
      description: traverse.description,
      actionOrderRefUuids:
        traverse.actionOrderUuids
          ?.map((uuid) => lookups.actionByUuid.get(uuid)?.refUuid)
          .filter(Boolean) ?? [],
      createdAt: new Date(traverse.createdAt).toISOString(),
      updatedAt: new Date(traverse.updatedAt).toISOString(),
      duration: traverse.duration,
      calculatedFields: getMaestroCalculatedFieldsForTraverse({
        traverse,
        missionTraverseRate: allData.mission.traverseRate,
        evaTraverseRate: traverseEva?.traverseRate,
        traverseActions,
      }),
      ...(rex && { rexUuid: rex.uuid }),
    };
  });
};

const formatActionsForMaestro = (
  actions: Action[],
  allData: MissionCoreData,
  lookups: LookupMaps
): Maestro.AegisAction[] => {
  return actions.map((action) => {
    const actionStation = action.stationUuid
      ? lookups.stationByUuid.get(action.stationUuid)
      : undefined;
    const actionTraverse = action.traverseUuid
      ? lookups.traverseByUuid.get(action.traverseUuid)
      : undefined;
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
        mission: allData.mission,
      }),
      actionDefinitionReadable: makeReadableActionDefinition({
        action,
        actionDefinitions: allData.mission.actionDefinitions,
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

// Adds a new automerge doc listener for a mission and emits changes to the roomName
// Called when a maestro visitor joins a mission
export const addMaestroDocListenerForMission = async (
  missionId: number,
  roomName: string
): Promise<void> => {
  if (globalValues.maestro.docListeners.has(roomName)) return; // Already listening, exit

  try {
    // The listener function to watch for changes on the automerge doc
    // Format data and send across sockets. The emit function is also throttled
    // so technically there are 2 throttles in this flow.
    const throttledListener = throttle(
      () => {
        const maestroNamespace = globalValues.maestro.socketio;
        if (!maestroNamespace) return; // maestro namespace not initialized
        const roomSize = maestroNamespace.adapter.rooms.get(roomName)?.size ?? 0;
        if (roomSize === 0) return; // no one in room, exit early

        emitToMaestroNamespace(missionId);
      },
      500,
      { leading: true, trailing: true }
    );

    // Get automerge doc handle
    const automergeListing = (await getAutomergeDocListing([missionId]))[0];
    const missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      automergeListing.automergeUrl as DocumentId
    );
    await missionDocHandle.whenReady();

    // Attach listener and add references to global values
    missionDocHandle.on("change", throttledListener);
    globalValues.maestro.docListeners.set(roomName, () =>
      missionDocHandle.off("change", throttledListener)
    );
    serverLogger.debug({
      logId: "socket-maestro",
      logValue: `addMaestroDocListenerForMission - Added maestro automerge doc listener for room ${roomName} and mission ${missionId}`,
    });
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-maestro",
        logValue: `addMaestroDocListenerForMission - Error adding maestro doc listener for mission ${missionId} and room ${roomName}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

// This fn is only called if the room is empty
export const cleanupSocketRoom = (roomName: string): void => {
  // Gets the automerge doc handle listeners from global for a room name and removes them
  const removeListenerFn = globalValues.maestro.docListeners.get(roomName);
  if (!removeListenerFn) return;
  // remove the docHandle change listener and delete the reference from global
  removeListenerFn();
  globalValues.maestro.docListeners.delete(roomName);

  // Removes the throttle emitter
  const removed = throttledMaestroEmitters.delete(getMissionIdFromSocketRoomName(roomName) ?? -1);
  if (!removed) {
    serverLogger.warning({
      logId: "socket-maestro",
      logValue: `cleanupSocketRoom - No throttled emitter found to remove for room ${roomName}`,
    });
  }

  serverLogger.debug({
    logId: "socket-maestro",
    logValue: `cleanupSocketRoom - Cleaned up maestro socket room ${roomName}`,
  });
};
