import { defineEntity, p } from "@mikro-orm/postgresql";

import { Mission_Permission_db as MissionPermissionEntity } from "./mission_permission.model";
import { User_Group_Member_db as UserGroupMemberEntity } from "./user_group_member.model";

/**
 * Every Launchpad identity that has authenticated at least once, plus the single reserved Public
 * user.
 */
export const App_User_dbSchema = defineEntity({
  name: "App_User_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    uupic: p.text().unique(),
    auid: p.text(),
    displayName: p.text(),
    isSystem: p.boolean().default(false),
    lastLoginAt: p.double().$type<number>(),
    memberships: () => p.oneToMany(UserGroupMemberEntity).mappedBy("userId"),
    missionPermissions: () => p.oneToMany(MissionPermissionEntity).mappedBy("userId"),
    version: p.integer().version(),
  },
});

export class App_User_db extends App_User_dbSchema.class implements AppUser {}

App_User_dbSchema.setClass(App_User_db);
