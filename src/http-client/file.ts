import type { AxiosRequestConfig, AxiosResponse, AxiosProgressEvent } from "axios";
import axios from "axios";
import { prefixUrl } from "utils/basePath";

export async function uploadFile(
  formData: FormData,
  controller: AbortController,
  progressCallback?: (progressEvent: AxiosProgressEvent) => void
): Promise<AxiosResponse> {
  const config: AxiosRequestConfig = {
    headers: { "content-type": "multipart/form-data" },
    onUploadProgress: progressCallback,
    validateStatus: (_status) => true, //define HTTP code(s) that should throw an error (return false)
    signal: controller.signal, //abort controller for user to cancel upload
  };
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;

  try {
    return await axios.post(
      prefixUrl(`/api/v1/file/upload?missionId=${missionId}`),
      formData,
      config
    );
  } catch (e) {
    //axios rejects the promise if the response is an error. Just pass the response data through
    if (axios.isAxiosError(e)) {
      if (e.name === "CanceledError") {
        return { status: 499, data: "Client Closed Request" } as AxiosResponse;
      }
      return { status: 500, data: e.message } as AxiosResponse;
    } else {
      return { status: 500, data: e } as AxiosResponse;
    }
  }
}

/**
 * Calls api endpoint to deletes a file or folder recurisvely
 * @param path path with filename or folder to delete off the root STATIC_DIR
 * @returns boolean if delete was successful
 */
export async function deleteFile(path: string): Promise<Response> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  // send as a DELETE request
  return (await fetch(
    prefixUrl(`/api/v1/file/delete?missionId=${missionId}&path=${encodeURIComponent(path)}`),
    {
      method: "DELETE",
    }
  )) as Response;
}

/**
 * Calls api endpoint to rename file or folder
 * @param path the path directory off the root STATIC_DIR
 * @param oldName current file name
 * @param newName new file name
 * @returns bool if rename was successful
 */
export async function renameFile(
  path: string,
  oldName: string,
  newName: string
): Promise<Response> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  return (await fetch(
    prefixUrl(
      `/api/v1/file/rename?missionId=${missionId}&path=${encodeURIComponent(path)}&oldname=${encodeURIComponent(
        oldName
      )}&newname=${encodeURIComponent(newName)}`
    )
  )) as Response;
}

/**
 * Calls the API endpoint to list files
 * @param path the path directory off the root STATIC_DIR
 * @returns the json response containing array of file listing
 */
export async function listFiles(path: string): Promise<GISfile[]> {
  const missionId =
    typeof window !== "undefined" ? window.sessionStorage.getItem("missionId") : null;
  const res: Response = await fetch(
    prefixUrl(`/api/v1/file/list?missionId=${missionId}&path=${encodeURIComponent(path)}`)
  );
  if (res.status !== 200) {
    return [];
  }
  const jsondata = await res.json();
  return jsondata.data;
}
