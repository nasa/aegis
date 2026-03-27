import { test as base, expect } from "@playwright/test";
import DB from "./db";

/**
 * Custom test fixture that cleans up leftover Playwright test data before each test.
 * This ensures retries start with a clean database state, preventing failures caused
 * by data left behind from a previous failed attempt.
 */
export const test = base.extend<{ cleanDb: void }>({
  cleanDb: [
    async ({}, use) => {
      const database = new DB();
      // Same cleanup as globalTeardown, but excludes the user itself (needed for auth)
      await database.executeQuery(`
        delete from poi_db where owner_id in (select id from app_user_db where username like '%Playwright%');
        delete from station_db where owner_id in (select id from app_user_db where username like '%Playwright%');
        delete from preset_db where owner_id in (select id from app_user_db where username like '%Playwright%');
        delete from rex_db where owner_id in (select id from app_user_db where username like '%Playwright%');
        delete from eva_db where owner_id in (select id from app_user_db where username like '%Playwright%');
      `);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
