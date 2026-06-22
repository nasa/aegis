import { globalValues } from "server/express/global";
import { getAll } from "server/express/routes/all";
import {
  makeExportActions,
  makeExportEvas,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "../../utils/export";
import uniq from "lodash/uniq";
import { getAutomergeDocListing } from "./routes/docListing";
import type { DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getMaestroSocketRoomName } from "./sockets-maestro";
import { buildAegisEntityForMaestro } from "utils/maestro";

/**
 * @deprecated
 */
type AllDataForMaestro = {
  mission: Mission;
  pois: POI[];
  stations: Station[];
  actions: Action[];
  traverses: Traverse[];
  evas: Eva[];
  rexes: Rex[];
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
};

/**
 * @deprecated
 */
interface StoreUpsertLegacy {
  socketId: string;
  missionId: number;
  type: SocketStoreTypeLegacy;
  data: StoreDataLegacy[];
  lastEditEvent: EditEvent;
}

/**
 * @deprecated
 */
type SocketStoreTypeLegacy =
  | "preset"
  | "poi"
  | "station"
  | "eva"
  | "action"
  | "traverse"
  | "rex"
  | "stmRule"
  | "folder";

/**
 * @deprecated
 */
type StoreDataLegacy = POI | Preset | Station | Eva | Action | Traverse | Rex | STMRule | Folder;

/**
 * @deprecated Helper function only used in the deprecated emitMaestroStoreUpsert
 */
const getAllAsExportData = async (missionId: number): Promise<AllDataForMaestro> => {
  const data = await getAll(missionId);
  return {
    ...data,
    pois: Object.values(data.mission?.pois ?? {}),
    stations: Object.values(data.mission?.stations ?? {}),
    actions: Object.values(data.mission?.actions ?? {}),
    traverses: Object.values(data.mission?.traverses ?? {}),
    evas: Object.values(data.mission?.evas ?? {}),
    rexes: Object.values(data.mission?.rexes ?? {}),
  };
};

/**
 * @deprecated This should be removed and the new maestro socket namespace should be used instead
 */
const emitMaestroStoreUpsert = async (storeUpsert: StoreUpsertLegacy): Promise<void> => {
  const io = globalValues.socketio;
  if (!io) return; // no socket.io initialized
  const maestroPayload: StoreUpsertForMaestro = {
    ...storeUpsert,
    type: storeUpsert.type as StoreTypeForMaestro,
    data: null,
  };
  if (storeUpsert.type === "action") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
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
      mission: allData.mission,
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
        mission: allData.mission,
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
        mission: allData.mission,
        exportActions: false,
      });
      io.to("maestro").emit("storeUpsertForMaestro", {
        ...maestroPayload, // get socket, mission, and lastEditEvent from the original payload
        type: "traverse",
        data: exportedActionTraverses,
      });
    }
  } else if (storeUpsert.type === "station") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
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
      mission: allData.mission,
      exportActions: false,
    });
    maestroPayload.data = exportedStationData;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "traverse") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
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
      mission: allData.mission,
      exportActions: false,
    });
    maestroPayload.data = exportedTraverses;
    io.to("maestro").emit("storeUpsertForMaestro", maestroPayload);
  } else if (storeUpsert.type === "eva") {
    const allData = await getAllAsExportData(storeUpsert.missionId);
    const evaData = storeUpsert.data as Eva[];
    const evasForMaestro = makeExportEvas({
      evas: evaData,
      mission: allData.mission,
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

// ─── Maestro namespace emit helpers ──────────────────────────────────────────

/**
 * Top-level Mission keys for entity collections (stations, evas, etc.) that Maestro cares about.
 */
type MaestroRelevantCollectionKey = Extract<
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
] as const satisfies readonly (keyof Maestro.AegisMission)[];

type MaestroRelevantMissionField = (typeof MAESTRO_RELEVANT_MISSION_FIELDS)[number];

/** Diff result — what was upserted and what was deleted. */
type MaestroDiff = {
  evas: { upserted: Eva[]; deletedUuids: string[] };
  stations: { upserted: Station[]; deletedUuids: string[] };
  traverses: { upserted: Traverse[]; deletedUuids: string[] };
  actions: { upserted: Action[]; deletedUuids: string[] };
  rexes: { upserted: Rex[]; deletedUuids: string[] };
  changedMissionFields: MaestroRelevantMissionField[]; // Names of Maestro-relevant mission fields that changed value.
  hasAnyChange: boolean; // True if anything at all changed since the previous snapshot.
};

/**
 * The slice of a Mission that Maestro cares about. Only these top-level keys are
 * tracked between change events; anything else can change freely without notifying Maestro.
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
 * Stored per-mission snapshot of mission data maestro cares about
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
 * Diffs two collections by reference. Returns the entities that were added or
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
 * Emits the AEGIS data Maestro cares about to the maestro namespace for a given mission ID.
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
 * @deprecated type used to support the previous data structure sent to Maestro
 * Map from a Maestro-relevant collection key (plural, e.g. "stations") to the
 * StoreUpsert type string (singular, e.g. "station"). Kept explicit rather than
 * derived (e.g. via `replace(/s$/, "")`) so renames stay refactor-safe.
 */
const KEY_TO_LEGACY_STORE_TYPE = {
  evas: "eva",
  stations: "station",
  traverses: "traverse",
  actions: "action",
  rexes: "rex",
} as const satisfies Record<MaestroRelevantCollectionKey, StoreTypeForMaestro>;

/**
 * @deprecated — mirrors the old emitStoreUpsert calls that used to be in API endpoints
 * Delete events are not emitted — this was never supported.
 */
const emitMaestroStoreUpsertFromDiff = (missionId: number, diff: MaestroDiff): void => {
  const io = globalValues.socketio;
  if (!io) return;
  const maestroRoomSize = io.sockets.adapter.rooms.get("maestro")?.size ?? 0;
  if (maestroRoomSize === 0) return; // no legacy Maestro clients connected

  // Shared stub fields for the StoreUpsert.
  const storeUpsertBase = {
    socketId: "automerge",
    missionId,
    lastEditEvent: null as unknown as EditEvent,
  };

  // Per-collection upserts
  const collectionUpserts: { key: MaestroRelevantCollectionKey; data: StoreDataLegacy[] }[] = [
    { key: "evas", data: diff.evas.upserted },
    { key: "stations", data: diff.stations.upserted },
    { key: "traverses", data: diff.traverses.upserted },
    { key: "actions", data: diff.actions.upserted },
    { key: "rexes", data: diff.rexes.upserted },
  ];

  for (const { key, data } of collectionUpserts) {
    if (data.length === 0) continue;
    const type = KEY_TO_LEGACY_STORE_TYPE[key];
    const storeUpsert: StoreUpsertLegacy = { ...storeUpsertBase, type, data };
    emitMaestroStoreUpsert(storeUpsert).catch((error) => {
      serverLogger.error(
        {
          logId: "socket-maestro",
          logValue: `emitMaestroStoreUpsertFromDiff - Error emitting ${type} for mission ${missionId}`,
          missionId,
        },
        error instanceof Error ? error : new Error(String(error))
      );
    });
  }
};

/**
 * Removes the given EVA uuids from global eva subscriptions
 */
const removeDeletedEvasFromSubscriptions = (missionId: number, deletedEvaUuids: string[]): void => {
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
            removeDeletedEvasFromSubscriptions(missionId, diff.evas.deletedUuids);
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

// This is only called if the room is empty
export const cleanupSocketRoom = (missionId: number): void => {
  // Remove the docHandle change listener and delete the reference from global
  const removeListenerFn = globalValues.maestro.docListeners.get(missionId);
  if (!removeListenerFn) {
    serverLogger.warning({
      logId: "socket-maestro",
      logValue: `cleanupSocketRoom - No listener function found to remove for mission ${missionId}`,
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
      logValue: `cleanupSocketRoom - No docHandle found to remove for mission ${missionId}`,
    });
  }

  // All cleanup done
  serverLogger.debug({
    logId: "socket-maestro",
    logValue: `cleanupSocketRoom - Cleaned up listener, docHandle, and snapshot for mission ${missionId}`,
  });
};
