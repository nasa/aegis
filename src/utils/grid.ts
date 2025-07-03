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
  const gridData = (await getGrids(missionId, activeGridUuid, true)).data;
  if (gridData?.length) {
    globalGrid = gridData[0];
    return gridData[0];
  } else {
    globalGrid = null;
    return null;
  }
}
