export async function getLogs(missionId: number = null): Promise<WrappedResponse<Log[]>> {
  const res = await fetch(`/api/v1/log?missionId=${missionId}`);

  const response: WrappedResponse<Log[]> = await res.json();
  return response;
}

export async function upsertLogs(logs: Log[]): Promise<WrappedResponse<Log[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const requestBody: LogUpsertRequest = { missionId, logs };
  const res = await fetch(`/api/v1/log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Log[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving logs to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteAllLogs(missionIds: number[]): Promise<WrappedResponse<null>> {
  const requestBody: LogDeleteRequest = { missionIds };
  const res = await fetch(`/api/v1/log`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting logs from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
