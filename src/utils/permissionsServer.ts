import { isLaunchpadSuperUser, meetsPermLevel } from "./permissionsClient";

/**
 * Does the caller meet `required` on this mission?
 */
export const apiHasPerms = ({
  missionId,
  requiredPermLevel: required,
  user,
}: {
  missionId: number;
  requiredPermLevel: PermissionLevel;
  user: CurrentUser | undefined;
}): boolean => {
  let permLevel: PermissionLevel | null;
  if (!user) {
    permLevel = null;
  } else if (apiHasSuperUserOrToken(user)) {
    permLevel = "edit"; // machine-to-machine / NAMS super user: implicit edit everywhere
  } else {
    // Keyed by string, so the lookup has to be too.
    permLevel = user.permissions[String(missionId)] ?? null;
  }
  return meetsPermLevel(permLevel, required);
};

/**
 * Does the caller hold a NAMS super-user role, or a valid EMSS machine-to-machine token?
 * The token is already validated at this point
 */
export const apiHasSuperUserOrToken = (user: CurrentUser | undefined): boolean =>
  !!user && (user.isEmssToken || isLaunchpadSuperUser(user.launchpadUser));

/**
 * Every mission the caller can reach at `required` or better. A super user holds no grant rows,
 * so this returns empty for them and callers must handle that case separately.
 */
export const missionIdsAtLevel = (
  user: CurrentUser | undefined,
  required: PermissionLevel
): number[] => {
  if (!user) return [];
  return Object.entries(user.permissions)
    .filter(([, level]) => meetsPermLevel(level, required))
    .map(([missionId]) => Number(missionId));
};

/** The identifier used in server log lines, now that there is no username. */
export const logUsername = (user: CurrentUser | undefined): string | undefined =>
  user?.appUser?.auid ?? user?.launchpadUser?.auid;

export const emssTokenIsValid = (emssToken: string): boolean =>
  !!emssToken && emssToken === process.env.EMSS_TOKEN;
