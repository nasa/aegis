import { useMemo, useSyncExternalStore } from "react";

import { getLoadedGridSnapshot, resolveMissionGrid, subscribeLoadedGrid } from "utils/mapping/grid";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

export function useResolvedMissionGrid(): ResolvedMissionGrid {
  const missionGrid = useMissionDocSelector(
    (mission) => ({
      serverFileGrid: mission.serverFileGrid,
      planet: mission.planet,
      landerLocation: mission.landerLocation,
      projIsCustom: mission.projIsCustom,
      projProj4String: mission.projProj4String,
    }),
    deepEqual
  );
  const loadedGrid = useSyncExternalStore(
    subscribeLoadedGrid,
    getLoadedGridSnapshot,
    getLoadedGridSnapshot
  );

  return useMemo(
    () => (missionGrid ? resolveMissionGrid(missionGrid, loadedGrid) : { kind: "none" }),
    [loadedGrid, missionGrid]
  );
}
