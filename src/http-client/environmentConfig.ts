/** Fetch all registered environment config entries. */
export async function getAllEnvironmentConfigs(): Promise<
  WrappedResponse<EnvironmentConfigData[]>
> {
  const res = await fetch("/api/v1/environmentConfig");
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<EnvironmentConfigData[]>>;
}

/** Fetch a single environment config entry by key. */
export async function getEnvironmentConfig(
  key: string
): Promise<WrappedResponse<EnvironmentConfigData>> {
  const res = await fetch(`/api/v1/environmentConfig/${encodeURIComponent(key)}`);
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<EnvironmentConfigData>>;
}

/**
 * Set the value for a environment config entry.
 */
export async function setEnvironmentConfigValue(
  key: string,
  value: string | null // null clears the value
): Promise<WrappedResponse<EnvironmentConfigData>> {
  const res = await fetch(`/api/v1/environmentConfig/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (res.status !== 200) {
    return { status: "error", message: await readErrorMessage(res) };
  }
  return res.json() as Promise<WrappedResponse<EnvironmentConfigData>>;
}

async function readErrorMessage(res: Response): Promise<string> {
  let errorMessage = `${res.status} ${res.statusText}`;
  try {
    const errorBody = await res.json();
    if (errorBody?.message) errorMessage = errorBody.message;
  } catch {
    /* response body is not JSON */
  }
  return errorMessage;
}
