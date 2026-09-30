export async function getGrid(
  missionId: number,
  getFullGrid: boolean = false
): Promise<WrappedResponse<MissionGrid | null>> {
  const res = await fetch(`/api/v1/grid?missionId=${missionId}&getFullGrids=${getFullGrid}`);
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
  const response: WrappedResponse<MissionGrid | null> = await res.json();
  return response;
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
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error saving grid to database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<MissionGrid> = await res.json();
  return response;
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
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    alert(
      `Error deleting grid from database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<null> = await res.json();
  return response;
}
