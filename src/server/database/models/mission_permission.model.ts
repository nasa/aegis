import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * A single granted mission permission.
 * Either `userId` / `groupId` is set, enforced by a check
 * constraint in the migration alongside the partial unique indexes.
 */
export const Mission_Permission_dbSchema = defineEntity({
  name: "Mission_Permission_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    missionId: p.integer(),
    userId: p.integer().nullable(),
    groupId: p.integer().nullable(),
    level: p.text().$type<PermissionLevel>(),
    notes: p.text().nullable(),
    grantedBy: p.integer().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Mission_Permission_db
  extends Mission_Permission_dbSchema.class
  implements MissionPermission_db_type {}

Mission_Permission_dbSchema.setClass(Mission_Permission_db);
