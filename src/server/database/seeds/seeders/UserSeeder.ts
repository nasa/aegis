import type { EntityManager, Dictionary } from "@mikro-orm/postgresql";
import { Seeder } from "@mikro-orm/seeder";

import { App_User_db, User_Group_db, User_Group_Member_db } from "../../models/_allModels";
import { SUPER_USER_GROUP_NAME } from "utils/permissionLevels";

/**
 * Local-development only. `migration:fresh` would otherwise leave the superUser group empty and
 * nobody able to administer anything. Seeds the mock Launchpad identity as a super user.
 *
 * The Public row and the superUser group itself come from the migration, since both are required
 * in every environment.
 */
export class UserSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    if (process.env.NODE_ENV === "production") return;

    const uupic = process.env.MOCK_USER_UUPIC || "1234";

    const existing = await em.findOne(App_User_db, { uupic });
    const mockUser =
      existing ??
      em.create(App_User_db, {
        uupic,
        auid: process.env.MOCK_USER_AUID || "narmstra",
        displayName: process.env.MOCK_USER_DISPLAYNAME || "Armstrong, Neil A. (JSC-CB611)",
        isSystem: false,
        lastLoginAt: new Date(),
      });

    await em.flush();

    const superUserGroup = await em.findOne(User_Group_db, { name: SUPER_USER_GROUP_NAME });
    if (superUserGroup) {
      const alreadyMember = await em.findOne(User_Group_Member_db, {
        groupId: superUserGroup.id,
        userId: mockUser.id,
      });
      if (!alreadyMember) {
        em.create(User_Group_Member_db, {
          groupId: superUserGroup.id,
          userId: mockUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    context.mockSuperUser = mockUser;
  }
}
