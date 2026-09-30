import { defineEntity, p } from "@mikro-orm/postgresql";
import * as bcrypt from "bcryptjs";

export const App_User_dbSchema = defineEntity({
  name: "App_User_db",
  properties: {
    id: p.integer().primary(),
    username: p.text(),
    password: p.text(),
    isSuperAdmin: p.boolean().nullable().default(false),
    isAdmin: p.boolean().nullable().default(false),
    permissionList: p.json<Permission[]>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class App_User_db extends App_User_dbSchema.class implements AppUser_db_type {
  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = bcrypt.hashSync(this.password, salt);
  }
}

App_User_dbSchema.setClass(App_User_db);

App_User_dbSchema.addHook("beforeCreate", async ({ entity }) =>
  (entity as App_User_db).beforeCreate()
);
