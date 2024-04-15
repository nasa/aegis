export async function getLayers(mission: number, uuid?: string): Promise<WrappedResponse<Layer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  const res = await fetch(`/api/v1/layer?${params}`);
  const response: WrappedResponse<Layer[]> = await res.json();
  return response;
}

export async function upsertLayers(layers: Layer[]): Promise<WrappedResponse<Layer[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: LayerUpsertRequest = { missionId, layers };
  const res = await fetch(`/api/v1/layer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Layer[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving layers to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteLayers(layerUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: LayerDeleteRequest = { missionId, layerUuids };
  const res = await fetch(`/api/v1/layer`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting layers from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
