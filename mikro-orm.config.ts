import { Options } from "@mikro-orm/core";
import { Mission } from "./server/database/models/mission.model";
import { User } from "./server/database/models/user.model";
import { Layer } from "./server/database/models/layer.model";
import { Preset } from "./server/database/models/preset.model";
import { Preset_History } from "./server/database/models/preset_history.model";
import { Poi } from "./server/database/models/poi.model";
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
  },
  seeder: {
    path: path.join(__dirname, "./server/database/seeds"), // path to the folder with seed files
  },
  entitiesTs: [Mission, User, Layer, Preset, Preset_History, Poi],
  entities: [Mission, User, Layer, Preset, Preset_History, Poi],
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  allowGlobalContext: process.env.NODE_ENV === "test",
};

export default config;
