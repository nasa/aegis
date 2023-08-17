export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/preset?missionId=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function upsertPreset(preset: Preset): Promise<WrappedResponse<Preset>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(`/api/preset?socketId=${socketId}&missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preset),
  });
  return await res.json();
}

export async function deletePreset(presetUuid: string): Promise<WrappedResponse<Preset>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(
    `/api/preset?socketId=${socketId}&uuid=${presetUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  return await res.json();
}
