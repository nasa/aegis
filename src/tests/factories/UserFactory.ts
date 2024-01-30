import { Factory } from "@mikro-orm/seeder";
import { User_db } from "server/database/models/_allModels";

export default class UserFactory extends Factory<User_db> {
  model = User_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<User_db> {
    const user: Partial<User_db> = {
      username: "Jest testUser",
      password: "superSecretPassword",
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      beforeCreate: async () => {},
    };
    return user;
  }
}

export const createTestUser = (): User => {
  return {
    id: null,
    username: "Jest testUser",
    password: "superSecretPassword",
    isAdmin: false,
    isSuperAdmin: false,
    permissionList: [],
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
