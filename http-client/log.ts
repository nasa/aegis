export async function getLogs(missionId: number = null): Promise<WrappedResponse<Log[]>> {
  const res = await fetch(`/api/log?missionId=${missionId}`);

  const response: WrappedResponse<Log[]> = await res.json();
  return response;
}

export async function upsertLog(logObj: Log): Promise<WrappedResponse<Log>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res = await fetch(`/api/log?missionId=${missionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(logObj),
  });
  const response: WrappedResponse<Log> = await res.json();
  return response;
}

export async function deleteLogs(missionId: number): Promise<WrappedResponse<string | null>> {
  const res = await fetch(`/api/log?missionId=${missionId}`, {
    method: "DELETE",
  });
  const response: WrappedResponse<string | null> = await res.json();
  return response;
}
