import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { App_User_db } from "server/database/models/_allModels";
import { convertAppUsersTypeStoreToDb, generateBlankAppUser } from "store/storeUtils/appUser";

export default class AppUserFactory extends Factory<App_User_db> {
  model = App_User_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<EntityData<App_User_db>> {
    const storeUser = generateBlankAppUser({
      username: "Jest testAppUser",
      password: "superSecretPassword",
    });
    delete storeUser.id; // remove id in order to upsert
    const user = convertAppUsersTypeStoreToDb([storeUser])[0];
    return user;
  }
}
