import { getGrid } from "http-client/grid";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

export let globalGrid: MissionGrid = null;

/**
 * Derive the base spacing (metres between adjacent grid lines) from the grid
 * geometry. This is the single source of truth for grid resolution — spacing is
 * not stored on the mission doc, so both the resolution menu and the Grid
 * behavior compute it from the loaded coordinate file.
 * @returns spacing in metres, or 0 if it can't be determined
 */
export function getGridBaseSpacingMeters(grid: MissionGrid, planetRadius: number): number {
  const coords = grid?.coordinates;
  if (!coords?.length || !planetRadius) return 0;
  // Scan for the first row with two adjacent points so a gap in row 0 doesn't
  // defeat detection.
  for (const row of coords) {
    if (!row || row.length < 2) continue;
    for (let c = 0; c < row.length - 1; c++) {
      const a = row[c]?.coordinates;
      const b = row[c + 1]?.coordinates;
      if (a && b) return getDistanceBetweenTwoCoordinates(a, b, planetRadius) ?? 0;
    }
  }
  return 0;
}

export async function loadAndReturnGrid(missionId: number): Promise<MissionGrid> {
  if (!missionId) {
    globalGrid = null;
    return null;
  }
  const gridData = (await getGrid(missionId, true)).data;
  if (gridData?.coordinates?.length) {
    globalGrid = gridData;
    return gridData;
  } else {
    globalGrid = null;
    return null;
  }
}
