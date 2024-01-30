import { Seeder } from "@mikro-orm/seeder";
import { EntityManager, Dictionary } from "@mikro-orm/core";
import { User_db } from "../../models/_allModels";

export class UserSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.user1 = em.create(User_db, {
      username: "admin",
      password: "admin",
      permissionList: null,
      isAdmin: null,
      isSuperAdmin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.user2 = em.create(User_db, {
      username: "guest",
      password: "guest",
      isAdmin: false,
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
