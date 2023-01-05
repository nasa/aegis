import { Factory } from "@mikro-orm/seeder";
import { User } from "../../server/database/models/user.model";

export default class UserFactory extends Factory<User> {
  model = User;
  definition(): Object {
    return {
      username: "testAdmin",
      password: "superSecretPassword",
      email: "gaia@nasa.gov",
      permission: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
