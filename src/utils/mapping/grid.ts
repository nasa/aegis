import { getGrid } from "http-client/grid";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

export let globalGrid: MissionGrid = null;
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

export function getLoadedGridSnapshot(): MissionGrid {
  return globalGrid;
}

export function getGridRenderMode(mission: { gridRenderMode?: GridRenderMode }): GridRenderMode {
  return mission.gridRenderMode ?? "server-file";
}

export function resolveMissionGrid(
  mission: Pick<Mission, "grid"> & { gridRenderMode?: GridRenderMode },
  serverGrid: MissionGrid = globalGrid
): ResolvedMissionGrid {
  if (getGridRenderMode(mission) === "dynamic-lgrs") return { kind: "dynamic-lgrs" };
  if (!mission.grid || !serverGrid?.coordinates?.length) return { kind: "none" };
  return { kind: "server-file", grid: serverGrid };
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
