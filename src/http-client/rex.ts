export async function getRexes(missionId: number = null): Promise<WrappedResponse<Rex[]>> {
  const res = await fetch(`/api/v1/rex?missionId=${missionId}`);

  const response: WrappedResponse<Rex[]> = await res.json();
  return response;
}

export async function upsertRexes(
  rexes: Rex[],
  log: boolean = false
): Promise<WrappedResponse<Rex[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: RexUpsertRequest = { missionId, socketId, log, rexes };
  const res = await fetch(`/api/v1/rex`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Rex[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving rexes to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteRexes(
  uuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: RexDeleteRequest = { missionId, socketId, log, uuids };
  const res = await fetch(`/api/v1/rex`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting rexes from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
