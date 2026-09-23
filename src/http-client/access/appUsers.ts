import { checkResponse } from "http-client/helperResponse";

/**
 * Every identity that has signed in at least once. Pass `withPermissionsOnly` to narrow it to users with permissions.
 */
export async function getAppUsers(
  options: { search?: string; withPermissionsOnly?: boolean; userId?: number } = {}
): Promise<WrappedResponse<AppUserSummary[]>> {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.withPermissionsOnly) query.set("withPermissionsOnly", "true");
  if (options.userId !== undefined) query.set("userId", String(options.userId));

  const queryString = query.toString();
  return checkResponse<AppUserSummary[]>(
    await fetch(`/api/v1/appUsers${queryString ? `?${queryString}` : ""}`)
  );
}
