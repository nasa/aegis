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

export async function upsertTraverse(traverseObj: Traverse): Promise<WrappedResponse<Traverse>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(`/api/traverse?socketId=${socketId}&missionId=${missionId}`, {
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
  traverseUuid: string
): Promise<WrappedResponse<number | null>> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const res = await fetch(
    `/api/traverse?socketId=${socketId}&uuid=${traverseUuid}&missionId=${missionId}`,
    {
      method: "DELETE",
    }
  );
  const response: WrappedResponse<number | null> = await res.json();
  return response;
}
