import DB from "./db";
import * as bcrypt from "bcryptjs";

async function globalSetup(): Promise<void> {
  const database = new DB();

  const username = "Playwright admin";
  const salt = await bcrypt.genSalt();
  const saltedPwd = bcrypt.hashSync("playwrightpassword", salt);
  const sql = `
    INSERT INTO "user_db" (username, password, is_super_admin, created_at, updated_at)
    VALUES ('${username}', '${saltedPwd}', true, '${new Date().toISOString()}', '${new Date().toISOString()}')
  `;
  await database.executeQuery(sql);
}

export default globalSetup;
