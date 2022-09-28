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
    const res = await axios.post("api/file/upload", formData, config);
    return res;
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
 * @param filename filename or folder to delete
 * @returns boolean if delete was successful
 */
export async function deleteFile(filename: string): Promise<Response> {
  const res: Response = await fetch(`api/file/delete?name=${filename}`);
  return res;
}

/**
 * Calls api endpoint to rename file or folder
 * @param oldName current file name
 * @param newName new file name
 * @returns bool if rename was successful
 */
export async function renameFile(oldName: string, newName: string): Promise<Response> {
  const res: Response = await fetch(`api/file/rename?oldname=${oldName}&newname=${newName}`);
  return res;
}

/**
 * Calls the API endpoint to list files
 * @returns the json response containing array of file listing
 */
export async function listFiles(): Promise<GISfile[]> {
  const res: Response = await fetch("api/file/list");
  const jsondata = await res.json();
  return jsondata.data;
}
