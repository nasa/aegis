import { prefixUrl } from "utils/basePath";

export async function boxGetFolderItems(
  missionId: number,
  itemId: string = "0"
): Promise<WrappedResponse<BoxItemsResponse>> {
  const res = await fetch(
    prefixUrl(`/api/v1/file/boxGetFolderItems?missionId=${missionId}&itemId=${itemId}`)
  );

  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<BoxItemsResponse> = await res.json();
  return response;
}

export async function boxDownloadFile(
  missionId: number,
  itemId: string,
  path: string
): Promise<WrappedResponse<void>> {
  const res = await fetch(
    prefixUrl(`/api/v1/file/boxDownloadFile?missionId=${missionId}&itemId=${itemId}&path=${path}`)
  );

  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<void> = await res.json();
  return response;
}
