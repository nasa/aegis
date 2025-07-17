import { App_User_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";
import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank user
 * @param partialUser any fields that are to be overriden from default
 * @returns the generated user
 */
export const generateBlankUser = (partialUser?: Partial<AppUser>): AppUser => {
  const defaultNewUser: AppUser = {
    id: null,
    username: "",
    password: "",
    isAdmin: false,
    isSuperAdmin: false,
    permissionList: null,
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
export function convertUsersTypeDbToStore(dbUsers: App_User_db[]): AppUser[] {
  const users: AppUser[] = [];
  for (const dbUser of dbUsers) {
    const convertedUser: AppUser = {
      ...dbUser,
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
export function convertUsersTypeStoreToDb(storeUsers: AppUser[]): EntityData<App_User_db>[] {
  const dbUsers: EntityData<App_User_db>[] = [];
  for (const storeUser of storeUsers) {
    const convertedRecord: EntityData<App_User_db> = {
      ...storeUser,
      updatedAt: new Date(storeUser.updatedAt),
      createdAt: new Date(storeUser.createdAt),
    };
    dbUsers.push(convertedRecord);
  }
  return dbUsers;
}
