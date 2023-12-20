export async function boxGetFolderItems(
  itemId: string = "0"
): Promise<WrappedResponse<BoxItemsResponse>> {
  const res = await fetch(`/api/file/boxGetFolderItems?itemId=${itemId}`);

  const response: WrappedResponse<BoxItemsResponse> = await res.json();
  return response;
}

export async function boxDownloadFile(
  itemId: string,
  path: string
): Promise<WrappedResponse<void>> {
  const res = await fetch(`/api/file/boxDownloadFile?itemId=${itemId}&path=${path}`);

  const response: WrappedResponse<void> = await res.json();
  return response;
}
