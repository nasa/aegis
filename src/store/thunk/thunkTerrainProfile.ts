import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  getElevationSinglePoint,
  getTerrainProfile,
  getTerrainProfiles,
  normalizeTerrainProfile,
} from "http-client/terrainProfile";
import { insertElevationPending, removeElevationPending } from "store/interface";

import appCreateAsyncThunk from "./thunkUtil";

import type { DocHandle } from "@automerge/automerge-repo";
import type { StoreType } from "store";
import {
  buildTerrainProfiles,
  reconcileTerrainProfiles,
  terrainProfileReceived,
} from "store/terrainProfiles";

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

let stopTerrainProfiles: (() => void) | undefined;
export function stopMissionTerrainProfiles(): void {
  stopTerrainProfiles?.();
  stopTerrainProfiles = undefined;
}

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

async function loadProfile(
  entry: TerrainProfileEntry,
  responsePromise: Promise<TerrainProfileResponse>
): Promise<Required<Pick<TerrainProfileEntry, "profile" | "error" | "retryable" | "status">>> {
  try {
    const response = await responsePromise;
    if (response.status !== "success")
      throw new TerrainProfileLoadError(
        response.message || "Terrain profile unavailable",
        isRetryableStatus(response.httpStatus)
      );
    const profile = normalizeTerrainProfile(response.data, entry.path, entry.distances);
    if (!profile) throw new TerrainProfileLoadError("Invalid terrain profile", false);
    return { profile, error: null, retryable: false, status: "ready" };
  } catch (reason) {
    return {
      profile: null,
      error: reason instanceof Error ? reason.message : String(reason),
      retryable: !(reason instanceof TerrainProfileLoadError) || reason.retryable,
      status: "error",
    };
  }
}

/** Load the initial profiles as part of populateStore's returned state. */
export async function populateTerrainProfiles(
  mission: Mission,
  loadTestOptions?: { serverURL?: string; cookies?: string }
): Promise<TerrainProfilesState> {
  const profiles = buildTerrainProfiles(mission);
  const entries = Object.entries(profiles);
  if (entries.length) {
    const response = getTerrainProfiles(
      mission.id,
      entries.map(([uuid, entry]) => ({
        entityUuid: uuid,
        path: entry.path,
        pathSegmentDistances: entry.distances,
      })),
      loadTestOptions
    );
    await Promise.all(
      entries.map(async ([, entry], index) => {
        Object.assign(
          entry,
          await loadProfile(
            entry,
            response.then((results) => results[index])
          )
        );
      })
    );
  }
  return { profiles, previews: {} };
}

