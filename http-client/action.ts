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
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(`/api/action?socketId=${socketId}&missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(actionObj),
  });
  const response: WrappedResponse<Action> = await res.json();
  return response;
}

export async function deleteAction(actionUUID: string): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(
    `/api/action?socketId=${socketId}&uuid=${actionUUID}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<null> = await res.json();
  return response;
}
