import { checkResponse } from "http-client/helperResponse";

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
  return checkResponse<Folder[]>(res, "Error saving folders to database.");
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
  return checkResponse<null>(res, "Error deleting folders from database.");
}
