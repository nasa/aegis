import "reflect-metadata"; // required by @mikro-orm/decorators/legacy
import dotenv from "dotenv"; //needed to allow vitest to init Mikro in globalTeardown
dotenv.config({ override: true, quiet: true });

import { PostgreSqlDriver, defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { SeedManager } from "@mikro-orm/seeder";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import {
  App_User_db,
  MissionBackup_db,
  Station_db,
  Poi_db,
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
  Folder_db,
  Doc_Listing_db,
  Automerge_Native_db,
  EnvironmentConfig_db,
} from "./models/_allModels";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  dbName: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  driver: PostgreSqlDriver,
  password: process.env.DB_PASS,
  migrations: {
    path: path.join(__dirname, "./migrations"), // path to the folder with migrations
    snapshot: false,
  },
  seeder: {
    path: path.join(__dirname, "./seeds"), // path to the folder with seed files
  },
  entitiesTs: [
    App_User_db,
    MissionBackup_db,
    Station_db,
    Poi_db,
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
    Folder_db,
    Doc_Listing_db,
    Automerge_Native_db,
    EnvironmentConfig_db,
  ],
  entities: [
    App_User_db,
    MissionBackup_db,
    Station_db,
    Poi_db,
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
    Folder_db,
    Doc_Listing_db,
    Automerge_Native_db,
    EnvironmentConfig_db,
  ],
  metadataProvider: ReflectMetadataProvider,
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  extensions: [Migrator, SeedManager],
});
