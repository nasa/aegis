export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/v1/preset?missionId=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function upsertPresets(
  presets: Preset[],
  log: boolean = false
): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetUpsertRequest = { missionId, socketId, log, presets };
  const res = await fetch(`/api/v1/preset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Preset[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving presets to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deletePresets(
  presetUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<Preset[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: PresetDeleteRequest = { missionId, socketId, log, presetUuids };
  const res = await fetch(`/api/v1/preset`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Preset[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting presets from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
