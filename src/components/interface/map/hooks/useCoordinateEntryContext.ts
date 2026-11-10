import { useMemo } from "react";

import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useResolvedMissionGrid } from "./useResolvedMissionGrid";

/** The mission's coordinate presentation for typed and displayed asset and position coordinates. */
export function useCoordinateEntryContext(): CoordinateEntryContext {
  const resolvedGrid = useResolvedMissionGrid();
  const mission = useMissionDocSelector(
    (m) => ({
      usingLGRSCoordinates: m.usingLGRSCoordinates,
      planetRadius: m.planetRadius,
      landerLocation: m.landerLocation,
    }),
    deepEqual
  );
  return useMemo(
    () => ({
      usingLGRSCoordinates: !!mission?.usingLGRSCoordinates,
      dynamicLgrs: resolvedGrid.kind === "dynamic-lgrs",
      serverGrid: resolvedGrid.kind === "server-file" ? resolvedGrid.grid.coordinates : null,
      planetRadius: mission?.planetRadius ?? null,
      landerLocation: mission?.landerLocation ?? null,
    }),
    [mission, resolvedGrid]
  );
}
