import { globalValues } from "server/express/global";
import { getAutomergeDocListing } from "../../express/routes/docListing";
import type { DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getSequenceStationUuids, getSequenceTraverseUuids } from "operations/helpers/evaSequence";
import type {
  ExecuteUuidMap,
  MaestroVersionDebugInfo,
  MaestroVisitorDebugEntry,
} from "./types/socketioMaestro";
import { onChangeListener, setMaestroSnapshot, clearMaestroSnapshot } from "./onChangeListener";

/**
 * Removes the given EVA uuids from global eva subscriptions
 */
export const removeEvaFromSubscriptions = (missionId: number, deletedEvaUuids: string[]): void => {
  if (deletedEvaUuids.length === 0) return;
  const subscriptions = globalValues.maestroV2.evaSubscriptions.get(missionId);
  if (!subscriptions || subscriptions.length === 0) return;

  const updatedSubscriptions = subscriptions.filter((uuid) => !deletedEvaUuids.includes(uuid));

  if (updatedSubscriptions.length === subscriptions.length) return; // nothing changed
  if (updatedSubscriptions.length === 0) {
    globalValues.maestroV2.evaSubscriptions.delete(missionId);
  } else {
    globalValues.maestroV2.evaSubscriptions.set(missionId, updatedSubscriptions);
  }
};

/**
 * Adds a new automerge doc listener for a mission and emits Maestro updates whenever
 * the Maestro-relevant slice of the document changes.
 * Called when a Maestro visitor joins a mission.
 */
