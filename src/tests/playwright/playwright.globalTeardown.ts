import DB from "./db";

async function playwrightGlobalTeardown(): Promise<void> {
  // Cleanup any test records just in-case. If the test succeeds it will delete itself, but if it fails it could leave behind test data.
  // In the pipeline this isn't a concern because it uses a temporary DB that only exists on the runner
  // but locally it can leave behind test data.
  const sql = `delete from poi_db where owner_id in (select id from app_user_db where username like '%Playwright%' );
  delete from station_db where owner_id in (select id from app_user_db where username like '%Playwright%' );
  delete from preset_db where owner_id in (select id from app_user_db where username like '%Playwright%' );
  delete from rex_db where owner_id in (select id from app_user_db where username like '%Playwright%' );
  delete from eva_db where owner_id in (select id from app_user_db where username like '%Playwright%' );
  delete from app_user_db where username like '%Playwright%';`;
  const database = new DB();
  await database.executeQuery(sql);
}

export default playwrightGlobalTeardown;
