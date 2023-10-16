export async function getLayers(mission: number, uuid?: string): Promise<WrappedResponse<Layer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  const res = await fetch(`/api/layer?${params}`);
  const response: WrappedResponse<Layer[]> = await res.json();
  return response;
}

export async function upsertLayers(layers: Layer[]): Promise<WrappedResponse<Layer[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/layer?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(layers),
  });
  const response: WrappedResponse<Layer[]> = await res.json();
  return response;
}

export async function deleteLayers(layerUuids: string[]): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/layer?missionId=${missionId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(layerUuids),
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
