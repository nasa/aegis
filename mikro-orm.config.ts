import dotenv from "dotenv"; //needed to allow jest to init Mikro in globalTeardown
dotenv.config({ override: true });

// The following 3 lines are needed to make the MikroORM 6.0.x import for the PostgreSqlDriver work in jest.
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import { PostgreSqlDriver, defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { SeedManager } from "@mikro-orm/seeder";
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
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  Traverse_db,
  Grid_db,
  STM_Rule_db,
} from "./src/server/database/models/_allModels";
import path from "path";

export default defineConfig({
  dbName: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: 5432, //default port
  driver: PostgreSqlDriver,
  password: process.env.DB_PASS,
  migrations: {
    path: path.join(__dirname, "./src/server/database/migrations"), // path to the folder with migrations
    snapshot: false,
  },
  seeder: {
    path: path.join(__dirname, "./src/server/database/seeds"), // path to the folder with seed files
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
    STM_Level1_db,
    STM_Level2_db,
    STM_Level3_db,
    Sublayer_db,
    Traverse_db,
    Grid_db,
    STM_Rule_db,
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
    STM_Level1_db,
    STM_Level2_db,
    STM_Level3_db,
    Sublayer_db,
    Traverse_db,
    Grid_db,
    STM_Rule_db,
  ],
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  allowGlobalContext: true,
  extensions: [Migrator, SeedManager],
});
