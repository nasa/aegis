import { checkResponse } from "http-client/helperResponse";

/** Fetch all registered environment config entries. */
export async function getAllEnvironmentConfigs(): Promise<
  WrappedResponse<EnvironmentConfigData[]>
> {
  return checkResponse<EnvironmentConfigData[]>(await fetch("/api/v1/environmentConfig"));
}

/** Fetch a single environment config entry by key. */
export async function getEnvironmentConfig(
  key: string
): Promise<WrappedResponse<EnvironmentConfigData>> {
  return checkResponse<EnvironmentConfigData>(
    await fetch(`/api/v1/environmentConfig/${encodeURIComponent(key)}`)
  );
}

/**
 * Set the value for a environment config entry.
 */
export async function setEnvironmentConfigValue(
  key: string,
  value: string | null // null clears the value
): Promise<WrappedResponse<EnvironmentConfigData>> {
  return checkResponse<EnvironmentConfigData>(
    await fetch(`/api/v1/environmentConfig/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    })
  );
}
