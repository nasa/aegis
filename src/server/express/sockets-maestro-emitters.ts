import { globalValues } from "server/express/global";
import { getAutomergeDocListing } from "./routes/docListing";
import type { DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getMaestroSocketRoomName } from "./sockets-maestro";
import { buildAegisEntityForMaestro } from "utils/maestro";
import { getSequenceUuidByRefUuidAndRexUuid } from "store/selectors";
import { emitMaestroStoreUpsertFromDiff } from "./sockets-maestro-legacy";

// ─── Maestro namespace emit helpers ──────────────────────────────────────────

/**
 * Top-level Mission keys for entity collections (stations, evas, etc.) that Maestro cares about.
 */
export type MaestroRelevantCollectionKey = Extract<
  keyof Mission,
  "evas" | "stations" | "traverses" | "actions" | "rexes"
>;

/**
 * Top-level Mission fields that Maestro cares about.
 * Any change to these is always relevant to Maestro regardless of EVA subscriptions.
 *
 * `satisfies` ensures the returned object has exactly the keys of Maestro.AegisMission for safety.
 * It only works if there are no optional fields in Maestro.AegisMission type.
 */
const MAESTRO_RELEVANT_MISSION_FIELDS = [
  "name",
  "id",
  "description",
  "actionSystemVersion",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof Maegistro.AegisMission)[];
type MaestroRelevantMissionField = (typeof MAESTRO_RELEVANT_MISSION_FIELDS)[number];

/** Diff result — what was upserted and what was deleted. */
export type MaestroDiff = {
  evas: { upserted: Eva[]; deletedUuids: string[] };
  stations: { upserted: Station[]; deletedUuids: string[] };
  traverses: { upserted: Traverse[]; deletedUuids: string[] };
  actions: { upserted: Action[]; deletedUuids: string[] };
  rexes: { upserted: Rex[]; deletedUuids: string[] };
  changedMissionFields: MaestroRelevantMissionField[]; // Names of Maestro-relevant mission fields that changed value.
  hasAnyChange: boolean; // True if anything at all changed since the previous snapshot.
};

/**
 * The top-level keys that Maestro cares about.
 */
type MissionDataMaestroCaresAbout = {
  evas: Mission["evas"];
  stations: Mission["stations"];
  traverses: Mission["traverses"];
  actions: Mission["actions"];
  rexes: Mission["rexes"];
  missionFields: Pick<Mission, MaestroRelevantMissionField>;
};

/**
 * Stored per-mission snapshot of mission data maestro cares about.
 * Use this to compare and find diffs
 */
const maestroDataSnapshots = new Map<number, MissionDataMaestroCaresAbout>();

// Helper function to build the data Maestro cares about (snapshot) from a full Mission object
const buildMissionDataMaestroCaresAbout = (mission: Mission): MissionDataMaestroCaresAbout => ({
  evas: mission.evas,
  stations: mission.stations,
  traverses: mission.traverses,
  actions: mission.actions,
  rexes: mission.rexes,
  missionFields: {
    name: mission.name,
    id: mission.id,
    description: mission.description,
    actionSystemVersion: mission.actionSystemVersion,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  },
});

/**
 * Helper to diffs two collections by reference. Returns the entities that were added or
 * modified (present in `next` with a different reference than `prev`) and the UUIDs
 * that were removed.
 *
 * Relies on automerge's referential stability for unchanged sub-objects.
 * Automerge keeps unchanged sub-objects referentially equal across changes, so collection
 * diffing only requires `===` checks — no deep equality library needed.
 */
const diffCollection = <T>(
  prev: { [uuid: string]: T } | undefined,
  next: { [uuid: string]: T } | undefined
): { upserted: T[]; deletedUuids: string[] } => {
  const upserted: T[] = [];
  const deletedUuids: string[] = [];

  if (prev === next) return { upserted, deletedUuids };

  if (next) {
    for (const uuid in next) {
      if (!prev || prev[uuid] !== next[uuid]) upserted.push(next[uuid]);
    }
  }
  if (prev) {
    for (const uuid in prev) {
      if (!next || !(uuid in next)) deletedUuids.push(uuid);
    }
  }
  return { upserted, deletedUuids };
};

