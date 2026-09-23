import { checkResponse } from "http-client/helperResponse";

export async function getSublayers(
  mission: number,
  uuid?: string
): Promise<WrappedResponse<Sublayer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  return checkResponse<Sublayer[]>(await fetch(`/api/v1/sublayer?${params}`));
}

export async function upsertSublayers(sublayers: Sublayer[]): Promise<WrappedResponse<Sublayer[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: SublayerUpsertRequest = { missionId, sublayers };
  const res = await fetch(`/api/v1/sublayer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<Sublayer[]>(res, "Error saving sublayers to database.");
}

export async function deleteSublayers(sublayerUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: SublayerDeleteRequest = { missionId, sublayerUuids };
  const res = await fetch(`/api/v1/sublayer`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  return checkResponse<null>(res, "Error deleting sublayers from database.");
}
