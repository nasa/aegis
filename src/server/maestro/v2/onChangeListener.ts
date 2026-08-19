import { globalValues } from "server/express/global";
import type { DocHandle } from "@automerge/automerge-repo";
import { serverLogger } from "utils/logging/serverLogger";
import { getMaestroSocketRoomName } from "./sockets-maestro";
import { buildAegisSliceForMaestro } from "server/maestro/v2/buildAegisSlice";
import type { AegisSlice } from "./types/aegisSlice";
import { removeEvaFromSubscriptions } from "./sockets-maestro-emitters";

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
 * Use this to compare and find diffs.
 */
const maestroDataSnapshots = new Map<number, MissionDataMaestroCaresAbout>();

/**
 * Sets the stored snapshot for a mission to the mission.
 */
export const setMaestroSnapshot = (missionId: number, mission: Mission): void => {
  const snapshot: MissionDataMaestroCaresAbout = {
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
      actionDefinitions: mission.actionDefinitions,
      actionDefinitionLabels: mission.actionDefinitionLabels,
      actionDefinitionConjunctions: mission.actionDefinitionConjunctions,
    },
  };
  maestroDataSnapshots.set(missionId, snapshot);
};

/**
 * Clears the stored snapshot for a mission.
 */
export const clearMaestroSnapshot = (missionId: number): void => {
  maestroDataSnapshots.delete(missionId);
};

/**
 * Top-level Mission fields that Maestro cares about.
 * Any change to these is always relevant to Maestro regardless of EVA subscriptions.
 *
 * `satisfies` ensures the returned object has exactly the keys of AegisSlice.AegisMission for safety.
 * It only works if there are no optional fields in AegisSlice.AegisMission type.
 */
const MAESTRO_RELEVANT_MISSION_FIELDS = [
  "name",
  "id",
  "description",
  "actionSystemVersion",
  "createdAt",
  "updatedAt",
  // Object-valued fields. Automerge keeps unchanged sub-objects referentially
  // stable, so the `!==` comparison in computeMaestroDiff detects nested edits
  // (e.g. renaming a single verb) without a deep-equality check.
  "actionDefinitions",
  "actionDefinitionLabels",
  "actionDefinitionConjunctions",
] as const satisfies readonly (keyof AegisSlice.AegisMission)[];
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

  const subscribedEvaUuids = globalValues.maestroV2.evaSubscriptions.get(missionId);
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
 * Main function that is called whenever there is a change to the automerge document
 * Determines if the properties that changed is something maestro cares about
 * Determines if the changes are relevant to any subscribed EVAs
 * Then emits to the socket
 * @param missionId
 * @param missionDocHandle
 * @returns
 */
export function onChangeListener(missionId: number, missionDocHandle: DocHandle<Mission>): void {
  try {
    const mission = missionDocHandle.doc();
    if (!mission) return;

    // Diff the mission-data-maestro-cares-about against the stored snapshot.
    const prevSnapshot = maestroDataSnapshots.get(missionId);
    const diff = computeMaestroDiff(mission, prevSnapshot);

    // Always update the snapshot, even if nothing relevant changed, so a no-op
    // change doesn't cause the next change to look like a larger delta.
    setMaestroSnapshot(missionId, mission);

    if (!diff.hasAnyChange) return;

    // Drop subscriptions to deleted EVAs
    if (diff.evas.deletedUuids.length > 0) {
      removeEvaFromSubscriptions(missionId, diff.evas.deletedUuids);
    }

    // Emit to the /maestro namespace if the diff is relevant to subscribed EVAs.
    const maestroNamespace = globalValues.maestroV2.socketio;
    if (maestroNamespace) {
      const roomName = getMaestroSocketRoomName(missionId);
      const roomSize = maestroNamespace.adapter.rooms.get(roomName)?.size ?? 0;
      if (roomSize > 0 && isDiffRelevantToSubscribedEvas(missionId, mission, diff)) {
        emitDataAllToMaestro(missionId).catch((error) => {
          serverLogger.error(
            {
              logId: "socket-maestro-v2",
              logValue: `onChangeListener - Error in emitToMaestroNamespace for mission ${missionId}`,
              missionId,
            },
            error instanceof Error ? error : new Error(String(error))
          );
        });
      }
    }
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-maestro-v2",
        logValue: `onChangeListener - Error in throttled listener for mission ${missionId}`,
        missionId,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Emits the Maestro AEGISSlice to the maestro namespace for a given mission ID.
 * Formats the data to match the AEGISSlice type that Maestro expects.
 */
const emitDataAllToMaestro = async (missionId: number): Promise<void> => {
  try {
    const maestroNamespace = globalValues.maestroV2.socketio;
    if (!maestroNamespace) return;
    const roomName = getMaestroSocketRoomName(missionId);
    // Check the room size again. It's already checked before this
    // function is called but check again just in-case the room
    // emptied while we were checking relevance
    const roomSize = maestroNamespace.adapter.rooms.get(roomName)?.size ?? 0;
    if (roomSize === 0) return;

    const entity = await buildAegisSliceForMaestro(missionId);
    maestroNamespace.to(roomName).emit("dataAll", entity);
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-maestro-v2",
        logValue: `emitToMaestroNamespace - Error emitting to maestro namespace for mission ${missionId}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
};