/**
 * Computes a full diff of the mission data maestro cares about against prevSnapshot.
 * If prevSnapshot is undefined, everything in mission is treated as upsert/changed
 *
 * Reasoning:
 * We compare full snapshots of mission data maestro cares about to determine what
 * changed since the last emit. This is preferred over the old patch-based approach
 * because the throttled change listener may drop intermediate patches, but snapshots
 * always reflect the full delta between consecutive throttled invocations.
 */
const computeMaestroDiff = (
  mission: Mission,
  prevSnapshot: MissionDataMaestroCaresAbout | undefined
): MaestroDiff => {
  const evas = diffCollection<Eva>(prevSnapshot?.evas, mission.evas);
  const stations = diffCollection<Station>(prevSnapshot?.stations, mission.stations);
  const traverses = diffCollection<Traverse>(prevSnapshot?.traverses, mission.traverses);
  const actions = diffCollection<Action>(prevSnapshot?.actions, mission.actions);
  const rexes = diffCollection<Rex>(prevSnapshot?.rexes, mission.rexes);

  const changedMissionFields: MaestroRelevantMissionField[] = [];
  for (const field of MAESTRO_RELEVANT_MISSION_FIELDS) {
    if (!prevSnapshot || prevSnapshot.missionFields[field] !== mission[field]) {
      changedMissionFields.push(field);
    }
  }

  const hasAnyChange =
    changedMissionFields.length > 0 ||
    evas.upserted.length > 0 ||
    evas.deletedUuids.length > 0 ||
    stations.upserted.length > 0 ||
    stations.deletedUuids.length > 0 ||
    traverses.upserted.length > 0 ||
    traverses.deletedUuids.length > 0 ||
    actions.upserted.length > 0 ||
    actions.deletedUuids.length > 0 ||
    rexes.upserted.length > 0 ||
    rexes.deletedUuids.length > 0;

  return { evas, stations, traverses, actions, rexes, changedMissionFields, hasAnyChange };
};

/**
 * Determines whether a diff contains anything that the currently
 * subscribed EVAs care about. Returns true if Maestro should be notified.
 * Any change to a Maestro-relevant mission field is always relevant.
 */
export const isDiffRelevantToSubscribedEvas = (
  missionId: number,
  mission: Mission,
  diff: MaestroDiff
): boolean => {
  // Mission-level fields are always relevant
  if (diff.changedMissionFields.length > 0) return true;

  const subscribedEvaUuids = globalValues.maestro.evaSubscriptions.get(missionId);
  if (!subscribedEvaUuids || subscribedEvaUuids.length === 0) return false;

  const subscribedEvaUuidSet = new Set(subscribedEvaUuids); // convert to Set

  // EVA upserts/deletes: relevant if any touched EVA is subscribed
  if (diff.evas.upserted.some((e) => subscribedEvaUuidSet.has(e.uuid))) return true;
  if (diff.evas.deletedUuids.some((uuid) => subscribedEvaUuidSet.has(uuid))) return true;

  // Build the set of sequence UUIDs (stations + traverses) for subscribed EVAs
  const subscribedEvas = Object.values(mission.evas).filter((eva) =>
    subscribedEvaUuidSet.has(eva.uuid)
  );
  const subscribedSequenceUuids = new Set<string>();
  for (const eva of subscribedEvas) {
    for (const seqItem of eva.sequence) {
      subscribedSequenceUuids.add(seqItem.uuid);
    }
  }

  // Stations / traverses: relevant if their uuid is in a subscribed EVA's sequence
  if (diff.stations.upserted.some((s) => subscribedSequenceUuids.has(s.uuid))) return true;
  if (diff.stations.deletedUuids.some((uuid) => subscribedSequenceUuids.has(uuid))) return true;
  if (diff.traverses.upserted.some((t) => subscribedSequenceUuids.has(t.uuid))) return true;
  if (diff.traverses.deletedUuids.some((uuid) => subscribedSequenceUuids.has(uuid))) return true;

  // Actions: relevant if parent station or traverse is in a subscribed EVA's sequence.
  // Don't handle deleted actions because a station or traverse will always be updated at the same time,
  // also deleted actions don't have parent uuid info so we can't check if it's relevant anyway
  if (
    diff.actions.upserted.some(
      (a) =>
        (a.stationUuid && subscribedSequenceUuids.has(a.stationUuid)) ||
        (a.traverseUuid && subscribedSequenceUuids.has(a.traverseUuid))
    )
  ) {
    return true;
  }

  // Rexes: relevant if rex.evaUuid is a subscribed EVA.
  if (diff.rexes.upserted.some((rex) => subscribedEvaUuidSet.has(rex.evaUuid))) return true;
  // Deleted rexes don't have evaUuid, so over-send (return true) when any rex is deleted
  if (diff.rexes.deletedUuids.length > 0) return true;

  return false;
};

