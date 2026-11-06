/**
 * MouseCoordinateDisplay — shows lat/lng + grid coordinates under the cursor.
 *
 * Listens to `pointermove` on the OL map, coalesced to one update per animation frame. The
 * mission's cached LGRS map adapter converts the projected coordinate to lat/lng (identical to
 * proj4), and state is only set when the displayed text changes.
 *
 * Editor only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapBrowserEvent } from "ol";
import type { Coordinate } from "ol/coordinate";

import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getGridCoordinatesFromPoint } from "utils/mapping/geoMath";
import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "utils/lgrs/display";
import { getLgrsMapAdapter, getLgrsMapProjection } from "utils/lgrs/mapAdapter";
import { useMapContext } from "../MapProvider";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { MODE_CONFIGS } from "../utils/modeConfig";

interface MouseCoordinateDisplayProps {
  className?: string;
}

const READOUT_STYLE = {
  fontSize: "0.8em",
  border: "1px solid var(--grey3, #666)",
  padding: "5px",
};

export function MouseCoordinateDisplay({
  className,
}: MouseCoordinateDisplayProps): JSX.Element | null {
  const { map, mode } = useMapContext();
  const showMouseCoords = MODE_CONFIGS[mode].map.showMouseCoords;
  const resolvedGrid = useResolvedMissionGrid();

  const missionId = useMissionDocSelector((doc) => doc.id, refEqual);
  const projIsCustom = useMissionDocSelector((doc) => doc.projIsCustom, refEqual);
  const projEpsg = useMissionDocSelector((doc) => doc.projEpsg, refEqual);
  const projProj4String = useMissionDocSelector((doc) => doc.projProj4String, refEqual);
  const planetRadius = useMissionDocSelector((doc) => doc.planetRadius, refEqual);
  const usingLGRS = useMissionDocSelector((doc) => doc.usingLGRSCoordinates, refEqual);

  const inputs = useMemo<MouseCoordinateInputs>(() => {
    const adapter = getLgrsMapAdapter(
      getLgrsMapProjection({ id: missionId, projIsCustom, projEpsg, projProj4String })
    );
    let formatGrid: MouseCoordinateInputs["formatGrid"] = () => null;
    if (usingLGRS) {
      const style: LgrsDisplayStyle = resolvedGrid.kind === "dynamic-lgrs" ? "full" : "condensed";
      formatGrid = (point) => formatLgrsFromLatLon(point, LGRS_DISPLAY_PRECISION_METERS, style);
    } else if (resolvedGrid.kind === "server-file") {
      const globalGrid = resolvedGrid.grid.coordinates;
      formatGrid = (point) => getGridCoordinatesFromPoint(point, planetRadius, false, globalGrid);
    }
    return { adapter, formatGrid };
  }, [missionId, projIsCustom, projEpsg, projProj4String, planetRadius, usingLGRS, resolvedGrid]);

  const [readout, setReadout] = useState<MouseCoordinateReadout | null>(null);
  const readoutRef = useRef(readout);

  useEffect(() => {
    if (!showMouseCoords) return;

    const latLon = new Float64Array(2);
    let pendingCoordinate: Coordinate | null = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const coordinate = pendingCoordinate;
      pendingCoordinate = null;
      if (!coordinate) return;

      let next: MouseCoordinateReadout | null = null;
      if (inputs.adapter.mapToLatLon(coordinate[0], coordinate[1], latLon)) {
        const point: AEGISPoint = { lat: latLon[0], lng: latLon[1] };
        next = {
          latLng: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
          grid: inputs.formatGrid(point),
        };
      }
      const previous = readoutRef.current;
      if (previous?.latLng === next?.latLng && previous?.grid === next?.grid) return;
      readoutRef.current = next;
      setReadout(next);
    };

    const handleMove = (evt: MapBrowserEvent<PointerEvent>) => {
      pendingCoordinate = evt.coordinate;
      if (!frame) frame = requestAnimationFrame(update);
    };

    map.on("pointermove", handleMove);
    return () => {
      map.un("pointermove", handleMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [map, showMouseCoords, inputs]);

  if (!showMouseCoords) return null;

  return (
    <div className={className}>
      {readout && <div style={{ ...READOUT_STYLE, width: "150px" }}>{readout.latLng}</div>}
      {readout?.grid && <div style={{ ...READOUT_STYLE, minWidth: "150px" }}>{readout.grid}</div>}
    </div>
  );
}
