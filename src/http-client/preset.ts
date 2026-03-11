export async function upsertPresets(presets: Preset[]): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetUpsertRequest = { missionId, socketId, presets };
  const res = await fetch(`/api/v1/preset`, {
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
      `Error saving presets to database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<Preset[]> = await res.json();
  return response;
}

export async function deletePresets(presetUuids: string[]): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetDeleteRequest = { missionId, socketId, presetUuids };
  const res = await fetch(`/api/v1/preset`, {
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
      `Error deleting presets from database. Please let the AEGIS developers know. Status ${errorMessage}`
    );
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<Preset[]> = await res.json();
  return response;
}
