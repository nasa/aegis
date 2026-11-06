/**
 * MouseCoordinateDisplay — shows lat/lng + grid coordinates under the cursor.
 *
 * Listens to `pointermove` on the OL map, coalesced to one update per animation frame. The
 * mission's cached map projector converts the projected coordinate to lat/lng (identical to
 * proj4), and state is only set when the displayed text changes. A grid system or scheme change
 * reformats the last position, so the readout and its scheme tag switch together.
 *
 * Editor only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapBrowserEvent } from "ol";
import type { Coordinate } from "ol/coordinate";

import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getGridCoordinatesFromPoint } from "utils/mapping/geoMath";
import {
  formatLgrsFromLatLon,
  GRID_LABEL_SCHEME_NAMES,
  LGRS_DISPLAY_PRECISION_METERS,
} from "utils/lgrs/display";
import { getLgrsMapProjection, getLgrsMapProjector } from "utils/lgrs/mapProjection";
import { useMapContext } from "../MapProvider";
import { useMissionCoordinateSystem } from "../hooks/useMissionGridSystem";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { MODE_CONFIGS } from "../utils/modeConfig";
import styles from "./mapOverlays.module.css";

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
  // One instance per `system.key`, so the memo below is keyed by the grid system.
  const gridSystem = useMissionCoordinateSystem();

  const inputs = useMemo<MouseCoordinateInputs>(() => {
    const projector = getLgrsMapProjector(
      getLgrsMapProjection({ id: missionId, projIsCustom, projEpsg, projProj4String })
    );
    let formatGrid: MouseCoordinateInputs["formatGrid"] = () => null;
    let schemeTag: string | null = null;
    if (gridSystem) {
      if (gridSystem.id === "earth-wgs84") schemeTag = GRID_LABEL_SCHEME_NAMES[gridSystem.scheme];
      const style: LgrsDisplayStyle = resolvedGrid.kind === "dynamic-lgrs" ? "full" : "condensed";
      formatGrid = (point) =>
        formatLgrsFromLatLon(gridSystem, point, LGRS_DISPLAY_PRECISION_METERS, style);
    } else if (resolvedGrid.kind === "server-file") {
      const globalGrid = resolvedGrid.grid.coordinates;
      formatGrid = (point) => getGridCoordinatesFromPoint(point, planetRadius, null, globalGrid);
    }
    return { projector, formatGrid, schemeTag };
  }, [missionId, projIsCustom, projEpsg, projProj4String, planetRadius, gridSystem, resolvedGrid]);

  const [readout, setReadout] = useState<MouseCoordinateReadout | null>(null);
  const readoutRef = useRef(readout);
  const lastCoordinateRef = useRef<Coordinate | null>(null);

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
      if (inputs.projector.mapToLatLon(coordinate[0], coordinate[1], latLon)) {
        const point: AEGISPoint = { lat: latLon[0], lng: latLon[1] };
        const grid = inputs.formatGrid(point);
        next = {
          latLng: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
          grid,
          schemeTag: grid ? inputs.schemeTag : null,
        };
      }
      const previous = readoutRef.current;
      if (
        previous?.latLng === next?.latLng &&
        previous?.grid === next?.grid &&
        previous?.schemeTag === next?.schemeTag
      ) {
        return;
      }
      readoutRef.current = next;
      setReadout(next);
    };

    const handleMove = (evt: MapBrowserEvent<PointerEvent>) => {
      lastCoordinateRef.current = evt.coordinate;
      pendingCoordinate = evt.coordinate;
      if (!frame) frame = requestAnimationFrame(update);
    };

    // New inputs (e.g. a scheme switch from the map menu) reformat the last position.
    if (lastCoordinateRef.current) {
      pendingCoordinate = lastCoordinateRef.current;
      frame = requestAnimationFrame(update);
    }

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
      {readout?.grid && (
        <div style={{ ...READOUT_STYLE, minWidth: "150px" }}>
          {readout.grid}
          {readout.schemeTag && (
            <span className={styles.gridSchemeTag} data-testid="mouse-grid-scheme">
              {readout.schemeTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
