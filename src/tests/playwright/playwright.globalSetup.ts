import DB from "./db";

/**
 * Playwright runs against the app with MOCK_USER enabled
 * Add the mock user to the app_user_db and then to the superUser group
 */
async function globalSetup(): Promise<void> {
  const database = new DB();

  const uupic = process.env.MOCK_USER_UUPIC || "1234";
  const auid = process.env.MOCK_USER_AUID || "narmstra";
  const displayName = process.env.MOCK_USER_DISPLAYNAME || "Armstrong, Neil A. (JSC-CB611)";

  await database.executeQuery(`
    insert into "app_user_db" ("uupic", "auid", "display_name", "is_system", "last_login_at")
    values ('${uupic}', '${auid}', '${displayName}', false, now())
    on conflict ("uupic") do nothing
  `);

  await database.executeQuery(`
    insert into "user_group_member_db" ("group_id", "user_id", "created_at", "updated_at")
    select ug.id, au.id, now(), now()
    from "user_group_db" ug
    cross join "app_user_db" au
    where ug.name = 'superUser' and au.uupic = '${uupic}'
    on conflict ("group_id", "user_id") do nothing
  `);
}

export default globalSetup;
