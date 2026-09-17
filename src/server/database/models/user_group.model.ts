import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * A named collection of users. A group can be granted missions, and its members inherit those
 * grants. The reserved `superUser` group is flagged `isSystem` and cannot be renamed or deleted.
 */
export const User_Group_dbSchema = defineEntity({
  name: "User_Group_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    name: p.text().unique(),
    description: p.text().nullable(),
    notes: p.text().nullable(),
    isSystem: p.boolean().default(false),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class User_Group_db extends User_Group_dbSchema.class implements UserGroup_db_type {}

User_Group_dbSchema.setClass(User_Group_db);
