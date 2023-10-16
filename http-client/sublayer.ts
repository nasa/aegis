export async function getSublayers(
  mission: number,
  uuid?: string
): Promise<WrappedResponse<Sublayer[]>> {
  let params = `missionId=${mission}`;
  if (uuid) params += `&uuid=${uuid}`;

  const res = await fetch(`/api/sublayer?${params}`);
  const response: WrappedResponse<Sublayer[]> = await res.json();
  return response;
}

export async function upsertSublayers(sublayers: Sublayer[]): Promise<WrappedResponse<Sublayer[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/sublayer?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sublayers),
  });
  const response: WrappedResponse<Sublayer[]> = await res.json();
  return response;
}

export async function deleteSublayers(sublayerUuids: string[]): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/sublayer?missionId=${missionId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sublayerUuids),
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
