import DB from "./db";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

async function globalSetup(): Promise<void> {
  const database = new DB();

  const username = `Playwright ${randomUUID()}`;
  process.env.PLAYWRIGHT_USERNAME = username;
  const salt = await bcrypt.genSalt();
  const saltedPwd = bcrypt.hashSync("playwrightpassword", salt);
  const sql = `
    INSERT INTO "app_user_db" (username, password, is_super_admin, created_at, updated_at)
    VALUES ($1, $2, true, $3, $3)
  `;
  await database.executeQuery(sql, [username, saltedPwd, new Date().toISOString()]);
}

export default globalSetup;
