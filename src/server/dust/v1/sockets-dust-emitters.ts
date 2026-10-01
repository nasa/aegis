import { globalValues } from "server/express/global";
import { getAutomergeDocListing } from "../../express/routes/docListing";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import throttle from "lodash/throttle";
import { serverLogger } from "utils/logging/serverLogger";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { getDustSocketRoomName } from "./sockets-dust";
import type { DustPosEntriesUpdate, DustReadablePosEntry } from "./types/socketioDust";

/**
 * Per-mission snapshot of each rex's `posEntries` array reference, used to detect
 * which rexes had an add/edit/delete since the last doc change.
 * Automerge keeps unchanged sub-objects referentially stable, so a reference change
 * on `posEntries` means something in that array changed.
 */
const dustPosEntriesSnapshots = new Map<number, { [rexUuid: string]: PosEntry[] | null }>();

export const setDustSnapshot = (missionId: number, mission: Mission): void => {
  const snapshot: { [rexUuid: string]: PosEntry[] | null } = {};
  for (const rexUuid in mission.rexes) {
    snapshot[rexUuid] = mission.rexes[rexUuid].posEntries;
  }
  dustPosEntriesSnapshots.set(missionId, snapshot);
};

export const clearDustSnapshot = (missionId: number): void => {
  dustPosEntriesSnapshots.delete(missionId);
};

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
 * Main function that is called whenever there is a change to the automerge document.
 * Determines whether a running rex's posEntries changed and, if so, emits the full
 * updated posEntries list to the DUST room for that mission.
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

    const mission = missionDocHandle.doc();
    if (!mission) return;

    const prevSnapshot = dustPosEntriesSnapshots.get(missionId);
    // Always update the snapshot, even if nothing relevant changed, so a no-op
    // change doesn't cause the next change to look like a larger delta.
    setDustSnapshot(missionId, mission);

    const roomName = getDustSocketRoomName(missionId);
    const roomSize = dustNamespace.adapter.rooms.get(roomName)?.size ?? 0;
    if (roomSize === 0) return; // no DUST visitors for this mission

    for (const rexUuid in mission.rexes) {
      const rex = mission.rexes[rexUuid];
      // Crew positions can only be added while a rex is running.
      if (!rex.isRunning) continue;

      const prevPosEntries = prevSnapshot?.[rexUuid];
      if (prevPosEntries === rex.posEntries) continue; // unchanged, skip

      // The rex's own EVA copy has no name (REX EVAs are unnamed) — resolve the
      // as-planned EVA sharing the same refUuid to get a human-readable name.
      const eva = mission.evas?.[rex.evaUuid];
      const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, eva?.refUuid);

      const payload: DustPosEntriesUpdate = {
        missionId,
        missionName: mission.name,
        rexUuid: rex.uuid,
        rexName: rex.name,
        evaUuid: eva?.uuid ?? rex.evaUuid,
        evaName: asPlannedEva?.name ?? "",
        posEntries: buildReadablePosEntries(rex),
      };

      dustNamespace.to(roomName).emit("posEntriesUpdate", payload);
    }
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-dust-v1",
        logValue: `onDustChangeListener - Error in throttled listener for mission ${missionId}`,
        missionId,
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Adds a new automerge doc listener for a mission and emits DUST posEntries updates
 * whenever a running rex's posEntries change. Called when a DUST visitor joins a mission.
 */
export const addDustDocListenerForMission = async (missionId: number): Promise<void> => {
  if (globalValues.dustV1.docListeners.has(missionId)) return; // Already listening, exit

  // Set a placeholder immediately (before any awaits) to prevent two concurrent
  // calls from attaching duplicate listeners because this one was still processing
  globalValues.dustV1.docListeners.set(missionId, () => {});

  try {
    const automergeListing = (await getAutomergeDocListing([missionId]))[0];
    const missionDocHandle = await globalValues.automergeRepo.find<Mission>(
      automergeListing.automergeUrl as DocumentId
    );

    // Save the reference to the handle so we can access the document faster without having to find it.
    globalValues.dustV1.docHandles.set(missionId, missionDocHandle);

    // Initialize first snapshot with the current doc state.
    const initialDoc = missionDocHandle.doc();
    if (initialDoc) {
      setDustSnapshot(missionId, initialDoc);
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
      missionDocHandle.off("change", throttledListener);
    });

    serverLogger.debug({
      logId: "socket-dust-v1",
      logValue: `addDustDocListenerForMission - Added dust automerge doc listener for mission ${missionId}`,
    });
  } catch (error) {
    serverLogger.error(
      {
        logId: "socket-dust-v1",
        logValue: `addDustDocListenerForMission - Error adding dust doc listener for mission ${missionId}`,
      },
      error instanceof Error ? error : new Error(String(error))
    );
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
      logId: "socket-dust-v1",
      logValue: `cleanupDust - No listener function found to remove for mission ${missionId}`,
    });
  } else {
    removeListenerFn();
    globalValues.dustV1.docListeners.delete(missionId);
  }

  // Remove snapshot
  clearDustSnapshot(missionId);

  // Remove global doc handle reference
  const docHandleRemoved = globalValues.dustV1.docHandles.delete(missionId);
  if (!docHandleRemoved) {
    serverLogger.warning({
      logId: "socket-dust-v1",
      logValue: `cleanupDust - No docHandle found to remove for mission ${missionId}`,
    });
  }

  // All cleanup done
  serverLogger.debug({
    logId: "socket-dust-v1",
    logValue: `cleanupDust - Cleaned up listener, docHandle, and snapshot for mission ${missionId}`,
  });
};
