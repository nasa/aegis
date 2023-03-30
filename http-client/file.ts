import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export async function uploadFile(
  formData: FormData,
  controller: AbortController,
  progressCallback?: (progressEvent: ProgressEvent) => void
): Promise<AxiosResponse> {
  const config: AxiosRequestConfig = {
    headers: { "content-type": "multipart/form-data" },
    onUploadProgress: progressCallback,
    validateStatus: (_status) => true, //define HTTP code(s) that should throw an error (return false)
    signal: controller.signal, //abort controller for user to cancel upload
  };

  try {
    return await axios.post("/api/file/upload", formData, config);
  } catch (e) {
    //axios rejects the promise if the response is an error. Just pass the response data through
    if (e.name === "CanceledError") {
      return { status: 499, data: "Client Closed Request" } as AxiosResponse;
    }
    return { status: 500, data: e.message } as AxiosResponse;
  }
}

/**
 * Calls api endpoint to deletes a file or folder recurisvely
 * @param path path with filename or folder to delete off the root PUBLIC_STATIC_DIR
 * @returns boolean if delete was successful
 */
export async function deleteFile(path: string): Promise<Response> {
  return (await fetch(`/api/file/delete?path=${encodeURIComponent(path)}`)) as Response;
}

/**
 * Calls api endpoint to rename file or folder
 * @param path the path directory off the root PUBLIC_STATIC_DIR
 * @param oldName current file name
 * @param newName new file name
 * @returns bool if rename was successful
 */
export async function renameFile(
  path: string,
  oldName: string,
  newName: string
): Promise<Response> {
  return (await fetch(
    `/api/file/rename?path=${encodeURIComponent(path)}&oldname=${encodeURIComponent(
      oldName
    )}&newname=${encodeURIComponent(newName)}`
  )) as Response;
}

/**
 * Calls the API endpoint to list files
 * @param path the path directory off the root PUBLIC_STATIC_DIR
 * @returns the json response containing array of file listing
 */
export async function listFiles(path: string): Promise<GISfile[]> {
  const res: Response = await fetch(`/api/file/list?path=${encodeURIComponent(path)}`);
  const jsondata = await res.json();
  return jsondata.data;
}
