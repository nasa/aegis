import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * A user that has permissions assigned either through a group or directly.
 * Also holds the single reserved Public row
 */
export const App_User_dbSchema = defineEntity({
  name: "App_User_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    uupic: p.text().unique(),
    auid: p.text(),
    displayName: p.text(),
    isSystem: p.boolean().default(false),
    lastLoginAt: p.datetime(3).nullable(),
    version: p.integer().version(),
  },
});

export class App_User_db extends App_User_dbSchema.class implements AppUser_db_type {}

App_User_dbSchema.setClass(App_User_db);
