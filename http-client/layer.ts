export async function getLayers(mission: number): Promise<WrappedResponse<Layer[]>> {
  const res = await fetch(`/api/layer?missionId=${mission}`);
  const response: WrappedResponse<Layer[]> = await res.json();

  return response;
}

export async function setLayer(layer: Layer): Promise<WrappedResponse<Layer[]>> {
  const res = await fetch(`/api/layer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ layer }),
  });
  return await res.json();
}

export async function deleteLayer(layerUuid: string): Promise<WrappedResponse<Layer[]>> {
  const res = await fetch(`/api/layer?uuid=${layerUuid}`, {
    method: "DELETE",
  });
  return await res.json();
}
