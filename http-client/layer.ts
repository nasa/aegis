export async function getLayers(mission: number, uuid?: string): Promise<WrappedResponse<Layer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  const res = await fetch(`/api/layer?${params}`);
  const response: WrappedResponse<Layer[]> = await res.json();
  return response;
}

export async function upsertLayer(layer: Layer): Promise<WrappedResponse<Layer>> {
  const res = await fetch(`/api/layer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(layer),
  });
  const response: WrappedResponse<Layer> = await res.json();
  return response;
}

export async function deleteLayer(
  layerUuid: string,
  missionId: number
): Promise<WrappedResponse<null>> {
  const res = await fetch(`/api/layer?uuid=${layerUuid}&missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
