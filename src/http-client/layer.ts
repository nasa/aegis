import { checkResponse } from "http-client/helperResponse";

export async function getLayers(mission: number, uuid?: string): Promise<WrappedResponse<Layer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  return checkResponse<Layer[]>(await fetch(`/api/v1/layer?${params}`));
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
  return checkResponse<Layer[]>(res, "Error saving layers to database.");
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
  return checkResponse<null>(res, "Error deleting layers from database.");
}
