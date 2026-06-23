/**
 * Creates a new Maestro document.
 * Injects the EMSS_TOKEN server-side so it is never exposed to the client.
 */
export async function maestroCreateDoc(
  request: MaestroCreateDocRequest
): Promise<MaestroCreateDocResponse> {
  try {
    const res = await fetch(`/api/v1/maestro/doc/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (res.status === 409) {
      return {
        status: "error",
        message: "This mission ID is already linked to a Maestro document.",
      };
    }

    if (!res.ok) {
      let errorMessage = `${res.status} ${res.statusText}`;
      try {
        const errorBody = await res.json();
        if (errorBody?.error) errorMessage = errorBody.error;
        else if (errorBody?.message) errorMessage = errorBody.message;
      } catch {
        // response body is not JSON
      }
      return { status: "error", message: errorMessage };
    }

    const data = await res.json();
    return { status: "success", data };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error contacting Maestro server.",
    };
  }
}
