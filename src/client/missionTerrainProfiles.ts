import type { DocHandle } from "@automerge/automerge-repo";
import type { StoreType } from "store";
import { getTerrainProfile, normalizeTerrainProfile } from "http-client/terrainProfile";
import {
  reconcileTerrainProfiles,
  terrainFingerprint,
  terrainProfileReceived,
  removeMissionTerrain,
} from "store/terrainProfiles";

const MAX_CONCURRENT_LOADS = 4;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

class TerrainProfileLoadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

/** Client errors other than timeouts, conflicts, and throttling will fail the same way again. */
const isRetryableStatus = (httpStatus: number | undefined): boolean =>
  !httpStatus || httpStatus >= 500 || [408, 409, 429].includes(httpStatus);

// Pages that mount together share one coordinator per store and mission.
const coordinatorsByStore = new WeakMap<object, Map<number, { count: number; stop: () => void }>>();

/** Synchronize derived Redux data with document geometry; never mutate the document. */
export function syncMissionTerrainProfiles(
  handle: DocHandle<Mission>,
  store: Pick<StoreType, "dispatch" | "getState">
): () => void {
  const missionId = handle.doc().id;
  let coordinators = coordinatorsByStore.get(store);
  if (!coordinators) coordinatorsByStore.set(store, (coordinators = new Map()));
  const existing = coordinators.get(missionId);
  if (existing) existing.count++;
  else coordinators.set(missionId, { count: 1, stop: startCoordinator(handle, store) });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const coordinator = coordinators.get(missionId);
    if (!coordinator || --coordinator.count > 0) return;
    coordinators.delete(missionId);
    coordinator.stop();
  };
}

function startCoordinator(
  handle: DocHandle<Mission>,
  store: Pick<StoreType, "dispatch" | "getState">
): () => void {
  const missionId = handle.doc().id;
  let stopped = false;
  let running = 0;
  // Keys are uuid + fingerprint, so a geometry change starts a fresh request and retry count.
  const queued = new Set<string>();
  const attempts = new Map<string, number>();
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const queue: { uuid: string; entry: TerrainProfileEntry }[] = [];
  const currentEntry = (uuid: string) =>
    store.getState().terrainProfiles.missions[missionId]?.profiles[uuid];

  const scheduleRetry = (uuid: string, entry: TerrainProfileEntry, key: string) => {
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
    retryTimers.set(
      key,
      setTimeout(() => {
        retryTimers.delete(key);
        if (stopped || currentEntry(uuid)?.fingerprint !== entry.fingerprint) return;
        queued.add(key);
        queue.push({ uuid, entry });
        pump();
      }, delay)
    );
  };

  const load = async (uuid: string, entry: TerrainProfileEntry, key: string) => {
    let profile: TerrainProfile | null = null;
    let error: TerrainProfileLoadError | null = null;
    try {
      const response = await getTerrainProfile({
        missionId,
        entityKey: uuid,
        path: entry.path,
        pathSegmentDistances: entry.distances,
      });
      if (response.status !== "success")
        throw new TerrainProfileLoadError(
          response.message || "Terrain profile unavailable",
          isRetryableStatus(response.httpStatus)
        );
      profile = normalizeTerrainProfile(response.data, entry.path, entry.distances);
      if (!profile) throw new TerrainProfileLoadError("Invalid terrain profile", false);
    } catch (reason) {
      error =
        reason instanceof TerrainProfileLoadError
          ? reason
          : new TerrainProfileLoadError(
              reason instanceof Error ? reason.message : String(reason),
              true
            );
    }
    running--;
    queued.delete(key);
    if (stopped) return;
    store.dispatch(
      terrainProfileReceived({
        missionId,
        uuid,
        fingerprint: entry.fingerprint,
        profile,
        error: error?.message ?? null,
      })
    );
    if (error?.retryable && currentEntry(uuid)?.fingerprint === entry.fingerprint)
      scheduleRetry(uuid, entry, key);
    else attempts.delete(key);
    pump();
  };

  const pump = () => {
    if (stopped) return;
    while (running < MAX_CONCURRENT_LOADS && queue.length) {
      const { uuid, entry } = queue.shift();
      const key = uuid + entry.fingerprint;
      if (currentEntry(uuid)?.fingerprint !== entry.fingerprint) {
        queued.delete(key);
        attempts.delete(key);
        continue;
      }
      running++;
      load(uuid, entry, key);
    }
  };

  const update = () => {
    const mission = handle.doc();
    const previous = store.getState().terrainProfiles.missions[missionId]?.profiles ?? {};
    const entries: TerrainProfiles = {};
    const add = (uuid: string, path: AEGISPoint[], distances: number[]) => {
      if (
        !mission.demFilePath ||
        !path ||
        path.length < 2 ||
        !distances ||
        distances.length !== path.length - 1
      )
        return;
      const fingerprint = terrainFingerprint(mission, path, distances);
      entries[uuid] =
        previous[uuid]?.fingerprint === fingerprint
          ? previous[uuid]
          : {
              fingerprint,
              path: JSON.parse(JSON.stringify(path)),
              distances: [...distances],
              status: "idle",
              profile: null,
              error: null,
            };
    };
    for (const traverse of Object.values(mission.traverses ?? {}))
      add(traverse.uuid, traverse.path, traverse.pathSegmentDistances);
    for (const station of Object.values(mission.stations ?? {}))
      add(station.uuid, station.walkbackPath, station.walkbackPathSegmentDistances);
    const previews = store.getState().terrainProfiles.missions[missionId]?.previews ?? {};
    store.dispatch(reconcileTerrainProfiles({ missionId, entries }));
    const profiles = store.getState().terrainProfiles.missions[missionId].profiles;
    for (const [uuid, entry] of Object.entries(entries)) {
      // A drag release adopts its preview profile; previews skip the disk cache, so
      // request the committed geometry once to cache it.
      const preview = previews[uuid];
      if (
        previous[uuid]?.fingerprint !== entry.fingerprint &&
        preview?.fingerprint === entry.fingerprint &&
        preview.status === "ready"
      )
        getTerrainProfile({
          missionId,
          entityKey: uuid,
          path: entry.path,
          pathSegmentDistances: entry.distances,
        }).catch(() => {});
    }
    for (const [uuid, entry] of Object.entries(profiles)) {
      // Failed entries are retried only by their backoff timer.
      const key = uuid + entry.fingerprint;
      if (entry.status !== "idle" || queued.has(key)) continue;
      queued.add(key);
      queue.push({ uuid, entry });
    }
    pump();
  };

  handle.on("change", update);
  update();
  return () => {
    stopped = true;
    queue.length = 0;
    retryTimers.forEach((timer) => clearTimeout(timer));
    retryTimers.clear();
    handle.off("change", update);
    store.dispatch(removeMissionTerrain(missionId));
  };
}
