import { globalValues } from "server/express/global";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { getDustSocketRoomName, hasDustVisitorsForMission } from "./sockets-dust";
import type { DustPosEntriesUpdate, DustReadablePosEntry, DustRexEva } from "./types/socketioDust";
import { getAutomergeDocListing } from "server/express/routes/docListing";

type DustMissionSnapshot = {
  [rexUuid: string]: {
    posEntriesUpdate: DustPosEntriesUpdate;
    /** Canonical serialization of `payload`, used for cheap change detection. */
    posEntriesUpdateJson: string;
  };
};

const dustSnapshots = new Map<number, DustMissionSnapshot>();

/**
 * Resolves a rex's posEntries into a DUST-readable form — posType/posSource
 * uuids are converted to their plain-text names. Always the full current list,
 * not just the entry that changed.
 */
const buildReadablePosEntries = (rex: Rex): DustReadablePosEntry[] => {
  const posTypesByUuid = new Map((rex.posTypes ?? []).map((posType) => [posType.uuid, posType]));
  const posSourcesByUuid = new Map(
    (rex.posSources ?? []).map((posSource) => [posSource.uuid, posSource])
  );
  return (rex.posEntries ?? []).map((entry) => {
    return {
      uuid: entry.uuid,
      latlng: entry.location,
      petSeconds: entry.petSeconds,
      posTypes: entry.posTypeUuids.map((uuid) => posTypesByUuid.get(uuid)?.name ?? uuid),
      posSource: posSourcesByUuid.get(entry.posSourceUuid)?.name ?? entry.posSourceUuid,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  });
};

/**
 * Builds the complete outbound payload for a single rex.
 */
export const buildDustPosEntriesUpdate = (
  missionId: number,
  mission: Mission,
  rex: Rex
): DustPosEntriesUpdate => {
  // The rex's own EVA copy has no name (REX EVAs are unnamed) — resolve the
  // as-planned EVA sharing the same refUuid to get a human-readable name.
  const eva = mission.evas?.[rex.evaUuid];
  const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, eva?.refUuid);

  return {
    missionId,
    missionName: mission.name,
    rexUuid: rex.uuid,
    rexName: rex.name,
    evaUuid: eva?.uuid ?? rex.evaUuid,
    evaName: asPlannedEva?.name ?? "",
    posEntries: buildReadablePosEntries(rex),
  };
};

const buildDustMissionSnapshot = (missionId: number, mission: Mission): DustMissionSnapshot => {
  const snapshot: DustMissionSnapshot = {};
  for (const rexUuid in mission.rexes) {
    const payload = buildDustPosEntriesUpdate(missionId, mission, mission.rexes[rexUuid]);
    snapshot[rexUuid] = {
      posEntriesUpdate: payload,
      posEntriesUpdateJson: JSON.stringify(payload),
    };
  }
  return snapshot;
};

/**
 * Main function that is called whenever there is a change to the automerge document.
 * Diffs the json outbound payload of every running rex against the last
 * snapshot and emits the ones that changed to the DUST room for that mission.
 *
 * Bails out immediately if no DUST servers are connected at all (skips every other
 * check), and skips emitting for a mission whose DUST room currently has no one in it.
 */
