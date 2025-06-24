/**
 * Checks if a user has a given permission for a given mission.
 * @param missionId
 * @param permission
 * @param user
 * @returns
 */
export const hasPerms = async ({
  missionId,
  permission,
  user,
  emssToken,
}: {
  missionId: number;
  permission: keyof Permission["permissions"];
  user: User;
  emssToken?: string;
}): Promise<boolean> => {
  // check the EMSS token. If it's valid, then the user has permissions
  if (emssToken && emssToken === process.env.EMSS_TOKEN) return true;

  // if no user session then no permissions for anything
  if (!user) return false;

  if (user.isSuperAdmin) return true; //super user always has perms
  //check if mission is in the list and if the permission matches
  const permList = user.permissionList;
  if (permList?.some((p) => p.missionId === missionId && p.permissions[permission])) {
    return true;
  }

  return false;
};

/**
 * Checks if a query is from EMSS software or an EMSS developer (superadmin).
 * @param permission
 * @param user
 * @returns
 */
export const hasEMSSPerms = ({ user, emssToken }: { user: User; emssToken?: string }): boolean => {
  // check the EMSS token. If it's valid, then the user has permissions
  if (emssToken && emssToken === process.env.EMSS_TOKEN) return true;

  // if no user session then no permissions for anything
  if (!user) return false;

  if (user.isSuperAdmin) return true; //super user always has perms

  return false;
};
