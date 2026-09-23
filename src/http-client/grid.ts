import { checkResponse } from "http-client/helperResponse";

export async function getGrid(
  missionId: number,
  getFullGrid: boolean = false
): Promise<WrappedResponse<MissionGrid | null>> {
  return checkResponse<MissionGrid | null>(
    await fetch(`/api/v1/grid?missionId=${missionId}&getFullGrids=${getFullGrid}`)
  );
}

export async function upsertGrid(
  grid: MissionGrid,
  missionId: number,
  upsertFullGrid: boolean = false
): Promise<WrappedResponse<MissionGrid>> {
  const requestBody: GridUpsertRequest = { grid, missionId, upsertFullGrid };
  const res = await fetch(`/api/v1/grid/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<MissionGrid>(res, "Error saving grid to database.");
}

export async function deleteGrid(missionId: number): Promise<WrappedResponse<null>> {
  const requestBody: GridDeleteRequest = { missionId };
  const res = await fetch(`/api/v1/grid`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<null>(res, "Error deleting grid from database.");
}
