import { useMemo } from "react";

import { getPlanetRadius } from "utils/planets";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useResolvedMissionGrid } from "./useResolvedMissionGrid";

/** The mission's coordinate presentation for typed and displayed asset and position coordinates. */
export function useCoordinateEntryContext(): CoordinateEntryContext {
  const resolvedGrid = useResolvedMissionGrid();
  const mission = useMissionDocSelector(
    (m) => ({
      // Typed grid labels currently use the lunar parser.
      usingLGRSCoordinates: m.planet === "moon",
      planetRadius: getPlanetRadius(m),
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
