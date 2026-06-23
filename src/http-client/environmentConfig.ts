export async function getEnvironmentConfig(): Promise<WrappedResponse<EnvironmentConfigData>> {
  const res = await fetch("/api/v1/environmentConfig");
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
  return res.json() as Promise<WrappedResponse<EnvironmentConfigData>>;
}

export async function setEnvironmentConfigOverride(
  urlOverride: string | null
): Promise<WrappedResponse<EnvironmentConfigData>> {
  const res = await fetch("/api/v1/environmentConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urlOverride }),
  });
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
  return res.json() as Promise<WrappedResponse<EnvironmentConfigData>>;
}