export const addMaestroDocListenerForMission = async (missionId: number): Promise<void> => {
  if (globalValues.maestroV2.docListeners.has(missionId)) return; // Already listening, exit

  // Set a placeholder immediately (before any awaits) to prevent two concurrent
  // calls from attaching duplicate listeners because this one was still processing
  globalValues.maestroV2.docListeners.set(missionId, () => {});

  try {
    // Get automerge doc handle
    const automergeListing = (await getAutomergeDocListing([missionId]))[0];
    const missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      automergeListing.automergeUrl as DocumentId
    );

    // Save the reference to the handle so we can access the document faster without having to find it.
    globalValues.maestroV2.docHandles.set(missionId, missionDocHandle);

    // Initialize first snapshot with the current doc state.
    const initialDoc = missionDocHandle.doc();
    if (initialDoc) {
      setMaestroSnapshot(missionId, initialDoc);
    }

    const throttledListener = throttle(
      () => {
        onChangeListener(missionId, missionDocHandle);
      },
      500,
      {
        leading: true,
        trailing: true,
      }
    );

    missionDocHandle.on("change", throttledListener);
    globalValues.maestroV2.docListeners.set(missionId, () => {
      missionDocHandle.off("change", throttledListener);
    });

    serverLogger.debug({
      logId: "socket-maestro-v2",
      logValue: `addMaestroDocListenerForMission - Added maestro automerge doc listener for mission ${missionId}`,
    });
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-maestro-v2",
        logValue: `addMaestroDocListenerForMission - Error adding maestro doc listener for mission ${missionId}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

/**
 * Cleanup all things associated with maestro for this mission
 * This is only called if the room is empty
 * @param missionId
 */
export const cleanupMaestro = (missionId: number): void => {
  // Remove the docHandle change listener and delete the reference from global
  const removeListenerFn = globalValues.maestroV2.docListeners.get(missionId);
  if (!removeListenerFn) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue: `cleanupMaestro - No listener function found to remove for mission ${missionId}`,
    });
  } else {
    removeListenerFn();
    globalValues.maestroV2.docListeners.delete(missionId);
  }

  // Remove snapshot
  clearMaestroSnapshot(missionId);

  // Remove global doc handle reference
  const docHandleRemoved = globalValues.maestroV2.docHandles.delete(missionId);
  if (!docHandleRemoved) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue: `cleanupMaestro - No docHandle found to remove for mission ${missionId}`,
    });
  }

  // All cleanup done
  serverLogger.debug({
    logId: "socket-maestro-v2",
    logValue: `cleanupMaestro - Cleaned up listener, docHandle, and snapshot for mission ${missionId}`,
  });
};

/**
 * Summary information of the Maegistro V2 information from global
 * Used in the admin page inspector
 */
export const buildDebugInfo = (): MaestroVersionDebugInfo => {
  const slice = globalValues.maestroV2;
  const docListenerMissionIds = Array.from(slice.docListeners.keys());
  const evaSubscriptions: { [missionId: number]: string[] } = {};
  slice.evaSubscriptions.forEach((uuids, missionId) => {
    evaSubscriptions[missionId] = [...uuids];
  });
  const visitors: { [missionId: string]: MaestroVisitorDebugEntry[] } = {};
  for (const missionId in slice.visitorData) {
    visitors[missionId] = (slice.visitorData[missionId] ?? []).map((v) => ({
      socketId: v.socketId,
      name: v.name,
      connectedAt: v.connectedAt,
    }));
  }
  return { docListenerMissionIds, evaSubscriptions, visitors };
};

/**
 * Build the as-planned uuid → REX uuid map for a single REX.
 */
export const getExecuteUuids = (missionId: number, rexUuid: string): ExecuteUuidMap => {
  const docHandle = globalValues.maestroV2.docHandles.get(missionId);
  if (!docHandle) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue: `getExecuteUuids - no doc handle available for mission ${missionId}`,
    });
    throw new Error(`No doc handle available for mission ${missionId}`);
  }
  const mission = docHandle.doc();
  if (!mission) {
    throw new Error(`No mission document available for mission ${missionId}`);
  }

  const rex = mission.rexes?.[rexUuid];
  if (!rex) {
    throw new Error(`Rex ${rexUuid} not found in mission ${missionId}`);
  }

  const rexEva = mission.evas?.[rex.evaUuid];
  if (!rexEva) {
    throw new Error(`Rex ${rexUuid} references missing EVA ${rex.evaUuid}`);
  }

  // The as-planned EVA is the one with the same refUuid that no REX points at.
  const rexEvaUuids = new Set(Object.values(mission.rexes ?? {}).map((r) => r.evaUuid));
  const asPlannedEva = Object.values(mission.evas ?? {}).find(
    (eva) => eva.refUuid === rexEva.refUuid && !rexEvaUuids.has(eva.uuid)
  );
  if (!asPlannedEva) {
    throw new Error(`No as-planned EVA found for rex ${rexUuid} in mission ${missionId}`);
  }

  const asPlannedEntities = getEvaEntities(mission, asPlannedEva);
  const executedEntities = getEvaEntities(mission, rexEva);

  return {
    eva: { [asPlannedEva.uuid]: rexEva.uuid },
    station: getMapPlannedToExecute(asPlannedEntities.stations, executedEntities.stations),
    traverse: getMapPlannedToExecute(asPlannedEntities.traverses, executedEntities.traverses),
    action: getMapPlannedToExecute(asPlannedEntities.actions, executedEntities.actions),
  };
};

/** Every station, traverse and action that are in an EVA. */
const getEvaEntities = (
  mission: Mission,
  eva: Eva
): { stations: Identifiers[]; traverses: Identifiers[]; actions: Identifiers[] } => {
  // Filter to remove empty uuid "" in the sequence before a user picked a station
  const stationUuids = new Set(getSequenceStationUuids(eva.sequence).filter(Boolean));
  const traverseUuids = new Set(getSequenceTraverseUuids(eva.sequence).filter(Boolean));

  const stations = [...stationUuids]
    .map((uuid) => mission.stations?.[uuid]) // (Station | undefined)[]
    .filter((station): station is Station => Boolean(station)); // Station[]
  const traverses = [...traverseUuids]
    .map((uuid) => mission.traverses?.[uuid])
    .filter((traverse): traverse is Traverse => Boolean(traverse));
  const actions = Object.values(mission.actions ?? {}).filter(
    (action) =>
      (action.stationUuid && stationUuids.has(action.stationUuid)) ||
      (action.traverseUuid && traverseUuids.has(action.traverseUuid))
  );

  return { stations, traverses, actions };
};

/**
 * Map each as-planned uuid to the execute copy carrying the same `refUuid`.
 */
const getMapPlannedToExecute = (
  asPlannedIdentifiers: Identifiers[],
  executeIdentifiers: Identifiers[]
): { [oldUuid: string]: string } => {
  // Create a map of refUuid -> uuid for execute so we can do quick lookups
  const executeUuidByRefUuid = new Map(
    executeIdentifiers.filter((e) => e.refUuid).map((e) => [e.refUuid, e.uuid])
  );

  // For each as-planned refUuid, get the execute version from the matching refUuid
  const map: { [oldUuid: string]: string } = {};
  for (const asPlannedIdentifier of asPlannedIdentifiers) {
    const executeUuid = executeUuidByRefUuid.get(asPlannedIdentifier.refUuid);
    // A new uuid might be missing if this entity was deleted in the REX copy
    if (executeUuid) map[asPlannedIdentifier.uuid] = executeUuid;
  }
  return map;
};

type Identifiers = { uuid: string; refUuid: string };
