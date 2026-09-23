/**
 * Unwraps a `WrappedResponse` endpoint, turns non-200 status into a failure response.
 * Pass `alertErrorPrefix` to also show a browser alert on failure
 */
export async function checkResponse<T>(
  res: Response,
  alertErrorPrefix?: string
): Promise<WrappedResponse<T>> {
  if (res.status !== 200) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      /* response body is not JSON */
    }
    if (alertErrorPrefix) {
      alert(`${alertErrorPrefix} Please let the AEGIS developers know. Status ${errorMessage}`);
    }
    return { status: "error", message: errorMessage };
  }
  const response: WrappedResponse<T> = await res.json();
  return response;
}
