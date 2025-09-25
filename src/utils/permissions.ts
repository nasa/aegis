import { globalValues } from "server/express/global";

/**
 * Checks if a user has a given permission for a given mission.
 * @param missionId
 * @param permission
 * @param user
 * @returns
 */
export const hasPerms = ({
  missionId,
  permission,
  appUser,
  emssToken,
}: {
  missionId: number;
  permission: keyof Permission["permissions"];
  appUser: AppUser;
  emssToken?: string;
}): boolean => {
  // check the EMSS token. This overrides and grants them access to everything
  if (emssTokenIsValid(emssToken)) return true;

  // if no user session then no permissions for anything
  if (!appUser) return false;

  if (appUser.isSuperAdmin) return true; //super user always has perms
  //check if mission is in the list and if the permission matches
  const permList = appUser.permissionList;
  if (permList?.some((p) => p.missionId === missionId && p.permissions[permission])) {
    return true;
  }

  return false;
};

export const emssTokenIsValid = (emssToken: string): boolean => {
  return globalValues.isEmssApiEnabled && emssToken && emssToken === process.env.EMSS_TOKEN;
};
