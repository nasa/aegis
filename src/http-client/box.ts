export async function boxGetFolderItems(
  missionId: number,
  itemId: string = "0"
): Promise<WrappedResponse<BoxItemsResponse>> {
  const res = await fetch(`/api/v1/file/boxGetFolderItems?missionId=${missionId}&itemId=${itemId}`);

  const response: WrappedResponse<BoxItemsResponse> = await res.json();
  return response;
}

export async function boxDownloadFile(
  missionId: number,
  itemId: string,
  path: string
): Promise<WrappedResponse<void>> {
  const res = await fetch(
    `/api/v1/file/boxDownloadFile?missionId=${missionId}&itemId=${itemId}&path=${path}`
  );

  const response: WrappedResponse<void> = await res.json();
  return response;
}
