export async function getTraverses(missionId: number = null): Promise<WrappedResponse<Traverse[]>> {
  let res: Response;
  if (missionId) {
    res = await fetch(`/api/traverse?missionId=${missionId}`);
  } else {
    res = await fetch(`/api/traverse`);
  }
  const response: WrappedResponse<Traverse[]> = await res.json();
  return response;
}

export async function upsertTraverses(
  traverses: Traverse[],
  log: boolean = false
): Promise<WrappedResponse<Traverse[]>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/traverse?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(traverses),
  });
  const response: WrappedResponse<Traverse[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving traverses to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteTraverses(
  traverseUuids: string[],
  log: boolean = false
): Promise<WrappedResponse<null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/traverse?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(traverseUuids),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting traverses from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
