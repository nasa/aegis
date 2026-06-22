import DB from "./db";

async function playwrightGlobalTeardown(): Promise<void> {
  // Clean up the Playwright test user created during global setup.
  const database = new DB();
  await database.executeQuery(`delete from app_user_db where username like '%Playwright%';`);
}

export default playwrightGlobalTeardown;
