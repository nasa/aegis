export async function getRexes(missionId: number = null): Promise<WrappedResponse<Rex[]>> {
  const res = await fetch(`/api/rex?missionId=${missionId}`);

  const response: WrappedResponse<Rex[]> = await res.json();
  return response;
}

export async function upsertRexes(
  rexObjs: Rex[],
  log: boolean = false
): Promise<WrappedResponse<Rex[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/rex?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rexObjs),
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
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/rex?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(uuids),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting rexes from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
