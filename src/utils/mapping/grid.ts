import { getGrid } from "http-client/grid";

export let globalGrid: MissionGrid = null;

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
