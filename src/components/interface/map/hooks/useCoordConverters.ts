/**
 * Coordinate Converters — pure factory + React hook
 *
 * Provides bidirectional conversion between AEGISPoint (lat/lng in degrees)
 * and OL Coordinate (projected [x, y] in the mission's CRS).
 *
 * The factory function `createCoordConverters()` is pure and testable
 * without any React/Redux/Context dependencies. The hook wraps it for
 * convenient use inside behavior components.
 */

import { useMemo } from "react";
import proj4 from "proj4";
import type { Coordinate } from "ol/coordinate";

import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual } from "utils/useAppSelector";

// ---------------------------------------------------------------------------
// Pure factory — no React, no Redux, no Context
// ---------------------------------------------------------------------------

export interface CoordConverters {
  /** AEGISPoint → OL Coordinate in the mission's projected CRS */
  toMapCoord: (point: AEGISPoint) => Coordinate;
  /** OL Coordinate (projected) → AEGISPoint (degrees) */
  toAegisPoint: (coord: Coordinate) => AEGISPoint;
  /** The projection code these converters target */
  projCode: string;
}

/**
 * Create a pair of coordinate converter functions for a given projection.
 *
 * IMPORTANT: The projection must already be registered with proj4 before calling this.
 * `MapProvider` handles registration during map init.
 */
export function createCoordConverters(projCode: string): CoordConverters {
  return {
    projCode,

    toMapCoord(point: AEGISPoint): Coordinate {
      if (point.lat == null || point.lng == null) return [0, 0];
      return proj4("EPSG:4326", projCode, [point.lng, point.lat]) as Coordinate;
    },

    toAegisPoint(coord: Coordinate): AEGISPoint {
      const [lng, lat] = proj4(projCode, "EPSG:4326", coord);
      return { lat, lng };
    },
  };
}

// ---------------------------------------------------------------------------
// React hook — reads projCode from mission doc
// ---------------------------------------------------------------------------

/**
 * Returns coordinate converters for the current mission's projection.
 * Re-creates converters only when the projection code changes.
 */
export function useCoordConverters(): CoordConverters {
  const projEpsg = useMissionDocSelector((doc) => doc.projEpsg, refEqual);
  const projIsCustom = useMissionDocSelector((doc) => doc.projIsCustom, refEqual);
  const missionId = useMissionDocSelector((doc) => doc.id, refEqual);

  const projCode = useMemo(() => {
    if (!projIsCustom) return "EPSG:3857";
    if (projEpsg === "EPSG:3857") return `AEGIS:${missionId ?? "custom"}`;
    return projEpsg ?? "EPSG:3857";
  }, [projIsCustom, projEpsg, missionId]);

  return useMemo(() => createCoordConverters(projCode), [projCode]);
}
