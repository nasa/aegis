import { Factory } from "@mikro-orm/seeder";
import { User } from "../../server/database/models/user.model";

export default class UserFactory extends Factory<User> {
  model = User;
  definition(): Object {
    return new User("testAdmin", "superSecretPassword", "gaia@nasa.gov", "admin");
  }
}
