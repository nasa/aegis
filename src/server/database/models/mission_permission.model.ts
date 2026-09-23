import { defineEntity, p } from "@mikro-orm/postgresql";

import { App_User_db as AppUserEntity } from "./app_user.model";
import { Doc_Listing_db as DocListingEntity } from "./doc_listing.model";
import { User_Group_db as UserGroupEntity } from "./user_group.model";

/**
 * A single granted mission permission.
 * Either `userId` / `groupId` is set, enforced by a check
 * constraint in the migration alongside the partial unique indexes.
 */
export const Mission_Permission_dbSchema = defineEntity({
  name: "Mission_Permission_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    missionId: () =>
      p
        .manyToOne(DocListingEntity)
        .mapToPk()
        .fieldName("mission_id")
        .joinColumn("mission_id")
        .deleteRule("cascade"),
    userId: () =>
      p
        .manyToOne(AppUserEntity)
        .mapToPk()
        .nullable()
        .fieldName("user_id")
        .joinColumn("user_id")
        .deleteRule("cascade"),
    groupId: () =>
      p
        .manyToOne(UserGroupEntity)
        .mapToPk()
        .nullable()
        .fieldName("group_id")
        .joinColumn("group_id")
        .deleteRule("cascade"),
    permLevel: p.text().$type<PermissionLevel>(),
    notes: p.text().nullable(),
    // Audit field: who issued the grant. `no action` rather than `cascade`, so revoking the
    // grantor's own access can never silently delete the grants they handed out. App user rows are
    // never deleted, so the reference cannot dangle.
    grantedBy: () =>
      p
        .manyToOne(AppUserEntity)
        .mapToPk()
        .nullable()
        .fieldName("granted_by")
        .joinColumn("granted_by")
        .deleteRule("no action"),
    createdAt: p.double().$type<number>(),
    updatedAt: p.double().$type<number>(),
    version: p.integer().version(),
  },
});

export class Mission_Permission_db
  extends Mission_Permission_dbSchema.class
  implements MissionPermission {}

Mission_Permission_dbSchema.setClass(Mission_Permission_db);
