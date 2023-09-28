export async function getRexes(missionId: number = null): Promise<WrappedResponse<Rex[]>> {
  const res = await fetch(`/api/rex?missionId=${missionId}`);

  const response: WrappedResponse<Rex[]> = await res.json();
  return response;
}

export async function upsertRex(rexObj: Rex, log: boolean = false): Promise<WrappedResponse<Rex>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/rex?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rexObj),
  });
  const response: WrappedResponse<Rex> = await res.json();
  return response;
}

export async function deleteRex(
  uuid: string,
  log: boolean = false
): Promise<WrappedResponse<string | null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(
    `/api/rex?socketId=${socketId}&uuid=${uuid}&missionId=${missionId}${logStr}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<string | null> = await res.json();
  return response;
}
