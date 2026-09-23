import { isLaunchpadSuperUser, meetsPermLevel } from "./permissionsClient";

/**
 * Does the caller meet `required` on this mission?
 */
export const apiHasPerms = ({
  missionId,
  requiredPermLevel: required,
  user,
}: {
  missionId: number | null;
  requiredPermLevel: PermissionLevel;
  user: CurrentUser | undefined;
}): boolean => {
  let permLevel: PermissionLevel | null;
  if (!user) {
    permLevel = null;
  } else if (apiHasSuperUserOrToken(user)) {
    permLevel = "edit"; // machine-to-machine / NAMS super user: implicit edit everywhere
  } else {
    permLevel = user.permissions[missionId] ?? null;
  }
  return meetsPermLevel(permLevel, required);
};

/** Is the user have a name superUser or an EMSS token. Token is already validated at this point */
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