/**
 * Emits the IAegisEntity to the maestro namespace for a given mission ID.
 */
const emitToMaestroNamespace = async (missionId: number): Promise<void> => {
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
};

/**
 * Removes the given EVA uuids from global eva subscriptions
 */
export const removeEvaFromSubscriptions = (missionId: number, deletedEvaUuids: string[]): void => {
  if (deletedEvaUuids.length === 0) return;
  const subscriptions = globalValues.maestro.evaSubscriptions.get(missionId);
  if (!subscriptions || subscriptions.length === 0) return;

  const updatedSubscriptions = subscriptions.filter((uuid) => !deletedEvaUuids.includes(uuid));

  if (updatedSubscriptions.length === subscriptions.length) return; // nothing changed
  if (updatedSubscriptions.length === 0) {
    globalValues.maestro.evaSubscriptions.delete(missionId);
  } else {
    globalValues.maestro.evaSubscriptions.set(missionId, updatedSubscriptions);
  }
};

/**
 * Adds a new automerge doc listener for a mission and emits Maestro updates whenever
 * the Maestro-relevant slice of the document changes.
 * Called when a Maestro visitor joins a mission.
 */
export const addMaestroDocListenerForMission = async (missionId: number): Promise<void> => {
  if (globalValues.maestro.docListeners.has(missionId)) return; // Already listening, exit

  // Set a placeholder immediately (before any awaits) to prevent two concurrent
  // calls from attaching duplicate listeners because this one was still processing
  globalValues.maestro.docListeners.set(missionId, () => {});

  try {
    // Get automerge doc handle
    const automergeListing = (await getAutomergeDocListing([missionId]))[0];
    const missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      automergeListing.automergeUrl as DocumentId
    );

    // Save the reference to the handle so isRelevantToSubscribedEvas / buildAegisEntityForMaestro
    // can access the document faster without having to find it.
    globalValues.maestro.docHandles.set(missionId, missionDocHandle);

    // Initialize first snapshot with the current doc state.
    const initialDoc = missionDocHandle.doc();
    if (initialDoc) {
      maestroDataSnapshots.set(missionId, buildMissionDataMaestroCaresAbout(initialDoc));
    }

    const throttledListener = throttle(
      () => {
        try {
          const mission = missionDocHandle.doc();
          if (!mission) return;

          // Diff the mission-data-maestro-cares-about against the stored snapshot.
          const prevSnapshot = maestroDataSnapshots.get(missionId);
          const diff = computeMaestroDiff(mission, prevSnapshot);

          // Always update the snapshot, even if nothing relevant changed, so a no-op
          // change doesn't cause the next change to look like a larger delta.
          maestroDataSnapshots.set(missionId, buildMissionDataMaestroCaresAbout(mission));

          if (!diff.hasAnyChange) return;

          // Drop subscriptions to deleted EVAs
          if (diff.evas.deletedUuids.length > 0) {
            removeEvaFromSubscriptions(missionId, diff.evas.deletedUuids);
          }

          // Emit to the /maestro namespace if the diff is relevant to subscribed EVAs.
          const maestroNamespace = globalValues.maestro.socketio;
          if (maestroNamespace) {
            const roomName = getMaestroSocketRoomName(missionId);
            const roomSize = maestroNamespace.adapter.rooms.get(roomName)?.size ?? 0;
            if (roomSize > 0 && isDiffRelevantToSubscribedEvas(missionId, mission, diff)) {
              emitToMaestroNamespace(missionId).catch((error) => {
                serverLogger.error(
                  {
                    logId: "socket-maestro",
                    logValue: `addMaestroDocListenerForMission - Error in emitToMaestroNamespace for mission ${missionId}`,
                    missionId,
                  },
                  error instanceof Error ? error : new Error(String(error))
                );
              });
            }
          }

          // Deprecated: emit to the legacy "maestro" room.
          emitMaestroStoreUpsertFromDiff(missionId, diff);
        } catch (error) {
          serverLogger.error(
            {
              logId: "socket-maestro",
              logValue: `addMaestroDocListenerForMission - Error in throttled listener for mission ${missionId}`,
              missionId,
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }
      },
      500,
      { leading: true, trailing: true }
    );

    missionDocHandle.on("change", throttledListener);
    globalValues.maestro.docListeners.set(missionId, () => {
      missionDocHandle.off("change", throttledListener);
    });

    serverLogger.debug({
      logId: "socket-maestro",
      logValue: `addMaestroDocListenerForMission - Added maestro automerge doc listener for mission ${missionId}`,
    });
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-maestro",
        logValue: `addMaestroDocListenerForMission - Error adding maestro doc listener for mission ${missionId}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

/**
 * Atomically applies station name updates from a Maestro MDAU payload to the
 * Automerge mission document.
 *
 * Each key of `aegisStations` is the station's `refUuid`.
 *
 * @param missionId    - The numeric mission ID
 * @param aegisStations - The `aegisStations` map from the MDAU payload
 */
export const applyMdauStationsToDoc = async (
  missionId: number,
  aegisStations: MaestroDataAegisUses["aegisStations"]
): Promise<void> => {
  if (!aegisStations || Object.keys(aegisStations).length === 0) return;

  // Use the already-cached doc handle
  const docHandle = globalValues.maestro.docHandles.get(missionId);
  if (!docHandle) {
    serverLogger.warning({
      logId: "socket-maestro",
      logValue: `applyMdauStationsToDoc - no doc handle available for mission ${missionId}`,
    });
    return;
  }

  docHandle.change((m) => {
    for (const [refUuid, stationData] of Object.entries(aegisStations)) {
      const rexUuid = stationData.rexUuid ?? null;
      const stationUuid = getSequenceUuidByRefUuidAndRexUuid(m, {
        refUuid,
        rexUuid,
      });
      if (!stationUuid) {
        serverLogger.warning({
          logId: "socket-maestro",
          logValue: `applyMdauStationsToDoc - could not resolve station uuid for refUuid ${refUuid} rexUuid ${rexUuid}`,
        });
        continue;
      }
      //todo need to update traverses
      //todo we will need to stop the trigger of sending dataAll back because automerge change triggered a listener
      const station = m.stations[stationUuid];
      if (station) {
        station.name = stationData.name;
        station.updatedAt = Date.now();
      }
    }
  });
};

/**
 * Cleanup all things associated with maestro for this mission
 * This is only called if the room is empty
 * @param missionId
 */
export const cleanupMaestro = (missionId: number): void => {
  // Remove the docHandle change listener and delete the reference from global
  const removeListenerFn = globalValues.maestro.docListeners.get(missionId);
  if (!removeListenerFn) {
    serverLogger.warning({
      logId: "socket-maestro",
      logValue: `cleanupMaestro - No listener function found to remove for mission ${missionId}`,
    });
  } else {
    removeListenerFn();
    globalValues.maestro.docListeners.delete(missionId);
  }

  // Remove snapshot
  maestroDataSnapshots.delete(missionId);

  // Remove global doc handle reference
  const docHandleRemoved = globalValues.maestro.docHandles.delete(missionId);
  if (!docHandleRemoved) {
    serverLogger.warning({
      logId: "socket-maestro",
      logValue: `cleanupMaestro - No docHandle found to remove for mission ${missionId}`,
    });
  }

  // All cleanup done
  serverLogger.debug({
    logId: "socket-maestro",
    logValue: `cleanupMaestro - Cleaned up listener, docHandle, and snapshot for mission ${missionId}`,
  });
};
