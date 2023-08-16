export async function getPresets(mission: number): Promise<WrappedResponse<Preset[]>> {
  const res = await fetch(`/api/preset?missionId=${mission}`);
  const response: WrappedResponse<Preset[]> = await res.json();

  return response;
}

export async function upsertPreset(
  preset: Preset,
  socketId: string
): Promise<WrappedResponse<Preset>> {
  const res = await fetch(`/api/preset?socketId=${socketId}`, {
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
  missionId: number,
  socketId: string
): Promise<WrappedResponse<Preset>> {
  const res = await fetch(
    `/api/preset?socketId=${socketId}&uuid=${presetUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  return await res.json();
}
