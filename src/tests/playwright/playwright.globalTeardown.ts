import DB from "./db";

async function playwrightGlobalTeardown(): Promise<void> {
  // cleanup any test records just in-case.
  const sql = `delete from poi_db where owner_id in (select id from user_db where username like '%Playwright%' );
  delete from station_db where owner_id in (select id from user_db where username like '%Playwright%' );
  delete from preset_db where owner_id in (select id from user_db where username like '%Playwright%' );
  delete from eva_db where owner_id in (select id from user_db where username like '%Playwright%' );
  delete from rex_db where owner_id in (select id from user_db where username like '%Playwright%' );
  delete from user_db where username like '%Playwright%';`;
  const database = new DB();
  await database.executeQuery(sql);
}

export default playwrightGlobalTeardown;
