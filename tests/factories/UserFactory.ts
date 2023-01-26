import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { User as User_db } from "../../server/database/models/user.model";

export default class UserFactory extends Factory<User_db> {
  model = User_db;
  definition(): EntityData<User_db> {
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
