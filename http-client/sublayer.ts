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

export async function upsertSublayer(sublayer: Sublayer): Promise<WrappedResponse<Sublayer>> {
  const res = await fetch(`/api/sublayer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sublayer),
  });
  const response: WrappedResponse<Sublayer> = await res.json();
  return response;
}

export async function deleteSublayer(
  sublayerUuid: string,
  missionId: number
): Promise<WrappedResponse<null>> {
  const res = await fetch(`/api/sublayer?uuid=${sublayerUuid}&missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<null> = await res.json();
  return response;
}
