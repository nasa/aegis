export async function getActions(filter: ActionFilterOptions): Promise<WrappedResponse<Action[]>> {
  let urlParams = "";

  if (filter.missionId) urlParams += `missionId=${filter.missionId}`;
  if (filter.actionUuid) urlParams += `&uuid=${filter.actionUuid}`;
  if (filter.poiUuid) urlParams += `&poiUuid=${filter.poiUuid}`;
  if (filter.stationUuid) urlParams += `&stationUuid=${filter.stationUuid}`;

  const res: Response = await fetch(`/api/action?${urlParams}`);
  const response: WrappedResponse<Action[]> = await res.json();
  return response;
}

export async function upsertAction(actionObj: Action): Promise<WrappedResponse<Action>> {
  const uniqueClientId =
    typeof window !== undefined ? window.sessionStorage.getItem("uniqueClientId") : null;
  const res = await fetch(`/api/action?uniqueClientId=${uniqueClientId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(actionObj),
  });
  const response: WrappedResponse<Action> = await res.json();
  return response;
}

export async function deleteAction(
  actionUUID: string,
  missionId: number
): Promise<WrappedResponse<number | null>> {
  const uniqueClientId =
    typeof window !== undefined ? window.sessionStorage.getItem("uniqueClientId") : null;
  const res = await fetch(
    `/api/action?uniqueClientId=${uniqueClientId}&uuid=${actionUUID}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
