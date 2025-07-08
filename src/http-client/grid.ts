export async function getGrids(
  missionId: number = null,
  gridUuid: string = null,
  getFullGrids: boolean = false
): Promise<WrappedResponse<MissionGrid[]>> {
  let res: Response;
  if (missionId && gridUuid) {
    res = await fetch(
      `/api/v1/grid?missionId=${missionId}&gridUuid=${gridUuid}&getFullGrids=${getFullGrids}`
    );
  } else if (missionId) {
    res = await fetch(`/api/v1/grid?missionId=${missionId}&getFullGrids=${getFullGrids}`);
  } else if (gridUuid) {
    res = await fetch(`/api/v1/grid?gridUuid=${gridUuid}&getFullGrids=${getFullGrids}`);
  } else {
    res = await fetch(`/api/v1/grid&getFullGrids=${getFullGrids}`);
  }
  const response: WrappedResponse<MissionGrid[]> = await res.json();
  return response;
}

export async function upsertGrids(
  grids: MissionGrid[],
  missionId: number,
  upsertFullGrid: boolean = false
): Promise<WrappedResponse<MissionGrid[]>> {
  const requestBody: GridUpsertRequest = { grids, missionId, upsertFullGrid };
  const res = await fetch(`/api/v1/grid/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<MissionGrid[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving grids to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteGrids(
  gridUuid: string,
  missionId: number
): Promise<WrappedResponse<null>> {
  const requestBody: GridDeleteRequest = { gridUuid, missionId };
  const res = await fetch(`/api/v1/grid`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting grids from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
