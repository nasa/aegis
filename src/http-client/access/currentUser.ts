import { fetchJsonWithAuth } from "packages/fetchFns";

/**
 * Access is resolved per-request on the server so that a permission change
 * takes effect on the caller's next request rather than at their next login.
 */
export async function getCurrentUserAndAccess(): Promise<
  (CurrentUser & { launchpadUser: LaunchpadUser }) | Error
> {
  const access = await fetchJsonWithAuth<CurrentUser>("/api/v1/user/current");
  if (access instanceof Error) return access;
  if (!access?.launchpadUser)
    return new Error("No launchpad user found in /api/v1/user/current response");
  // Re-type it so that callers do not have to account for LaunchpadUser being null
  return access as CurrentUser & { launchpadUser: LaunchpadUser };
}
