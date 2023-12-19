export async function getLogs(missionId: number = null): Promise<WrappedResponse<Log[]>> {
  const res = await fetch(`/api/log?missionId=${missionId}`);

  const response: WrappedResponse<Log[]> = await res.json();
  return response;
}

export async function upsertLogs(logObjs: Log[]): Promise<WrappedResponse<Log[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/log?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(logObjs),
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
  const res = await fetch(`/api/log?`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(missionIds.map(String)),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting logs from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
