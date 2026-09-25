import { defineEntity, p } from "@mikro-orm/postgresql";

import { Mission_Permission_db as MissionPermissionEntity } from "./mission_permission.model";
import { User_Group_Member_db as UserGroupMemberEntity } from "./user_group_member.model";

/**
 * A named collection of users. A group can be granted missions, and its members inherit those
 * grants.
 */
export const User_Group_dbSchema = defineEntity({
  name: "User_Group_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    name: p.text().unique(),
    description: p.text().nullable(),
    members: () => p.oneToMany(UserGroupMemberEntity).mappedBy("groupId"),
    missionPermissions: () => p.oneToMany(MissionPermissionEntity).mappedBy("groupId"),
    createdAt: p.double().$type<number>(),
    updatedAt: p.double().$type<number>(),
    version: p.integer().version(),
  },
});

export class User_Group_db extends User_Group_dbSchema.class implements UserGroup {}

User_Group_dbSchema.setClass(User_Group_db);
