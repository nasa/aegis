export async function getFolders(
  mission: number,
  uuid?: string
): Promise<WrappedResponse<Folder[]>> {
  const queryParams = new URLSearchParams();
  queryParams.append("missionId", mission.toString());
  if (uuid) {
    queryParams.append("uuid", uuid);
  }
  const res = await fetch(`/api/v1/folder?${queryParams.toString()}`);
  const response: WrappedResponse<Folder[]> = await res.json();
  return response;
}

export async function upsertFolders(folders: Folder[]): Promise<WrappedResponse<Folder[]>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: FolderUpsertRequest = { missionId, socketId, folders };
  const res = await fetch(`/api/v1/folder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<Folder[]> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error saving folders to database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}

export async function deleteFolders(folderUuids: string[]): Promise<WrappedResponse<null>> {
  const missionIdStr =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const missionId = missionIdStr ? parseInt(missionIdStr) : undefined;
  const socketId = typeof window !== "undefined" ? window.sessionStorage.getItem("socketId") : null;
  const requestBody: FolderDeleteRequest = { missionId, socketId, folderUuids };
  const res = await fetch(`/api/v1/folder`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const response: WrappedResponse<null> = await res.json();
  if (res.status !== 200) {
    alert(
      `Error deleting folders from database. Please let the AEGIS team know via the support Teams chat. Status ${response.status} ${response.message}`
    );
  }
  return response;
}