export function onDustChangeListener(
  missionId: number,
  missionDocHandle: DocHandle<Mission>
): void {
  try {
    const dustNamespace = globalValues.dustV1.socketio;
    // No DUST servers connected to any mission — bypass all other checks.
    if (!dustNamespace || dustNamespace.sockets.size === 0) return;

    const roomName = getDustSocketRoomName(missionId);
    const roomSize = dustNamespace.adapter.rooms.get(roomName)?.size ?? 0;
    // No DUST visitors for this mission.
    if (roomSize === 0) return;

    const mission = missionDocHandle.doc();
    if (!mission) return;

    const prevSnapshot = dustSnapshots.get(missionId);
    const nextSnapshot = buildDustMissionSnapshot(missionId, mission);

    const payloads: DustPosEntriesUpdate[] = [];

    for (const rexUuid in nextSnapshot) {
      // Crew positions can only be added while a rex is running.
      if (!mission.rexes[rexUuid].isRunning) continue;

      const next = nextSnapshot[rexUuid];
      const prev = prevSnapshot?.[rexUuid];
      if (prev && prev.posEntriesUpdateJson === next.posEntriesUpdateJson) continue; // unchanged, skip

      payloads.push(next.posEntriesUpdate);
    }

    // Always store the new snapshot, even if nothing relevant changed, so a no-op
    // change doesn't cause the next change to look like a larger delta.
    dustSnapshots.set(missionId, nextSnapshot);

    for (const payload of payloads) {
      dustNamespace.to(roomName).emit("posEntriesUpdate", payload);
    }
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-dust-v1:onDustChangeListener:unhandledErrorInThrottledDocChangeListener",
        logValue: `onDustChangeListener - Error in throttled listener for mission ${missionId}`,
        missionId,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Builds the full current state of every rex on a mission — running or not
 */
export const getEverythingForDust = async (missionId: number): Promise<DustPosEntriesUpdate[]> => {
  const missionDocHandle = globalValues.dustV1.docHandles.get(missionId);
  const mission = missionDocHandle.doc();
  if (!mission) throw new Error(`Automerge document for mission ${missionId} is unavailable`);

  return Object.values(mission.rexes ?? {}).map((rex) =>
    buildDustPosEntriesUpdate(missionId, mission, rex)
  );
};

/**
 * Resolves a mission document without requiring a prior `missionJoin`. Reuses the
 * handle cached by `missionJoin` when there is one.
 */
const findMissionForDust = async (missionId: number): Promise<Mission> => {
  let missionDocHandle = globalValues.dustV1.docHandles.get(missionId);
  if (!missionDocHandle) {
    const listing = (await getAutomergeDocListing([missionId]))[0];
    if (!listing) throw new Error(`Mission ${missionId} not found`);
    missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      listing.automergeUrl as DocumentId
    );
    await missionDocHandle.whenReady();
  }
  const mission = missionDocHandle.doc();
  if (!mission) throw new Error(`Automerge document for mission ${missionId} is unavailable`);
  return mission;
};

/**
 * Lists every rex on a mission with the EVA it belongs to.
 */
export const getRexEvasForDust = async (missionId: number): Promise<DustRexEva[]> => {
  const mission = await findMissionForDust(missionId);
  return Object.values(mission.rexes ?? {}).map((rex) => {
    const { evaUuid, evaName, rexName, rexUuid } = buildDustPosEntriesUpdate(
      missionId,
      mission,
      rex
    );
    return { evaName, evaUuid, rexName, rexUuid };
  });
};

/**
 * Builds the current posEntries payload for a single rex. Returns null when the
 * mission has no rex with that uuid.
 */
export const getPosEntriesForDust = async (
  missionId: number,
  rexUuid: string
): Promise<DustPosEntriesUpdate | null> => {
  const mission = await findMissionForDust(missionId);
  const rex = mission.rexes?.[rexUuid];
  return rex ? buildDustPosEntriesUpdate(missionId, mission, rex) : null;
};

/**
 * Drops every provisional piece of state created by a setup attempt.
 */
const discardDustSetupState = (missionId: number): void => {
  globalValues.dustV1.docListeners.delete(missionId);
  globalValues.dustV1.docHandles.delete(missionId);
  dustSnapshots.delete(missionId);
};

/**
 * Adds a new automerge doc listener for a mission and emits DUST posEntries updates
 * whenever a running rex changes. Called when a DUST visitor joins a mission.
 *
 * Throws if the mission's document cannot be resolved, after rolling back the
 * provisional state, so the caller can fail the join rather than leaving the client
 * joined to a mission that will never receive updates.
 */
export const addDustDocListenerForMission = async (missionId: number): Promise<void> => {
  if (globalValues.dustV1.docListeners.has(missionId)) return; // Already listening, exit

  // Set a placeholder immediately (before any awaits) to prevent two concurrent
  // calls from attaching duplicate listeners because this one was still processing
  globalValues.dustV1.docListeners.set(missionId, () => {});

  try {
    // Get automerge doc handle
    const automergeListing = (await getAutomergeDocListing([missionId]))[0];
    const missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      automergeListing.automergeUrl as DocumentId
    );

    // The last visitor may have disconnected while the lookups above were awaiting.
    // Installing now would orphan the listener.
    if (!hasDustVisitorsForMission(missionId)) {
      discardDustSetupState(missionId);
      serverLogger.debug({
        logId:
          "socket-dust-v1:addDustDocListenerForMission:abandonedListenerSetupBecauseNoDustVisitorsRemain",
        logValue: `addDustDocListenerForMission - Abandoned dust doc listener setup for mission ${missionId}, no visitors remain`,
      });
      return;
    }

    // Save the reference to the handle so we can access the document faster without having to find it.
    globalValues.dustV1.docHandles.set(missionId, missionDocHandle);

    // Initialize first snapshot with the current doc state.
    const initialDoc = missionDocHandle.doc();
    if (initialDoc) {
      dustSnapshots.set(missionId, buildDustMissionSnapshot(missionId, initialDoc));
    }

    const throttledListener = throttle(
      () => {
        onDustChangeListener(missionId, missionDocHandle);
      },
      500,
      {
        leading: true,
        trailing: true,
      }
    );

    missionDocHandle.on("change", throttledListener);
    globalValues.dustV1.docListeners.set(missionId, () => {
      // Drop any queued trailing invocation so it can't run after cleanup.
      throttledListener.cancel();
      missionDocHandle.off("change", throttledListener);
    });

    serverLogger.debug({
      logId: "socket-dust-v1:addDustDocListenerForMission:addedDustAutomergeDocChangeListener",
      logValue: `addDustDocListenerForMission - Added dust automerge doc listener for mission ${missionId}`,
    });
  } catch (error) {
    discardDustSetupState(missionId);
    serverLogger.error(
      {
        logId:
          "socket-dust-v1:addDustDocListenerForMission:failedToAddDustAutomergeDocChangeListener",
        logValue: `addDustDocListenerForMission - Error adding dust doc listener for mission ${missionId}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
    throw error instanceof Error ? error : new Error(String(error));
  }
};

/**
 * Cleanup all things associated with dust for this mission.
 * This is only called if the dust room for the mission is empty.
 */
export const cleanupDust = (missionId: number): void => {
  // Remove the docHandle change listener and delete the reference from global
  const removeListenerFn = globalValues.dustV1.docListeners.get(missionId);
  if (!removeListenerFn) {
    serverLogger.warning({
      logId: "socket-dust-v1:cleanupDust:noDocChangeListenerFoundToRemove",
      logValue: `cleanupDust - No listener function found to remove for mission ${missionId}`,
    });
  } else {
    removeListenerFn();
    globalValues.dustV1.docListeners.delete(missionId);
  }

  // Remove snapshot
  dustSnapshots.delete(missionId);

  // Remove global doc handle reference
  const docHandleRemoved = globalValues.dustV1.docHandles.delete(missionId);
  if (!docHandleRemoved) {
    serverLogger.warning({
      logId: "socket-dust-v1:cleanupDust:noDocHandleFoundToRemove",
      logValue: `cleanupDust - No docHandle found to remove for mission ${missionId}`,
    });
  }

  // All cleanup done
  serverLogger.debug({
    logId: "socket-dust-v1:cleanupDust:cleanedUpListenerDocHandleAndSnapshot",
    logValue: `cleanupDust - Cleaned up listener, docHandle, and snapshot for mission ${missionId}`,
  });
};
