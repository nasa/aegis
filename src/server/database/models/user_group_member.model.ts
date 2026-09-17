import { defineEntity, p } from "@mikro-orm/postgresql";

/** Join table between managed users and groups. */
export const User_Group_Member_dbSchema = defineEntity({
  name: "User_Group_Member_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    groupId: p.integer(),
    userId: p.integer(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class User_Group_Member_db
  extends User_Group_Member_dbSchema.class
  implements UserGroupMember_db_type {}

User_Group_Member_dbSchema.setClass(User_Group_Member_db);
