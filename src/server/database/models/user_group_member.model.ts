import { defineEntity, p } from "@mikro-orm/postgresql";

import { App_User_db as AppUserEntity } from "./app_user.model";
import { User_Group_db as UserGroupEntity } from "./user_group.model";

/**
 * Join table between app users and groups.
 */
export const User_Group_Member_dbSchema = defineEntity({
  name: "User_Group_Member_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    groupId: () =>
      p
        .manyToOne(UserGroupEntity)
        .mapToPk()
        .fieldName("group_id")
        .joinColumn("group_id")
        .deleteRule("cascade"),
    userId: () =>
      p
        .manyToOne(AppUserEntity)
        .mapToPk()
        .fieldName("user_id")
        .joinColumn("user_id")
        .deleteRule("cascade"),
    createdAt: p.double().$type<number>(),
    updatedAt: p.double().$type<number>(),
    version: p.integer().version(),
  },
});

export class User_Group_Member_db
  extends User_Group_Member_dbSchema.class
  implements UserGroupMember {}

User_Group_Member_dbSchema.setClass(User_Group_Member_db);
