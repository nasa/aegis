/**
 * Vitest global setup/teardown
 * globalSetup runs once before all test files, and the returned teardown runs after all tests complete.
 */
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../server/database/mikro-orm.config";

export async function setup(): Promise<void> {
  console.log("\n[vitest] Global setup complete");
}

export async function teardown(): Promise<void> {
  // clear the database to remove any leftover test data from previous runs
  const orm = await MikroORM.init(config);
  const em = orm.em.fork();

  const sql = `delete from "folder_db" where name like '%Vitest%';
  delete from "layer_db" where name like '%Vitest%';
  delete from "sublayer_db" where name like '%Vitest%';
  delete from "preset_db" where name like '%Vitest%';
  delete from "action_db" where name like '%Vitest%';
  delete from "poi_db" where name like '%Vitest%';
  delete from "station_db" where name like '%Vitest%';
  delete from "traverse_db" where name like '%Vitest%';
  delete from "eva_db" where name like '%Vitest%';
  delete from "rex_db" where name like '%Vitest%';
  delete from "stm_level3_db" where name like '%Vitest%';
  delete from "stm_level2_db" where name like '%Vitest%';
  delete from "stm_level1_db" where name like '%Vitest%';
  delete from "doc_listing_db" where automerge_url like '%Vitest%';
  delete from "mission_db" where name like '%Vitest%';
  delete from "app_user_db" where username like '%Vitest%';`;
  await em.getConnection().execute(sql);

  await orm.close();
  console.log("[vitest] Global teardown complete - test data cleaned");
}
