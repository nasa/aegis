import type { DocHandle } from "@automerge/automerge-repo";
import type { StoreType } from "store";
import { getTerrainProfile, normalizeTerrainProfile } from "http-client/terrainProfile";
import {
  reconcileTerrainProfiles,
  terrainFingerprint,
  terrainProfileLoading,
  terrainProfileReceived,
  removeMissionTerrain,
} from "store/terrainProfiles";

/** Synchronize derived Redux data with document geometry; never mutate the document. */
export function syncMissionTerrainProfiles(
  handle: DocHandle<Mission>,
  store: Pick<StoreType, "dispatch" | "getState">
): () => void {
  const missionId = handle.doc().id;
  let stopped = false;
  let running = 0;
  const queued = new Set<string>();
  const queue: { uuid: string; entry: TerrainProfileEntry }[] = [];
  const load = async (uuid: string, entry: TerrainProfileEntry, key: string) => {
    let profile: TerrainProfile | null = null;
    let error: string | null = null;
    try {
      const response = await getTerrainProfile({
        missionId,
        entityKey: uuid,
        path: entry.path,
        pathSegmentDistances: entry.distances,
      });
      profile =
        response.status === "success"
          ? normalizeTerrainProfile(response.data, entry.path, entry.distances)
          : null;
      if (!profile) throw new Error(response.message || "Invalid terrain profile");
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
    if (!stopped)
      store.dispatch(
        terrainProfileReceived({
          missionId,
          uuid,
          fingerprint: entry.fingerprint,
          profile,
          error,
        })
      );
    running--;
    queued.delete(key);
    pump();
  };
  const pump = () => {
    if (stopped) return;
    while (running < 4 && queue.length) {
      const { uuid, entry } = queue.shift();
      const key = uuid + entry.fingerprint;
      const current = store.getState().terrainProfiles.missions[missionId]?.profiles[uuid];
      if (current?.fingerprint !== entry.fingerprint) {
        queued.delete(key);
        continue;
      }
      running++;
      store.dispatch(terrainProfileLoading({ missionId, uuid, fingerprint: entry.fingerprint }));
      load(uuid, entry, key);
    }
  };
  const update = () => {
    const mission = handle.doc();
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
      entries[uuid] = {
        fingerprint: terrainFingerprint(mission, path, distances),
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
    store.dispatch(reconcileTerrainProfiles({ missionId, entries }));
    const profiles = store.getState().terrainProfiles.missions[missionId].profiles;
    for (const [uuid, entry] of Object.entries(profiles)) {
      const key = uuid + entry.fingerprint;
      if (entry.status === "ready" || queued.has(key)) continue;
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
    handle.off("change", update);
    store.dispatch(removeMissionTerrain(missionId));
  };
}
