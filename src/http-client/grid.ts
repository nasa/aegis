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
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
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
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error saving grids to database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<MissionGrid[]> = await res.json();
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
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error deleting grids from database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<null> = await res.json();
  return response;
}
