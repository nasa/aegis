import { MikroORM } from "@mikro-orm/core";
import config from "../../server/database/mikro-orm.config";

const globalTeardown = async (): Promise<void> => {
  // clear the database to remove any leftover test data from previous runs
  const orm = await MikroORM.init(config);
  const em = orm.em.fork();

  // run a custom query using a sql string to delete all previous test data from the database
  const sql = `delete from "folder_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "layer_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "sublayer_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "preset_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "action_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "poi_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "station_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "traverse_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "eva_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "rex_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "stm_level3_db" where level2_uuid in (select uuid from "stm_level2_db" where uuid in (select uuid from "stm_level1_db" where mission_id in (select id from "mission_db" where name like '%Jest%' )));
  delete from "stm_level2_db" where level1_uuid in (select uuid from "stm_level1_db" where mission_id in (select id from "mission_db" where name like '%Jest%' ));
  delete from "stm_level1_db" where mission_id in (select id from "mission_db" where name like '%Jest%' );
  delete from "mission_db" where name like '%Jest%';
  delete from "user_db" where username like '%Jest%';`;
  await em.getConnection().execute(sql);

  // close the connection to the database
  await orm.close();
};

export default globalTeardown;
