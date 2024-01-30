/**
 * Checks if a user has a given permission for a given mission.
 * @param missionId
 * @param permission
 * @param user
 * @returns
 */
export const hasPerms = async (
  missionId: number,
  permission: keyof Permission["permissions"],
  user: User
): Promise<boolean> => {
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
