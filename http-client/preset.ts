export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/preset?missionId=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function setPreset(preset: Preset): Promise<WrappedResponse<Preset>> {
  const uniqueClientId =
    typeof window !== undefined ? window.sessionStorage.getItem("uniqueClientId") : null;
  const res = await fetch(`/api/preset?uniqueClientId=${uniqueClientId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preset),
  });
  return await res.json();
}

export async function deletePreset(
  presetUuid: string,
  missionId: number
): Promise<WrappedResponse<Preset>> {
  const uniqueClientId =
    typeof window !== undefined ? window.sessionStorage.getItem("uniqueClientId") : null;
  const res = await fetch(
    `/api/preset?uniqueClientId=${uniqueClientId}&uuid=${presetUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  return await res.json();
}
