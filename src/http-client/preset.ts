export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/v1/preset?missionId=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function upsertPresets(
  presets: Preset[],
  log: boolean = false
): Promise<WrappedResponse<Preset[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/v1/preset?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(presets),
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
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/v1/preset?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(presetUuids),
  });
  const response: WrappedResponse<Preset[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting presets from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
