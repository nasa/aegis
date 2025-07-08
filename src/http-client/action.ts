export async function upsertActions(actions: Action[]): Promise<WrappedResponse<Action[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: ActionUpsertRequest = { socketId, missionId, actions };
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

export async function deleteActions(actionUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: ActionDeleteRequest = { socketId, missionId, actionUuids };
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
