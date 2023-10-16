import { Options } from "@mikro-orm/core";

import {
  User_db,
  Mission_db,
  Station_db,
  Poi_db,
  Log_db,
  Action_db,
  Eva_db,
  Layer_db,
  Preset_db,
  Rex_db,
  STM_Objective_db,
  STM_Goal_db,
  STM_Investigation_db,
  Sublayer_db,
  Traverse_db,
} from "./server/database/models/_allModels";
import path from "path";

const port = parseInt(process.env.AEGIS_DB_PORT);
const config: Options = {
  dbName: process.env.AEGIS_DB_NAME,
  host: process.env.AEGIS_DB_HOST,
  port,
  type: "postgresql",
  password: process.env.AEGIS_DB_PASS,
  migrations: {
    path: path.join(__dirname, "./server/database/migrations"), // path to the folder with migrations
    snapshot: false,
  },
  seeder: {
    path: path.join(__dirname, "./server/database/seeds"), // path to the folder with seed files
  },
  entitiesTs: [
    User_db,
    Mission_db,
    Station_db,
    Poi_db,
    Log_db,
    Action_db,
    Eva_db,
    Layer_db,
    Preset_db,
    Rex_db,
    STM_Objective_db,
    STM_Goal_db,
    STM_Investigation_db,
    Sublayer_db,
    Traverse_db,
  ],
  entities: [
    User_db,
    Mission_db,
    Station_db,
    Poi_db,
    Log_db,
    Action_db,
    Eva_db,
    Layer_db,
    Preset_db,
    Rex_db,
    STM_Objective_db,
    STM_Goal_db,
    STM_Investigation_db,
    Sublayer_db,
    Traverse_db,
  ],
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  allowGlobalContext: true,
};

export default config;
