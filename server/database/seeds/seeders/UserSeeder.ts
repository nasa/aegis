import { Seeder } from "@mikro-orm/seeder";
import { EntityManager } from "@mikro-orm/core";
import { PermissionRole, User } from "../../models/user.model";

export class UserSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    em.create(User, {
      username: "admin",
      password: "admin",
      permission: PermissionRole.ADMIN,
      email: "admin@nasa.gov",
    });
  }
}
