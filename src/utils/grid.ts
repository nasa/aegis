import { getGrids } from "http-client/grid";

export let globalGrid: MissionGrid = null;

export async function loadAndReturnGrid(
  missionId: number,
  activeGridUuid: string
): Promise<MissionGrid> {
  if (!activeGridUuid || !missionId) {
    globalGrid = null;
    return null;
  }
  const loadedGrid: MissionGrid = (await getGrids(missionId, activeGridUuid, true)).data[0];
  globalGrid = loadedGrid;
  return loadedGrid;
}
