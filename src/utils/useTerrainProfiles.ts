import { useEffect, useMemo } from "react";
import { useStore } from "react-redux";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import type { StoreType } from "store";
import { syncMissionTerrainProfiles } from "client/missionTerrainProfiles";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

const EMPTY_PROFILES: TerrainProfiles = {};
/** Mount once in the mission/dashboard/export page. */
export function useMissionTerrainSync(): void {
  const url = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  const handle = useDocHandle<Mission>(url as AutomergeUrl);
  const store = useStore() as StoreType;
  useEffect(() => {
    if (!handle?.doc()?.id) return;
    return syncMissionTerrainProfiles(handle, store);
  }, [handle, store]);
}
/** Explicit Redux selection: profiles/previews remain separate from mission entities. */
export function useMissionTerrainProfiles(): TerrainProfiles {
  const missionId = useMissionDocSelector((mission) => mission.id, refEqual);
  const terrain = useAppSelector((state) => state.terrainProfiles?.missions[missionId], refEqual);
  return useMemo(
    () => (terrain ? { ...terrain.profiles, ...terrain.previews } : EMPTY_PROFILES),
    [terrain]
  );
}
