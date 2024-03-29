import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { User_db } from "server/database/models/_allModels";
import { convertUsersTypeStoreToDb, generateBlankUser } from "store/storeUtils/user";

export default class UserFactory extends Factory<User_db> {
  model = User_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<EntityData<User_db>> {
    const storeUser = generateBlankUser({
      username: "Jest testUser",
      password: "superSecretPassword",
    });
    delete storeUser.id; // remove id in order to upsert
    const user = convertUsersTypeStoreToDb([storeUser])[0];
    return user;
  }
}
