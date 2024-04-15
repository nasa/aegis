export async function getActions(filter: ActionFilterOptions): Promise<WrappedResponse<Action[]>> {
  let urlParams = "";

  if (filter.missionId) urlParams += `missionId=${filter.missionId}`;
  if (filter.actionUuid) urlParams += `&uuid=${filter.actionUuid}`;
  if (filter.poiUuid) urlParams += `&poiUuid=${filter.poiUuid}`;
  if (filter.stationUuid) urlParams += `&stationUuid=${filter.stationUuid}`;

  const res: Response = await fetch(`/api/v1/action?${urlParams}`);
  const response: WrappedResponse<Action[]> = await res.json();
  return response;
}

export async function upsertActions(
  actions: Action[],
  log: boolean = false
): Promise<WrappedResponse<Action[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: ActionUpsertRequest = { socketId, missionId, log, actions };
  const res = await fetch(`/api/v1/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Action[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving actions to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteActions(
  actionUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: ActionDeleteRequest = { socketId, missionId, log, actionUuids };
  const res = await fetch(`/api/v1/action`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting actions from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
