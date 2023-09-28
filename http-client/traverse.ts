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

export async function upsertTraverse(
  traverseObj: Traverse,
  log: boolean = false
): Promise<WrappedResponse<Traverse>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(`/api/traverse?socketId=${socketId}&missionId=${missionId}${logStr}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(traverseObj),
  });
  const response: WrappedResponse<Traverse> = await res.json();
  return response;
}

export async function deleteTraverse(
  traverseUuid: string,
  log: boolean = false
): Promise<WrappedResponse<number | null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const logStr = log ? "&log=true" : "";
  const res = await fetch(
    `/api/traverse?socketId=${socketId}&uuid=${traverseUuid}&missionId=${missionId}${logStr}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
