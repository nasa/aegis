export async function clientFetchWithTimeout(
  url: string,
  requestInit?: RequestInit,
  timeout: number = 8000 /** Milliseconds to timeout */
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(url, {
    ...requestInit,
    method: requestInit?.method || "GET",

    signal: controller.signal,
  } as RequestInit);

  clearTimeout(id);
  return response;
}

/** Client errors other than timeouts, conflicts, and throttling will fail the same way again. */
export const isRetryableStatus = (httpStatus: number | undefined): boolean =>
  !httpStatus || httpStatus >= 500 || [408, 409, 429].includes(httpStatus);
