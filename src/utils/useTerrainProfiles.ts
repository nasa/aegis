import { useEffect, useMemo } from "react";
import { useStore } from "react-redux";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import type { StoreType } from "store";
import { syncMissionTerrainProfiles } from "client/missionTerrainProfiles";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

const EMPTY_PROFILES: TerrainProfiles = {};
/** Mount in the mission/dashboard/export page; concurrent mounts share one coordinator. */
export function useMissionTerrainSync(): void {
  const url = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  const handle = useDocHandle<Mission>(url as AutomergeUrl);
  const store = useStore() as StoreType;
  useEffect(() => {
    if (!handle) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    handle
      .whenReady()
      .then(() => {
        if (!cancelled && handle.doc()?.id) stop = syncMissionTerrainProfiles(handle, store);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [handle, store]);
}
/** Every committed and preview profile in the mission; re-renders on any profile change. */
export function useMissionTerrainProfiles(): TerrainProfiles {
  const missionId = useMissionDocSelector((mission) => mission.id, refEqual);
  const terrain = useAppSelector((state) => state.terrainProfiles.missions[missionId], refEqual);
  return useMemo(
    () => (terrain ? { ...terrain.profiles, ...terrain.previews } : EMPTY_PROFILES),
    [terrain]
  );
}
/** Profiles for the given entities only; re-renders only when one of them changes. */
export function useTerrainProfilesFor(uuids: string[]): TerrainProfiles {
  const missionId = useMissionDocSelector((mission) => mission.id, refEqual);
  const entries = useAppSelector((state) => {
    const terrain = state.terrainProfiles.missions[missionId];
    return uuids.map((uuid) => terrain?.previews[uuid] ?? terrain?.profiles[uuid]);
  }, shallowEqual);
  const key = uuids.join("\n");
  return useMemo(() => {
    const profiles: TerrainProfiles = {};
    key.split("\n").forEach((uuid, index) => {
      if (entries[index]) profiles[uuid] = entries[index];
    });
    return profiles;
  }, [key, entries]);
}
/** True once every committed profile in the mission has loaded or failed. */
export function useMissionTerrainSettled(): boolean {
  const missionId = useMissionDocSelector((mission) => mission.id, refEqual);
  return useAppSelector((state) => {
    const terrain = state.terrainProfiles.missions[missionId];
    return !!terrain && Object.values(terrain.profiles).every((entry) => entry.status !== "idle");
  }, refEqual);
}
