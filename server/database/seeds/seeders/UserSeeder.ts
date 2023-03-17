import { Seeder } from "@mikro-orm/seeder";
import { EntityManager, Dictionary } from "@mikro-orm/core";
import { User } from "../../models/user.model";

export class UserSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.user1 = em.create(User, {
      username: "admin",
      password: "admin",
      permission: "admin",
      email: "admin@nasa.gov",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.user2 = em.create(User, {
      username: "guest",
      password: "guest",
      permission: "guest",
      email: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
