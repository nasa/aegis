import { Seeder } from "@mikro-orm/seeder";
import { EntityManager, Dictionary } from "@mikro-orm/core";
import { User } from "../../models/user.model";

export class UserSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.user1 = em.create(User, {
      username: "admin",
      password: "admin",
      permissionList: null,
      isAdmin: null,
      isSuperAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.user2 = em.create(User, {
      username: "guest",
      password: "guest",
      permissionList: [
        {
          missionId: context.mission1.id,
          permissions: {
            view: true,
            edit: false,
          },
        },
      ],
      isAdmin: false,
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
