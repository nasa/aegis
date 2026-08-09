/**
 * MouseCoordinateDisplay — shows lat/lng + grid coordinates under the cursor.
 *
 * Listens to `pointermove` on the OL map and converts projected coordinates
 * back to AEGIS lat/lng, then computes grid coordinates through the LGRS
 * display adapter in `getGridCoordinatesFromPoint()`.
 *
 * Editor only.
 */

import { useEffect, useState } from "react";
import type { MapBrowserEvent } from "ol";

import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getGridCoordinatesFromPoint } from "utils/mapping/geoMath";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { MODE_CONFIGS } from "../utils/modeConfig";

interface MouseCoordinateDisplayProps {
  className?: string;
}

export function MouseCoordinateDisplay({
  className,
}: MouseCoordinateDisplayProps): JSX.Element | null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { toAegisPoint } = useCoordConverters();
  const resolvedGrid = useResolvedMissionGrid();

  const planetRadius = useMissionDocSelector((doc) => doc.planetRadius, refEqual);
  const usingLGRS = useMissionDocSelector((doc) => doc.usingLGRSCoordinates, refEqual);

  const [mouseLatLng, setMouseLatLng] = useState<AEGISPoint | null>(null);
  const [mouseGridCoord, setMouseGridCoord] = useState<string | null>(null);

  useEffect(() => {
    if (!config.map.showMouseCoords) return;

    const handleMove = (evt: MapBrowserEvent<PointerEvent>) => {
      const point = toAegisPoint(evt.coordinate);
      setMouseLatLng(point);

      const gridCoords = getGridCoordinatesFromPoint(
        point,
        planetRadius,
        usingLGRS,
        resolvedGrid.kind === "server-file" ? resolvedGrid.grid.coordinates : undefined
      );
      setMouseGridCoord(gridCoords);
    };

    map.on("pointermove", handleMove);
    return () => {
      map.un("pointermove", handleMove);
    };
  }, [map, config.map.showMouseCoords, toAegisPoint, planetRadius, usingLGRS, resolvedGrid]);

  if (!config.map.showMouseCoords) return null;

  return (
    <div className={className}>
      {mouseLatLng && (
        <div
          style={{
            fontSize: "0.8em",
            border: "1px solid var(--grey3, #666)",
            padding: "5px",
            width: "150px",
          }}
        >
          {mouseLatLng.lat.toFixed(6)}, {mouseLatLng.lng.toFixed(6)}
        </div>
      )}
      {mouseGridCoord && (
        <div
          style={{
            fontSize: "0.8em",
            border: "1px solid var(--grey3, #666)",
            padding: "5px",
          }}
        >
          {mouseGridCoord}
        </div>
      )}
    </div>
  );
}
