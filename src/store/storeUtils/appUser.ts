import type { EntityData } from "@mikro-orm/postgresql";
import type { App_User_db } from "server/database/models/_allModels";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank app user
 * @param partialUser any fields that are to be overridden from default
 * @returns the generated user
 */
export const generateBlankAppUser = (partialUser?: Partial<AppUser>): AppUser => {
  const defaultNewUser: AppUser = {
    id: 0,
    username: "",
    password: "",
    isAdmin: false,
    isSuperAdmin: false,
    permissionList: [],
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
  return { ...defaultNewUser, ...partialUser };
};

/**
 * Converts db user fks to their uuid/id arrays
 * @param dbUsers an array of users in mikro db format
 * @returns an a converted array of users or a single user
 */
export function convertAppUsersTypeDbToStore(dbUsers: App_User_db[]): AppUser[] {
  const users: AppUser[] = [];
  for (const dbUser of dbUsers) {
    const convertedUser: AppUser = {
      id: dbUser.id,
      username: dbUser.username,
      password: dbUser.password,
      isAdmin: dbUser.isAdmin,
      isSuperAdmin: dbUser.isSuperAdmin,
      permissionList: dbUser.permissionList,
      updatedAt: dbUser.updatedAt.toISOString(),
      createdAt: dbUser.createdAt.toISOString(),
    };
    users.push(convertedUser);
  }
  return users;
}

/**
 * Converts users that come from the store into the db type
 * @param storeUsers
 * @returns
 */
export function convertAppUsersTypeStoreToDb(storeUsers: AppUser[]): EntityData<App_User_db>[] {
  const dbUsers: EntityData<App_User_db>[] = [];
  for (const storeUser of storeUsers) {
    const convertedRecord: EntityData<App_User_db> = {
      id: storeUser.id,
      username: storeUser.username,
      password: storeUser.password,
      isAdmin: storeUser.isAdmin,
      isSuperAdmin: storeUser.isSuperAdmin,
      permissionList: storeUser.permissionList,
      updatedAt: new Date(storeUser.updatedAt),
      createdAt: new Date(storeUser.createdAt),
    };
    dbUsers.push(convertedRecord);
  }
  return dbUsers;
}
