/**
 * The Box download endpoint returns a newline-delimited progress stream rather than one JSON
 * response. Progress events update the UI as bytes arrive; the final success or error event
 * preserves the existing wrapped-response contract for callers.
 */
export async function boxGetFolderItems(
  missionId: number,
  itemId: string = "0"
): Promise<WrappedResponse<BoxItemsResponse>> {
  const res = await fetch(`/api/v1/file/boxGetFolderItems?missionId=${missionId}&itemId=${itemId}`);

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
  path: string,
  onProgress?: (progress: BoxDownloadProgress) => void
): Promise<WrappedResponse<void>> {
  const params = new URLSearchParams({ missionId: missionId.toString(), itemId, path });
  const res = await fetch(`/api/v1/file/boxDownloadFile?${params.toString()}`);

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

  if (!res.body || !res.headers.get("content-type")?.includes("application/x-ndjson")) {
    return (await res.json()) as WrappedResponse<void>;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let response: WrappedResponse<void> | null = null;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as BoxDownloadProgress | WrappedResponse<void>;
    if ("type" in event && event.type === "progress") {
      onProgress?.(event);
    } else if ("status" in event) {
      response = event;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    lines.forEach(processLine);
    if (done) break;
  }
  processLine(buffered);

  return response ?? { status: "error", message: "Download ended without a completion response" };
}

export type BoxDownloadProgress = {
  type: "progress";
  stage: "starting" | "downloading" | "extracting" | "moving" | "complete";
  fileName?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
};
