import { isLoggedIn } from "http-client/login";

/**
 * Checks if a user has a given permission for a given mission.
 *  If no user is passed in, then this function will hit the
 *  isLoggedIn api endpoint to retrieve the user defined in the session
 * @param missionId
 * @param permission
 * @param userProp
 * @returns
 */
export const hasPerms = async (
  missionId: number,
  permission: keyof Permission["permissions"],
  userProp?: User
): Promise<boolean> => {
  let user = userProp;
  if (!user) {
    const loginRes = await isLoggedIn();
    user = loginRes.data.user;
  }
  if (user) {
    if (user.isSuperAdmin) return true; //super user always has perms
    //check if mission is in the list and if the permission matches
    const permList = user.permissionList;
    if (permList?.some((p) => p.missionId === missionId && p.permissions[permission])) {
      return true;
    }
  }
  return false;
};
