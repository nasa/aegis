import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * Every Launchpad identity that has ever authenticated but has not been granted perms. Rows move to
 * `app_user_db` when granted anything, and move back when their last perm is removed.
 */
export const Known_User_dbSchema = defineEntity({
  name: "Known_User_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    uupic: p.text().unique(),
    auid: p.text(),
    displayName: p.text(),
    lastLoginAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Known_User_db extends Known_User_dbSchema.class implements KnownUser_db_type {}

Known_User_dbSchema.setClass(Known_User_db);
