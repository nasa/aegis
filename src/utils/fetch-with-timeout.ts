export async function clientFetchWithTimeout(
  url: string,
  requestInit?: RequestInit,
  timeout: number = 20_000 /** Milliseconds to timeout */
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const externalSignal = requestInit?.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...requestInit,
      method: requestInit?.method || "GET",
      signal: controller.signal,
    } as RequestInit);
  } finally {
    clearTimeout(id);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
