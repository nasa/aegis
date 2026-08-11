import { getGrid } from "http-client/grid";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

let globalGrid: MissionGrid = null;
const loadedGridListeners = new Set<() => void>();

function setLoadedGrid(grid: MissionGrid): void {
  if (globalGrid === grid) return;
  globalGrid = grid;
  for (const listener of loadedGridListeners) listener();
}

export function subscribeLoadedGrid(listener: () => void): () => void {
  loadedGridListeners.add(listener);
  return () => loadedGridListeners.delete(listener);
}

export function getLoadedGrid(): MissionGrid {
  return globalGrid;
}

/**
 * The server-file grid, but only when the mission is actually configured to use
 * one and the coordinate file has finished loading. Null in every other case, so
 * callers never have to check render mode and load state separately.
 */
export function getServerFileGrid(gridRenderMode: GridRenderMode): MissionGrid | null {
  if (gridRenderMode !== "server-file") return null;
  return globalGrid?.coordinates?.length ? globalGrid : null;
}

export function clearLoadedGrid(): void {
  setLoadedGrid(null);
}

/**
 * Derive the base spacing (metres between adjacent grid lines) from the grid
 * geometry for server-file grids. Spacing is not stored on the mission doc, so
 * both the resolution menu and the Grid behavior compute it from the loaded
 * coordinate file when one is used. Dynamic LGRS grids use their own resolution.
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
    setLoadedGrid(null);
    return null;
  }
  const gridData = (await getGrid(missionId, true)).data;
  if (gridData?.coordinates?.length) {
    setLoadedGrid(gridData);
    return gridData;
  } else {
    setLoadedGrid(null);
    return null;
  }
}
