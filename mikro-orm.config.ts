import { Options } from "@mikro-orm/core";
import { Mission } from "./server/database/models/mission.model";
import { User } from "./server/database/models/user.model";
import { Layer } from "./server/database/models/layer.model";
import { Preset } from "./server/database/models/preset.model";
import { STM_Objective } from "./server/database/models/stm_objective.model";
import { STM_Goal } from "./server/database/models/stm_goal.model";
import { STM_Investigation } from "./server/database/models/stm_investigation.model";
import { Poi } from "./server/database/models/poi.model";
import { Action } from "./server/database/models/action.model";
import { Traverse } from "./server/database/models/traverse.model";
import { Eva } from "./server/database/models/eva.model";
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
  entitiesTs: [
    Mission,
    User,
    Layer,
    Preset,
    STM_Objective,
    STM_Goal,
    STM_Investigation,
    Poi,
    Action,
    Traverse,
    Eva,
  ],
  entities: [
    Mission,
    User,
    Layer,
    Preset,
    STM_Objective,
    STM_Goal,
    STM_Investigation,
    Poi,
    Action,
    Traverse,
    Eva,
  ],
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  allowGlobalContext: process.env.NODE_ENV === "test",
};

export default config;
