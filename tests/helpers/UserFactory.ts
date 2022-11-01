import { Factory } from "@mikro-orm/seeder";
import { PermissionRole, User } from "../../server/database/models/user.model";

export default class UserFactory extends Factory<User> {
  model = User;
  definition(): Object {
    return new User("testAdmin", "superSecretPassword", "gaia@nasa.gov", PermissionRole.ADMIN);
  }
}
