import DB from "./db";
import { rm } from "node:fs/promises";

async function playwrightGlobalTeardown(): Promise<void> {
  // Clean up the Playwright test user created during global setup.
  const database = new DB();
  if (process.env.PLAYWRIGHT_USERNAME) {
    await database.executeQuery("delete from app_user_db where username = $1", [
      process.env.PLAYWRIGHT_USERNAME,
    ]);
  }
  if (process.env.PLAYWRIGHT_AUTH_FILE) {
    await rm(process.env.PLAYWRIGHT_AUTH_FILE, { force: true });
  }
}

export default playwrightGlobalTeardown;
