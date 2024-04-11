import DB from "./db";
import * as bcrypt from "bcryptjs";

async function globalSetup(): Promise<void> {
  const database = new DB();
  // insert a username/password for testing directly to db (not using mikro)
  const username = "Playwright admin";
  const salt = await bcrypt.genSalt();
  const saltedPwd = bcrypt.hashSync("playwrightpassword", salt);
  const sql = `insert into "user_db" (username, password, is_super_admin, created_at, updated_at) values ('${username}', '${saltedPwd}', true, '${new Date(Date.now()).toISOString()}', '${new Date(Date.now()).toISOString()}')`;
  await database.executeQuery(sql);
}

export default globalSetup;
