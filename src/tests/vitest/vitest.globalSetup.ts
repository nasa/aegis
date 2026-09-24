/**
 * Vitest global setup/teardown
 * globalSetup runs once before all test files, and the returned teardown runs after all tests complete.
 */
import type { EntityManager } from "@mikro-orm/postgresql";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../server/database/mikro-orm.config";

/**
 * Remove every row the test suite is responsible for.
 *
 * Matching is case-insensitive (ilike) so a fixture that spells the marker "vitest" rather
 * than "Vitest" is still swept up.
 */
async function deleteTestData(em: EntityManager): Promise<void> {
  const sql = `delete from "folder_db" where name ilike '%vitest%';
  delete from "sublayer_db" where name ilike '%vitest%';
  delete from "layer_db" where name ilike '%vitest%';
  delete from "preset_db" where name ilike '%vitest%';
  delete from "action_db" where name ilike '%vitest%';
  delete from "poi_db" where name ilike '%vitest%';
  delete from "station_db" where name ilike '%vitest%';
  delete from "traverse_db" where name ilike '%vitest%';
  delete from "eva_db" where name ilike '%vitest%';
  delete from "rex_db" where name ilike '%vitest%';
  delete from "stm_level3_db" where name ilike '%vitest%';
  delete from "stm_level2_db" where name ilike '%vitest%';
  delete from "stm_level1_db" where name ilike '%vitest%';
  delete from "doc_listing_db" where automerge_url ilike '%vitest%';
  delete from "mission_permission_db" where notes ilike '%vitest%';
  delete from "user_group_member_db" where user_id in (select id from "app_user_db" where uupic ilike 'vitest-%');
  delete from "user_group_db" where name ilike 'vitest-%';
  delete from "app_user_db" where uupic ilike 'vitest-%';`;
  await em.getConnection().execute(sql);

  // A doc listing with no url is always test residue: every production writer sets one before
  // the row is committed, so a null means a fixture created the row and then died before its
  // afterAll ran. There is no marker left to match on, so the null itself is the signal.
  // The grants referencing it go with it via the cascading foreign key.
  const orphanedDocListings = await em
    .getConnection()
    .execute<
      { mission_id: number }[]
    >(`delete from "doc_listing_db" where automerge_url is null returning mission_id;`);
  if (orphanedDocListings.length > 0) {
    const missionIds = orphanedDocListings.map((row) => row.mission_id).join(", ");
    console.log(
      `[vitest] Removed ${orphanedDocListings.length} doc listing(s) with no automerge url: ${missionIds}`
    );
  }
}

/**
 * Clean before as well as after. A run that is cut short — a failing test that aborts the run, a
 * hook timeout, or Ctrl+C — never reaches teardown, so its rows would otherwise accumulate in
 * the shared database indefinitely.
 */
export async function setup(): Promise<void> {
  const orm = await MikroORM.init(config);
  try {
    await deleteTestData(orm.em.fork());
  } finally {
    await orm.close();
  }
  console.log("\n[vitest] Global setup complete - leftover test data cleaned");
}

export async function teardown(): Promise<void> {
  const orm = await MikroORM.init(config);
  try {
    await deleteTestData(orm.em.fork());
  } finally {
    await orm.close();
  }
  console.log("[vitest] Global teardown complete - test data cleaned");
}
