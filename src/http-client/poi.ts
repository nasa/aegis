export async function getPOIs(mission: number): Promise<WrappedResponse<POI[]>> {
  const res = await fetch(`/api/v1/poi?missionId=${mission}`);
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
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function upsertPOIs(pois: POI[]): Promise<WrappedResponse<POI[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: POIUpsertRequest = { missionId, socketId, pois };
  const res = await fetch(`/api/v1/poi`, {
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
      `Error saving POIs to database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<POI[]> = await res.json();
  return response;
}

export async function deletePOIs(poiUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: POIDeleteRequest = { missionId, socketId, poiUuids };
  const res = await fetch(`/api/v1/poi`, {
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
      `Error deleting POIs from database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<null> = await res.json();
  return response;
}