/** Synchronize derived Redux data with document geometry; never mutate the document. */
export function syncMissionTerrainProfiles(
  store: Pick<StoreType, "dispatch" | "getState">,
  loadTestOptions?: { serverURL?: string; cookies?: string },
  handle: DocHandle<Mission> = getMissionDocHandle()
): () => void {
  stopMissionTerrainProfiles();
  if (!handle) return () => {};
  const missionId = handle.doc().id;
  let stopped = false;
  // Keys are uuid + fingerprint, so a geometry change starts a fresh request and retry count.
  const queued = new Set<string>();
  const attempts = new Map<string, number>();
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let retryPump: ReturnType<typeof setTimeout> | undefined;
  const queue: { uuid: string; entry: TerrainProfileEntry }[] = [];
  const currentEntry = (uuid: string) => store.getState().terrainProfiles.profiles[uuid];

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
        // Retry timers that expire together share one HTTP batch.
        retryPump ??= setTimeout(() => {
          retryPump = undefined;
          pump();
        }, 0);
      }, delay)
    );
  };

  const load = async (
    uuid: string,
    entry: TerrainProfileEntry,
    key: string,
    responsePromise: Promise<TerrainProfileResponse>
  ) => {
    const result = await loadProfile(entry, responsePromise);
    queued.delete(key);
    if (stopped) return;
    store.dispatch(
      terrainProfileReceived({
        uuid,
        fingerprint: entry.fingerprint,
        ...result,
      })
    );
    if (result.retryable && currentEntry(uuid)?.fingerprint === entry.fingerprint)
      scheduleRetry(uuid, entry, key);
    else attempts.delete(key);
    pump();
  };

  const pump = () => {
    if (stopped) return;
    const batch: typeof queue = [];
    while (queue.length) {
      const { uuid, entry } = queue.shift();
      const key = uuid + entry.fingerprint;
      if (currentEntry(uuid)?.fingerprint !== entry.fingerprint) {
        queued.delete(key);
        attempts.delete(key);
        continue;
      }
      batch.push({ uuid, entry });
    }
    if (!batch.length) return;
    const response = getTerrainProfiles(
      missionId,
      batch.map(({ uuid, entry }) => ({
        entityUuid: uuid,
        path: entry.path,
        pathSegmentDistances: entry.distances,
      })),
      loadTestOptions
    );
    batch.forEach(({ uuid, entry }, index) => {
      load(
        uuid,
        entry,
        uuid + entry.fingerprint,
        response.then((profiles) => profiles[index])
      );
    });
  };

  const update = () => {
    const mission = handle.doc();
    const { profiles: previous, previews } = store.getState().terrainProfiles;
    const entries = buildTerrainProfiles(mission, previous);
    store.dispatch(reconcileTerrainProfiles(entries));
    const profiles = store.getState().terrainProfiles.profiles;
    for (const [uuid, entry] of Object.entries(entries)) {
      // A drag release adopts its preview profile; previews skip the database cache, so
      // request the committed geometry once to cache it.
      const preview = previews[uuid];
      if (
        previous[uuid]?.fingerprint !== entry.fingerprint &&
        preview?.fingerprint === entry.fingerprint &&
        preview.status === "ready"
      )
        getTerrainProfile({
          missionId,
          entityUuid: uuid,
          path: entry.path,
          pathSegmentDistances: entry.distances,
        }).catch(() => {});
    }
    for (const [uuid, entry] of Object.entries(profiles)) {
      // Failed entries are retried only by their backoff timer.
      const key = uuid + entry.fingerprint;
      if (queued.has(key) || retryTimers.has(key)) continue;
      if (entry.status === "error" && entry.retryable) {
        scheduleRetry(uuid, entry, key);
        continue;
      }
      if (entry.status !== "idle") continue;
      queued.add(key);
      queue.push({ uuid, entry });
    }
    pump();
  };

  handle.on("change", update);
  update();
  return (stopTerrainProfiles = () => {
    stopped = true;
    queue.length = 0;
    retryTimers.forEach((timer) => clearTimeout(timer));
    retryTimers.clear();
    if (retryPump !== undefined) clearTimeout(retryPump);
    handle.off("change", update);
  });
}

/** Fetch the elevation at a single point. */
export const thunkFetchPointElevation = appCreateAsyncThunk<
  { point: AEGISPoint; uuid: string },
  number,
  false
>("getPointElevation", async ({ point, uuid }, { dispatch, rejectWithValue }) => {
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return rejectWithValue(false);
  if (!mission.demFilePath) throw new Error("No DEM file path found");

  dispatch(insertElevationPending(uuid));
  try {
    const response = await getElevationSinglePoint({ missionId: mission.id, point });
    if (response.status !== "success") throw new Error("API elevation returned failure");
    return response.data;
  } finally {
    dispatch(removeElevationPending(uuid));
  }
});

/** Fetch a drag-preview profile; committed profiles are loaded during population and document updates. */
export const thunkFetchTerrainProfile = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[]; uuid: string },
  TerrainProfile,
  false
>(
  "getTerrainProfile",
  async ({ path, pathSegmentDistances, uuid }, { dispatch, rejectWithValue }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission?.demFilePath) return rejectWithValue(false);

    dispatch(insertElevationPending(uuid));
    try {
      const response = await getTerrainProfile({
        missionId: mission.id,
        path,
        pathSegmentDistances,
        entityUuid: uuid,
        preview: true,
      });
      if (response.status !== "success") throw new Error("API terrain profile returned failure");
      const profile = normalizeTerrainProfile(response.data, path, pathSegmentDistances);
      if (!profile) throw new Error("API terrain profile returned misaligned data");
      return profile;
    } finally {
      dispatch(removeElevationPending(uuid));
    }
  }
);
